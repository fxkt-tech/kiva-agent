# 现有能力及范围约束

- `web/features/files/workspace-browser.tsx`：会话文件入口读取 `/workspace` 列表及 `/files?path=`；预览为 `<pre>` 文本；共享目录提示已有明确产品文案。
- `web/server/scoped-transport.ts:169`：会话文件路由通过 repository.resolveWorkspace 解析执行目录，并复用项目文件读取实现。
- `web/server/workspace-files.ts:10`：readProjectFile 使用路径校验及受限文本读取，2 MB 上限；二进制包含 NUL 时拒绝文本预览。新增二进制资源应复用路径边界而非绕开校验。
- `web/features/sessions/composer.tsx:23`：允许 image/* 和 HTML 等文本附件；图片最大 10 MB，文本最大 1 MB，每次最多 5 个。
- `web/server/runtime-hub.ts:190`：文本附件通过 withTextFiles 拼接消息传给适配器，图片单独传入；不能假定附件已作为工作区文件保存。
- `web/components/shared/Markdown.tsx:41`：消息 Markdown 图片当前显示引用占位。
- `web/features/workspace/shell.tsx:147`：现有主导航包含会话、文件、代码变更，最终新增入口位置仍属产品决策。

本次仅本地代码调研，没有实现；用户已确认只列本会话生成或引用的文件，不展示整个目录，也不包含上传附件。

## 消息关联可用证据

- `web/shared/runtime-types.ts`：RuntimeMessage 保存文字及工具名称、参数、结果、状态，但不是文件产物注册表。RuntimeImage 为内嵌 base64，不保证磁盘路径。
- `web/server/runtime-hub.ts:538`：工具调用从原始 toolCall 块投影；配对 toolResult 后获取工具执行结果。可据结构化读写路径及消息显式文件链接关联，不能凭 bash 成功推断任意文件归属。
- `web/server/session-jsonl.ts`：原始 JSONL 资源有身份与大小边界，并可能截断；不能简单只扫预览前缀后宣称完整索引。
- `web/components/message-content.tsx`：消息及工具卡已有来源上下文；集中列表宜保留来源消息定位。

后续设计需区分“生成”和“引用”；文件系统存在只证明可读，不证明由本会话创建。HTML 是否执行脚本直接决定交互可用性及隔离设计，先向用户确认。

## HTML 交互隔离调研

用户确认需要执行 JavaScript。iframe 采用 `sandbox="allow-scripts"`，不启用 `allow-same-origin`、弹窗、表单或顶层跳转权限；只隔离 DOM 不足以禁止网络，必须同时使用 CSP 限制资源与连接。响应头 CSP 比仅插入 meta 更完整（包括 sandbox 等指令）。不能仅依赖 CORS，因为它不保证请求不会发送。

一手资料（2026-10-24 查询）：
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox

用户已确认需要联网，覆盖 CDN 脚本、字体、图片和外部 API；仍受浏览器 CORS 和 HTTPS 约束。隔离与本地资源交付细节需在 design.md 完成，浏览器验收验证 KivA API 不收到预览页面的恶意请求。

## 联网与仓库补充证据

- `web/server/session-repository.ts:56` 附近已有 parse/migrate/buildSessionProjection 的 passive 历史投影；应复用其语义但避免重复同步全历史读取。
- `web/server/scoped-transport.ts:35` 附近只对非 GET 做常规 Origin 校验；预览隔离需对来自 opaque/cross-site 的业务读取也做明确拒绝，且不能把 CORS 当作请求发送防护。
- 首版采用同一 HTTP server 的专用预览资源路径，响应 CSP sandbox 和 iframe 双层 opaque origin，无需第二端口。资源 CORS 仅对限定 capability 资产开放，不对 API 开放。
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS ：跨域 API 依赖目标授权，sandbox Origin 可能为 null；禁止声称支持任意第三方 API。
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin ：不要向业务接口广泛放行 null，匿名公开资源可用 * 且不带 credentials。
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy ：CORP 限制资源交付，不替代请求权限。

精确工具参数、来源分支、依赖解析器及真实浏览器的 opaque ESM/CORS 行为作为实施第一关，若契约不能满足需回到规划，不能放开 allow-same-origin 作为补丁。

## 交互修订（用户明确指定）

会话右侧直接显示文件列表；每项支持弹窗/新标签页/右侧三种预览，默认弹窗。替换之前“顶部入口再开面板”的提议。新标签页不能沿用原会话关闭即撤销的 lease，需要独立宿主页、独立授权与刷新重建；iframe 沙箱仍禁止页面代码自行弹窗，用户在可信列表触发的新标签页是宿主操作，不扩大文档权限。
