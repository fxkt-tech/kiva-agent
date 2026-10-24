# 技术方案：会话产物

## 1. 边界与界面
单一端到端任务：索引、受限资源服务和会话面板共同构成可验收能力，不拆为可单独上线的子任务。现有项目“文件”页继续承担目录浏览。

会话保持全宽消息与输入布局，不再有固定右侧文件栏或移动文件抽屉。会话内透明48px header 保留，右侧一个文件按钮作为 Base UI Popover trigger：默认关闭，点击在按钮下方靠右弹出列表气泡，再点收回；列表高度/宽度受可用视口约束，内部滚动。列表按图片/HTML过滤，同路径合并，提供刷新、来源及可用性提示。

每行三种操作：默认点击打开共享 Dialog，原有新标签页链接保留，原“右侧预览”替换为“气泡预览”。默认 Dialog 独立于会被收回的列表内容子树，关闭时焦点回原触发点（仍存在时）或 header 按钮。新标签页使用无 opener 的稳定 scope/artifact URL，但由 custom HTTP server 直接返回原文档/图片响应，不再渲染 App Router 宿主页或 iframe；详见最新直接文档契约。

首版一个非模态浮动预览窗口，与已收回列表独立。拖动标题栏移动，拖动尺寸手柄调整宽高，提供关闭按钮及键盘移动/尺寸操作；不得靠移动 iframe 或重建 ArtifactPreview 实现。使用本项目 overlay-layer 约定的 portal/layer，默认位置靠右，在视口缩小时约束边界/最低可用大小；拖动/缩放指针捕获、取消与跨 iframe 情形处理完备，仅操作期间可用遮罩，不阻断平时会话点击/滚动。选择另一文件替换本窗口并回收旧实例，关闭或切换会话销毁其 iframe/lease，独立新标签页不受影响。列表收回/打开、几何变化不销毁当前预览。

桌面足够宽时任一列表/预览气泡打开会调整消息和输入阅读区的对齐，使其适度向左减少初始靠右气泡遮挡；不重新引入实体侧栏或缩小整个中央容器。全部关闭恢复居中，窄屏优先可读宽度。浮窗拖到其他位置或过大时不追逐指针重建会话；采用简单、有限的布局规则，不引入全局窗口管理系统。消息/runtime/composer保持原挂载与草稿。

来源定位仍使用稳定 transcript entry ID + content block/toolCall ID，压缩后来源可用 JSONL 查看。

## 2. 清单投影
新增 SessionArtifactReader 与轻量 shared/session-artifacts.ts 合约。仓库负责 exact project/session 历史所有权和 resolveWorkspace；读取器只投影一个会话的当前可见分支，采用 Pi parse/migrate/projection 语义，不把所有历史分支混在一起。不调用 SessionManager.create/open 等可能写入的操作，不获取运行时。

规范化候选来源：
1. 成功 write/edit 等已知工具的明确 path（绑定成功 toolResult）；read 标为引用；工具适配表基于安装的 Pi 1.3.0 实际参数，不猜字段。
2. 消息 Markdown 图片/文件链接以及明确的本地路径 token（含行号后缀处理）；不扫思考、代码块、上传附件编码文本。工具文本输出中的明确路径只标引用，不推断 bash 创建。
3. 相对引用以会话记录的执行目录解析；绝对引用可位于任意目录。先保留来源语义并做一次 URL 解码，再解析并规范化精确文件身份；不将其他项目同名文件当作缺失文件的替代。路径别名需按真实文件处理。

ID=scope + 规范化文件定位的稳定摘要（保留已有工作区内 ID 兼容时优先）；DTO 含 kind、path、relations、sources、lastReferencedAt、availability、currentVersion 标识；sources 使用稳定原始记录 ID，不用模型生成文件名作为身份。标为生成/修改只表示有成功工具记录，不证明文件此前不存在。继承/续接记录单独标为继承引用；必要时以 sourceSessionId 历史关系识别，不伪造来源。

列表可见时按需异步流式读取，内存只留当前分支必需结构/产物；初始预算：历史总量 64 MiB、单记录 8 MiB、候选 10,000、处理 deadline 10 秒。超限返回明确不完整/失败状态和重试提示，不静默遗漏。完整性状态独立于“无产物”。并发相同 scope/历史文件身份只共享在途 Promise，完成即释放；无持久索引、TTL 或全目录 watcher。文件可用性有界并发检查，清单不读正文。面板内存可保留上次结果但标明 refreshing；历史追加/分支变化/生命周期事件失效，不按 token 刷新。

