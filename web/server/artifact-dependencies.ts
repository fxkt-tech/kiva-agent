import { extname } from "node:path";
import { parse as parseHtml, serialize, type DefaultTreeAdapterTypes } from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { parse as parseJs, type Expression, type SpreadElement } from "acorn";
import { simple } from "acorn-walk";

export interface ArtifactDependencies {
  references: string[];
  warnings: string[];
  /** Literal fetch URLs use the HTML document base, even inside an external script. */
  documentReferences?: string[];
  /** Imports and import.meta URLs use the script base; may overlap documentReferences. */
  scriptReferences?: string[];
}
export type ArtifactResourceBase = "document" | "resource";
type Site = "ordinary" | "fetch" | "module" | "script-url" | "map-key";
type ResourceVisitor = (reference: string, base: ArtifactResourceBase, site: Site) => string;

/** Syntax-only discovery. The preview owner resolves URLs and authorizes every resource. */
export function artifactDependencies(path: string, content: string): ArtifactDependencies {
  const references = new Set<string>(), warnings = new Set<string>();
  const documentReferences = new Set<string>(), scriptReferences = new Set<string>();
  visitArtifactResources(path, content, (value, _base, site) => {
    if (site === "map-key" || site === "module" && !urlLikeModuleSpecifier(value) || !value.trim()) return value;
    const reference = value.trim();
    references.add(reference);
    if (site === "fetch") documentReferences.add(reference);
    else if (site === "module" || site === "script-url") scriptReferences.add(reference);
    return value;
  }, (kind) => warnings.add(`${path}: could not fully parse ${kind}; some local dependencies may be unavailable.`));
  return { references: [...references], warnings: [...warnings], ...(documentReferences.size ? { documentReferences: [...documentReferences] } : {}), ...(scriptReferences.size ? { scriptReferences: [...scriptReferences] } : {}) };
}

/** Rewrite only parsed resource URL sites; authorization and URL mapping belong to the caller. */
export function rewriteArtifactResourceUrls(path: string, content: string, rewrite: (reference: string, base: ArtifactResourceBase) => string): string {
  return visitArtifactResources(path, content, (reference, base, site) => (site === "module" || site === "map-key") && !urlLikeModuleSpecifier(reference) ? reference : rewrite(reference, base), () => {});
}

