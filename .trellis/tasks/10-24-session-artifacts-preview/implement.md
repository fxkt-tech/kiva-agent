# 实施计划

## 顺序
1. 先完整读取 visual-system.md（超出自动注入上限，不能仅依赖截断注入），再复核 Pi 1.3.0 工具参数、当前分支/继承语义与稳定 entry ID；用真实格式临时 JSONL 固化生成/引用/失败/上传排除规则。
2. 先做独立临时 fixture 验证 opaque sandbox、同源专用资源路由、ESM/CSS/字体/JSON、HTTPS 联网与 KivA API 隔离。确认解析器和本地依赖闭包可行；若不能满足设计，返回规划。
3. 实现独立 SessionArtifactReader、DTO/边界解码及 passive repository seam；按需异步读历史，完整性与预算明确，在途合并不变成永久缓存。
4. 抽取现有文件校验/读取共用 owner，增加受限二进制及图片响应，不改变现有 files/changes 语义。
5. 实现 lease 白名单、CSP 响应、匿名资产 CORS、业务 origin 隔离、撤销/过期和 server.close 清理；不暴露全文目录或秘密文件。
6. 会话内默认可见的右侧文件栏；共用预览组件支持默认弹窗、行内新标签页链接及右侧分区预览。新增轻量新标签页宿主页，独立 lease 与刷新恢复；保留会话和草稿，来源定位稳定 ID，错误/空态/完整性使用共用 Alert；窄屏抽屉、焦点、Escape、全屏、迟到响应隔离。
7. 接入工具/回合完成刷新，文件当前版本提示，手动刷新；旧历史、压缩、fork、归档/工作区移除行为验收。
8. 完整 Trellis check、规范更新判断、最后审阅。用户已批准实施；完成代码与校验，本轮不自行提交或推送。

## 验证
- 单元/集成：两个共享目录会话、独立 worktree、同名路径、编码/空格/Unicode 文件名、多来源去重、继承/分支/失败工具、bash 无路径、不扫描附件/代码块、历史超过 JSONL 预览前缀后仍可被索引。
- 受限资源：穿越/双编码/符号链接/FIFO/根替换、超限/超时/损坏/EOF、缺失/删除/改名、MIME/SVG、精确资产白名单、过期/撤销/不跨会话。
- 隔离浏览器 fixture：脚本交互和本地相对资源、可控 HTTPS CDN/CORS API、跨域拒绝；父 DOM/storage/API/WS、无 CORS fetch、直接打开 URL、导航、令牌泄漏；正常应用 API/WS 与本地客户端兼容。
- UX：1440/390/320px、明暗、列表默认可见/折叠，弹窗默认动作/关闭焦点、右侧分区切换/关闭、新标签页无 opener/刷新恢复/原会话切换后继续使用、全屏/刷新、草稿与运行保留、跨会话迟到请求、无产物/更新提示、已移除工作区/legacy。
- 检查：`pnpm typecheck`、`pnpm test`、`pnpm web:build`、`git diff --check`、`python3 .trellis/scripts/task.py validate .trellis/tasks/10-24-session-artifacts-preview`。项目未定义独立 lint 命令，不虚报已运行。
- 性能：列表隐藏零产物请求；桌面列表可见按需读取且零正文读；显式预览才有界读取文件；三种模式复用实现、独立授权；长历史与多会话并发时事件循环保持可响应，工具流不按 token 全扫。

## 风险 / 回滚
文件归属识别有明确证据边界，任意 shell 产物不完整；HTML 联网并不能绕过外部 CORS。依赖闭包、opaque ESM 和 API Origin 兼容是首要验证点，不推迟到 UI 完工。

主要影响：features/sessions、runtime stable source DTO、server/session-artifacts、shared/session-artifacts、server/workspace-files、scoped-transport、server composition、样式及临时浏览器 fixture。回滚时关闭产物入口、撤销所有内存 lease，删除新增路由；不需回滚用户历史或文件，因为不迁移/写入它们。

保护当前无关改动：web/next-env.d.ts、hexagon-playground.html、triangle-trisection.html；以实施开始时 git status 为准，不覆盖、不顺手提交。

## 开始条件
用户审阅最新最终方案并明确要求实施后，才 task.py start 并派发 trellis-implement。若实施前验证要求改变首版范围，先更新三份文档并重新审阅。

## 当前追加实施：外部会话文件
- 用户已确认去除工作区目录限制，不增加导入步骤；更新关联投影、精确文件读取、依赖虚拟 URL 图及租约身份检查。
- 后端与现有项目文件 helper 分离授权语义，复用安全普通文件字节读，不把 `/` 作为项目根或提供任意路径 API。
- 追加外部图片/HTML、../ 明确引用、路径别名、跨目录 CSS/ESM/JSON、未授权文件/替换/跨会话和已有 files/diff 不回归测试。
- 主会话使用隔离 fixture 从工作区外生成资源，在默认弹窗/右侧/新标签页验证交互与依赖；待新一轮实现和检查后更新 validation/commit-plan，之前质量记录仅代表修订前状态。

## 当前追加实施：透明 header 与完整折叠
- 用户明确要求会话中央区透明 header + 右侧切换按钮；改由会话布局拥有折叠控制，删除侧栏内部折叠/展开窄条。
- 桌面完全隐藏侧栏与占位，窄屏统一抽屉入口，不重复按钮；不重建消息/runtime/composer 或影响独立标签页。
- 定向 UI/routed 测试 + 类型检查，真实浏览器验证透明度、折叠后零侧栏宽度/消息区域扩展、滚动与草稿保留、320/390px 移动导航/抽屉兼容。

## 当前追加实施：文件列表与浮动预览气泡
- 同一任务内替换固定侧栏/移动抽屉：header 使用共享 Popover，默认收回，重复点击切换。
- 气泡预览替换侧预览，独立于列表，标题拖动、手柄缩放、关闭；保护 iframe 状态、指针取消/捕获、键盘操作、视口变化和新标签页隔离。
- 桌面气泡打开时适度将消息/输入阅读区左移，全部收回恢复，小屏不强制压缩；不得重建内容或复活固定侧栏。
- 更新 UI/routed 用例与真实浏览器拖拽、宽高缩放、iframe 交互状态、列表 toggle、会话可操作、手机320/390/旋转边界验证，再做独立检查。

## 当前微调检查
替换 header 图标与输出标题，阻止 Popover outside-press/focus-out 自动收回。定向 UI/routed 测试、类型检查、真实浏览器验证外部点击/输入不关闭且按钮收回和默认预览正常。保持现有非模态气泡、脚本状态、外部文件与 HTML 隔离能力。

## 当前四项追加实施
1. 后端独立负责稳定 raw newtab route 与同owner直接资源响应，保留精确能力图/CSP/无模型读取，增加 raw HTML/image/独立刷新与无包装测试。
2. 前端独立负责默认modal保留列表、44px紧凑条目、统一浮动header组合口/窄屏overflowmenu；去掉旧newtab宿主页及组件。
3. 验证列表filter/scroll/焦点与Escape层级、直接文档顶层无iframe/包装/工具栏、图片nativeMIME、外部本地依赖/API/刷新、浮动单层header的拖缩与状态保留、280/320宽度控件可达。
4. main统一生产构建与真实浏览器验收；Trellis check独立复查；不提交、合并或推送。

## 默认 Modal header 微调验收
复用toolbar slot合并默认弹窗header，定向UI/routed测试和typecheck，再生产浏览器确认单栏、源码/图片工具、320px控件、list保留/focus/Escape及iframe状态。无后端或rawtab语义变化。