## 3. HTTP 合约
- GET `/api/projects/:projectId/sessions/:sessionId/artifacts` → scoped list + completeness + revision；仅在列表可见时调用；桌面默认加载，折叠/窄屏未展开不加载。
- GET `.../artifacts/:artifactId/content` → 已关联文件的文本/图片受限读取；客户端不能提交任意绝对路径。
- POST `.../artifacts/:artifactId/preview` → 显式创建内存短期 preview lease，返回随机不可猜 token 对应文档 URL。POST 遵守主应用 Origin 守卫；只创建临时预览能力，不执行模型、命令或修改会话。
- DELETE `.../artifacts/previews/:leaseId` → 关闭该预览实例时撤销；该实例切换文件/刷新撤旧建新。弹窗、侧栏及每个新标签页各自拥有 lease，原会话关闭或切换不得批量撤销新标签页授权。15 分钟空闲过期，总寿命最多 1 小时，需界面显式刷新重建；应用关闭清空。
- GET `/preview/:token/<relative-document-or-asset-path>` → 只提供该 lease 白名单内资源；无目录枚举、任意文件参数、重定向、代理和业务 API。lease 绑定 scope、顶层 artifact、每项文件的规范路径/身份及显式依赖集合；每次复核会话及文件身份。资源映射改为精确文件定位，允许工作区外文件与依赖；每个虚拟 URL 只匹配该 lease 授权的具体文件，不把全盘设置为项目根。正文 2 MiB，单图/资源 10 MiB，依赖最多 256 个，总预算 32 MiB，超限不截断执行。

产物 content 与 preview 通过统一的有界普通文件读取 owner 复用 descriptor 身份复核：阻止客户端伪造未知文件定位、多重编码、NUL、替换型符号链接及 FIFO，异步读取后重新验证；明确会话引用中的 ../ 是合法定位，不等同未经授权的 HTTP 路径穿越。图片按 image MIME + nosniff 交付；SVG 内容响应同样设置无脚本 CSP sandbox，禁止直接顶层访问时变成可执行文档或加载外部资源。新增二进制能力不改变现有 files/diff 的文本协议。工作区移除不应仅凭目录缺失阻止仍可确切定位的外部绝对引用；缺失的相对文件不回退源项目。

## 4. HTML 与本地相对依赖
不启动第二个服务器：由现有 custom server 提供专用 preview 路径，不增加进程/端口和生命周期管理。HTML 文档响应通过 CSP `sandbox allow-scripts` 强制 opaque origin；iframe 再声明 `sandbox="allow-scripts"`，不得加 allow-same-origin。响应级 sandbox 也覆盖直接打开 URL 的情形。父页面不直接注入用户 HTML 到 DOM。

保留相对资源 URL 目录结构，并通过解析后的 HTML/CSS/JS 明确依赖闭包创建精确允许列表：HTML src/srcset/link/module、CSS url/@import、ES module literal imports 及 literal 本地 fetch URL。使用语法解析器而非正则重写整份 HTML。依赖可含相邻、父级目录及明确的绝对本地路径，通过虚拟 URL 到精确文件的映射交付；保留凭据/环境文件、可执行文件及不支持 MIME 的过滤，但不因顶层图片/HTML 在工作区外或某个目录下而整体拒绝。顶层条目仍只显示图片和 HTML，CSS/JS/JSON/字体等只作为依赖交付。不能把一个 HTML 的目录整体变成可读。

变量拼接的任意本地依赖、service worker、开发服务器路由、构建源码首版不承诺支持；依赖未收录显示诊断，用户可将文件做成自包含 HTML。模块/字体/JSON 从 opaque origin 请求时，仅 token 资源路由提供匿名 CORS（`*`，无 credentials），KivA API 绝不开放 `null` 或通配 CORS。lease token 已是限定读取能力，不能同时拥有主应用权限；对外不发送 Referer，token 不写日志/历史/外部 URL。

## 5. 联网与隔离
允许页面使用 HTTPS CDN/字体/图片/匿名 API，以及 wss 外部连接；遵守外部服务对 opaque/null Origin 的 CORS。KivA 不代理外部网络，不注入 API key、登录 Cookie 或系统代理凭据。浏览器请求遵循浏览器网络配置，与另一项尚未实现的模型系统代理开关无依赖。

CSP 采用 default-src none，按类型开放 https: 和当前 lease 精确资源 URL 前缀；script/style 允许内嵌，首版不启用 unsafe-eval；img 允许 data/blob；connect 只允许 https:/wss: 及授权本地资源路由；base-uri none，object/frame/worker/form-action 禁止。缺省禁止弹窗、下载、表单、顶层导航、设备权限。外部 HTTPS API 能接收此页面自行发送的数据，这是联网预览的正常行为；不能承诺页面无法向互联网发送内容，也不承诺沙箱能限制 CPU/内存。

主服务已有非 GET Origin 守卫，补齐预览威胁下的 API 隔离验证：Origin:null/不受信 Origin 的业务请求（含 GET）拒绝，跨站 Fetch Metadata 资源读取拒绝；保留正常同源浏览器与无 Origin 的受支持本地客户端。无业务端点增加 CORS 放行。WebSocket 沿用严格 origin 校验；postMessage 不提供通用文件读取或命令桥，诊断消息需 source window + lease ID 校验，不能以 origin:null 作为可信身份。服务器层隔离是主机制，不靠覆盖 fetch 或可被用户脚本改写的 JS 防护。

