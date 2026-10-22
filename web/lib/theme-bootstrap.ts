import { WEB_PREFERENCES_KEY, WEB_PREFERENCES_MAX_LENGTH } from "../shared/web-preferences";

// Only allowlisted appearance values reach the DOM. Stored content never becomes script.
export const themeBootstrapScript = `(function(){var r=document.documentElement;try{var v=localStorage.getItem(${JSON.stringify(WEB_PREFERENCES_KEY)});var p=v&&v.length<=${WEB_PREFERENCES_MAX_LENGTH}?JSON.parse(v):null;var a=p&&p.version===1&&p.appearance;var t=a&&a.theme;if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);}else{r.removeAttribute("data-theme");}if(a&&a.visualStyle==="neumorphic"){r.setAttribute("data-visual-style","neumorphic");}else{r.removeAttribute("data-visual-style");}}catch(_){r.removeAttribute("data-theme");r.removeAttribute("data-visual-style");}})();`;