function visitArtifactResources(path: string, content: string, visit: ResourceVisitor, warn: (kind: string) => void): string {
  const javascript = (source: string, module: boolean | "auto", resourceBase: ArtifactResourceBase): string => {
    const options = (asModule: boolean) => ({ ecmaVersion: "latest" as const, sourceType: asModule ? "module" as const : "script" as const, allowReturnOutsideFunction: !asModule });
    let tree;
    try {
      tree = module === "auto" ? (() => {
        try { return parseJs(source, options(true)); }
        catch { return parseJs(source, options(false)); }
      })() : parseJs(source, options(module));
    } catch { warn("JavaScript"); return source; }
    const replacements = new Map<number, { end: number; value: string }>();
    const replace = (node: Expression | SpreadElement | undefined, base: ArtifactResourceBase, site: Site) => {
      const value = literal(node);
      if (!node || value === undefined) return;
      const next = visit(value, base, site);
      if (next !== value) replacements.set(node.start, { end: node.end, value: JSON.stringify(next).replace(/</g, "\\u003c") });
    };
    simple(tree, {
      ImportDeclaration: (node) => replace(node.source, resourceBase, "module"),
      ExportNamedDeclaration: (node) => { if (node.source) replace(node.source, resourceBase, "module"); },
      ExportAllDeclaration: (node) => replace(node.source, resourceBase, "module"),
      ImportExpression: (node) => replace(node.source, resourceBase, "module"),
      CallExpression(node) {
        const callee = node.callee;
        const isFetch = callee.type === "Identifier" && callee.name === "fetch"
          || callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier"
            && ["window", "self", "globalThis"].includes(callee.object.name) && callee.property.type === "Identifier" && callee.property.name === "fetch";
        if (isFetch) replace(node.arguments[0], "document", "fetch");
      },
      NewExpression(node) {
        const base = node.arguments[1];
        if (node.callee.type === "Identifier" && node.callee.name === "URL" && base?.type === "MemberExpression" && !base.computed
          && base.property.type === "Identifier" && base.property.name === "url" && base.object.type === "MetaProperty"
          && base.object.meta.name === "import" && base.object.property.name === "meta") replace(node.arguments[0], resourceBase, "script-url");
      },
    });
    let result = source;
    for (const [start, replacement] of [...replacements].sort(([left], [right]) => right - left)) result = result.slice(0, start) + replacement.value + result.slice(replacement.end);
    return result;
  };

  const cssValue = (value: string, base: ArtifactResourceBase, importing = false): string => {
    const parsed = valueParser(value);
    let changed = false;
    const replaceString = (node: valueParser.StringNode) => {
      const current = cssUnescape(node.value), next = visit(current, base, "ordinary");
      if (next !== current) { node.value = cssQuote(next); node.quote = '"'; changed = true; }
    };
    if (importing) {
      const first = parsed.nodes.find((node) => node.type !== "space" && node.type !== "comment");
      if (first?.type === "string") replaceString(first);
    }
    parsed.walk((node) => {
      if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
      if (node.unclosed) { warn("CSS"); return false; }
      if (node.nodes.length === 1 && node.nodes[0].type === "string") replaceString(node.nodes[0]);
      else if (node.nodes.every((part) => part.type === "word" || part.type === "space")) {
        const current = cssUnescape(valueParser.stringify(node.nodes).trim()), next = visit(current, base, "ordinary");
        if (next !== current) {
          node.nodes = [{ type: "string", quote: '"', value: cssQuote(next), sourceIndex: 0, sourceEndIndex: 0 }];
          changed = true;
        }
      }
      return false;
    });
    return changed ? parsed.toString() : value;
  };
  const stylesheet = (source: string, base: ArtifactResourceBase): string => {
    let tree;
    try { tree = postcss.parse(source); }
    catch { warn("CSS"); return source; }
    let changed = false;
    tree.walkDecls((declaration) => { const next = cssValue(declaration.value, base); if (next !== declaration.value) { declaration.value = next; changed = true; } });
    tree.walkAtRules((rule) => { const next = cssValue(rule.params, base, rule.name.toLowerCase() === "import"); if (next !== rule.params) { rule.params = next; changed = true; } });
    return changed ? tree.toString() : source;
  };

  const html = (source: string): string => {
    const root = parseHtml(source), pending: DefaultTreeAdapterTypes.Node[] = [root];
    let changed = false;
    while (pending.length) {
      const node = pending.pop();
      if (!node) break;
      if ("tagName" in node) {
        const attributes = new Map(node.attrs.map((attribute) => [attribute.name, attribute.value]));
        const textNodes = node.childNodes.filter((child): child is DefaultTreeAdapterTypes.TextNode => child.nodeName === "#text");
        const text = textNodes.map((child) => child.value).join("");
        const updateAttribute = (name: string, transform: (value: string) => string) => {
          const attribute = node.attrs.find((item) => item.name === name);
          if (!attribute) return;
          const next = transform(attribute.value);
          if (next !== attribute.value) { attribute.value = next; changed = true; }
        };
        const resourceAttribute = (name: string) => updateAttribute(name, (value) => visit(value, "document", "ordinary"));
        const srcsetAttribute = (name: string) => updateAttribute(name, (value) => replaceSrcset(value, (url) => visit(url, "document", "ordinary")));
        const tag = node.tagName;
        if (["img", "script", "source", "audio", "video", "track"].includes(tag) || tag === "input" && attributes.get("type")?.toLowerCase() === "image") resourceAttribute("src");
        if (["img", "source"].includes(tag)) srcsetAttribute("srcset");
        if (tag === "video") resourceAttribute("poster");
        if (["image", "use"].includes(tag)) resourceAttribute("href");
        if (tag === "link") {
          const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
          if (rel.some((value) => ["stylesheet", "icon", "preload", "modulepreload"].includes(value))) { resourceAttribute("href"); srcsetAttribute("imagesrcset"); }
        }
        updateAttribute("style", (value) => stylesheet(value, "document"));
        for (const name of attributes.keys()) if (/^on[a-z]+$/.test(name)) updateAttribute(name, (value) => javascript(value, false, "document"));
        let nextText = text;
        if (tag === "style") nextText = stylesheet(text, "document");
        if (tag === "script" && !attributes.has("src")) {
          const type = (attributes.get("type") ?? "").trim().toLowerCase().split(";", 1)[0].trim();
          if (type === "importmap") {
            let map: unknown;
            try { map = JSON.parse(text); }
            catch { warn("import map"); }
            let mapChanged = false;
            const rewriteMap = (value: unknown): unknown => {
              if (!isObject(value)) return value;
              const result: Record<string, unknown> = {};
              for (const [key, target] of Object.entries(value)) {
                const nextKey = visit(key, "document", "map-key");
                const next = typeof target === "string" ? visit(target, "document", "ordinary") : target;
                if (nextKey !== key || next !== target) mapChanged = true;
                Object.defineProperty(result, nextKey, { value: next, enumerable: true, writable: true, configurable: true });
              }
              return result;
            };
            if (isObject(map)) {
              map.imports = rewriteMap(map.imports);
              if (isObject(map.scopes)) {
                const scopes: Record<string, unknown> = {};
                for (const [scope, values] of Object.entries(map.scopes)) {
                  const nextScope = visit(scope, "document", "map-key");
                  if (nextScope !== scope) mapChanged = true;
                  Object.defineProperty(scopes, nextScope, { value: rewriteMap(values), enumerable: true, writable: true, configurable: true });
                }
                map.scopes = scopes;
              }
              if (mapChanged) nextText = JSON.stringify(map).replace(/</g, "\\u003c");
            }
          } else if (["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) nextText = javascript(text, type === "module", "document");
        }
        if (nextText !== text && textNodes.length) { textNodes[0].value = nextText; for (const extra of textNodes.slice(1)) extra.value = ""; changed = true; }
        // Template declarations remain exact resources, not directory grants.
        if ("content" in node) pending.push(node.content);
      }
      if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push(node.childNodes[index]);
    }
    return changed ? serialize(root) : source;
  };

  const extension = extname(path).toLowerCase();
  if (extension === ".html" || extension === ".htm") return html(content);
  if (extension === ".css") return stylesheet(content, "resource");
  if ([".js", ".mjs", ".cjs"].includes(extension)) return javascript(content, extension === ".js" ? "auto" : extension === ".mjs", "resource");
  return content;
}

function literal(node: Expression | SpreadElement | undefined): string | undefined {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && !node.expressions.length) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}
function urlLikeModuleSpecifier(value: string) { return /^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(value); }
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function cssUnescape(value: string) {
  return value.replace(/\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|(\r\n|[\r\n\f])|([\s\S]))/gi, (_match, hex: string | undefined, newline: string | undefined, escaped: string | undefined) => {
    if (hex) { const code = Number.parseInt(hex, 16); return String.fromCodePoint(code === 0 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code); }
    return newline ? "" : escaped ?? "";
  });
}
function cssQuote(value: string) { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\d ").replace(/\n/g, "\\a ").replace(/\f/g, "\\c ").replace(/</g, "\\3c "); }

/** Follow srcset URL/descriptor states rather than splitting data URLs on commas. */
function srcsetTokens(source: string): { url: string; start: number; end: number }[] {
  const values: { url: string; start: number; end: number }[] = [];
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\t\n\f\r ,]/.test(source[index])) index++;
    const start = index;
    while (index < source.length && !/[\t\n\f\r ]/.test(source[index])) index++;
    let url = source.slice(start, index);
    if (!url) continue;
    if (url.endsWith(",")) { url = url.replace(/,+$/, ""); if (url) values.push({ url, start, end: start + url.length }); continue; }
    values.push({ url, start, end: index });
    let parentheses = 0;
    while (index < source.length) {
      const character = source[index++];
      if (character === "(") parentheses++;
      else if (character === ")" && parentheses) parentheses--;
      else if (character === "," && !parentheses) break;
    }
  }
  return values;
}
function replaceSrcset(source: string, rewrite: (url: string) => string) {
  let result = source;
  const tokens = srcsetTokens(source).map((token) => ({ ...token, next: rewrite(token.url) }));
  for (const token of tokens.reverse()) {
    if (token.next !== token.url) result = result.slice(0, token.start) + token.next + result.slice(token.end);
  }
  return result;
}