## 6. 兼容及刷新
旧会话按可读历史及记录 cwd 解析文件；归属不明时保留来源不可预览。记录的目录已移除时，仍可确切定位且存在的外部绝对文件继续可预览，不将缺失相对文件映射到源项目。不写 JSONL、不迁移数据。文件预览展示当前内容，手动刷新重新读取并换文档执行环境，不悄悄刷新导致表单/动画状态丢失。回合完成更新列表，有修改的当前预览提示“文件已更新，刷新预览”。关闭对应预览销毁其 iframe、撤销其 lease；新标签页独立存活，关页清理为尽力执行，服务端超时保证回收。新标签页重新加载通过其宿主页重新解析文件身份，不依赖已过期的 token。

## 7. 实施前验证关口
先用临时文件和真实浏览器验证：内嵌脚本、相对 CSS/ESM/JSON、HTTPS CDN 与匿名 CORS API；直接访问 preview URL 仍为 opaque；对父 DOM/storage/API/WS 的读写均被拒绝；已引用外部文件、本地依赖跨目录、未授权路径、lease 撤销、重定向与跨 scope 不泄露。使用本地可控 HTTPS/CORS 测试服务，无真实外部账号或付费请求。若浏览器实际兼容性与上述契约冲突，回到 planning 修改设计，不扩大白名单或静默放开同源权限。

## 已批准目录范围修订
本轮由“工作区内资源”改为“会话确证关联的本地文件 + 该文档精确依赖”。这是产物读取边界变更，既有项目 files/changes 读取规则保持原样。三种预览模式及响应级 opaque sandbox、业务 Origin 守卫继续生效。

## 先前透明会话 header 修订（气泡版本已替代侧栏控制）
header 属于持久会话布局，不因折叠重建消息或 composer。位于滚动区外/顶部覆盖时只让按钮接收点击，避免透明区域截获消息、滚轮或左侧移动导航；为顶部消息预留必要安全距离。移动端同一个 header 控件打开/关闭原文件抽屉，去掉重复悬浮文件按钮。折叠导致侧栏内预览卸载和其 lease 撤销；不影响独立新标签页。未选会话或文件/变更/独立预览页不新增此 header。

## 当前气泡修订
本节及第一节替代所有先前“侧栏”“侧预览”“移动抽屉”布局描述：只保留默认 Dialog、新标签页和独立可拖动/缩放/关闭的非模态预览气泡，header 控制列表 Popover。原后端外部文件定位、精确能力图、脚本隔离和三种宿主独立授权契约保持不变。

## 输出气泡持久展开微调
使用已安装 Base UI Popover 的公开 onOpenChange(reason)取消 outside-press/focus-out 关闭，不通过全局点击拦截或模态锁定保持气泡。普通外部点击和会话输入正常工作，显式 trigger toggle/Escape/预览选择可收回。列表标题与相关按钮文案为“输出”，项目文件浏览功能保留原名。Header 图标体现展开/收回状态。

## 最新直接文档与紧凑宿主修订（优先于旧新标签宿主描述）
custom server 直接拦截 GET `/artifact-preview/:projectId/:sessionId/:artifactId`，验证身份/方法/query/Origin/Fetch Metadata，建立独立内存 lease 后通过同一 preview resource response owner 输出原文档或图片，无重定向、包装HTML、iframe、KivA工具栏。地址栏保持稳定身份地址；刷新重新读取并创建新lease。HTML继续仅语法级资源URL重写，响应级 sandbox/CSP、精确资源图和大小/MIME限制保留。图片走原生 image MIME。关闭原会话或其预览不能撤销此tab的lease；直接文档没有宿主pagehide清理，遗留lease按TTL回收。旧Next宿主页与未使用组件移除，避免双重语义。

默认弹窗不再主动收回列表；原条目DOM仍在，保存filter/scroll，Modal置于列表层之上。Escape只关闭顶层Modal，不能顺带关闭背景列表。列表自己按钮/独立Escape继续可收回。

条目约44px：一组icon+name/可选parent path，inline关系/状态，右侧两枚常驻小操作按钮。无单独详情行，完整路径可访问，长文件名正确省略。

ArtifactPreview保留内容/lease/source/zoom/fullscreen状态，提供renderToolbar({controls,currentVersion})组合口；FloatingArtifact只提供统一header（拖动title、同一组工具、source入口、close），移除其外层重复heading及独立source row。路径/当前版本可sr-only/title；窄窗口以共享DropdownMenu收纳次要操作，只有一层header且控件不溢出。原图片缩放/HTML源码/刷新/新tab/全屏能力不可丢失。

## 默认 Modal 单层 header
ArtifactDialog 复用 ArtifactPreview.renderToolbar，移除外层独立 heading 和默认内层 toolbar/source行。一个紧凑栏组合DialogTitle/name、srdescription/fullpath、共享compactcontrols及DialogClose；默认modal不提供拖动，浮动预览原有drag不变。列表不关闭及exactrowfinalfocus、Escape顶层边界继续保持；窄宽度使用已有More菜单。

默认 Modal 复用 compact More 菜单后，全屏时菜单portal必须进入当前全屏元素，否则bodyportal不可见。对共享DropdownMenuContent增加可选portalContainer（默认行为不变），仅ArtifactPreview全屏状态传入container ref；不手工移动DOM或改变全局菜单层级。验收包含菜单进入全屏、全屏菜单可见及退出，来源跳转焦点正常。
