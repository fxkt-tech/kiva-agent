# 实施顺序

当前仅规划。用户批准最终方案后才执行 task.py start，并按 workflow 建立实现分支。

1. 读取 frontend index、完整 visual-system、设置/主题、路由和侧栏列表规范；确认当前工作区非本任务改动，保留 web/next-env.d.ts 和两个用户 HTML 文件。
2. 新增 appearance.sidebarCollapsed 字段、默认值、逐字段解码、首屏 bootstrap、运行时根属性及外观设置项。验证旧数据、损坏字段、存储拒绝、重置与跨标签页。
3. 实现桌面252/64px布局与 header 切换、品牌链接、图标提示及选中态；保留移动抽屉与持久会话主体。
4. 接入单项目气泡及按需列表；先验证 SessionRows 对话框生命周期，必要时拆分稳定动作控制器，避免双份列表。接入搜索、新建、菜单、导航和焦点恢复。
5. 验证首次加载图标模式不会请求全部隐藏列表；布局切换不丢草稿、不改运行和队列。
6. 补充有意义的偏好兼容、状态生命周期和按需读取测试；执行类型检查、相关测试与生产构建。实际命令以 package.json 为准。
7. 浏览器检查桌面1440/1024、移动390/320、亮暗主题、刷新、两个标签页、嵌套 Escape、重命名/删除/JSONL 及已有输出气泡。
8. 按 trellis-check 完成质量门禁并更新相关规范/任务记录。生产构建如覆盖预先修改的 next-env.d.ts，恢复原始内容。未获得本轮提交授权时不提交/合并/推送。

## 预计影响
- web/shared/web-preferences.ts
- web/lib/web-preferences.ts、web/lib/theme-bootstrap.ts
- web/features/settings/preferences-panels.tsx
- web/features/workspace/shell.tsx、web/app/globals.css
- web/features/sessions/collections.tsx（仅在生命周期验证证明必要时拆分）
- 对应测试及前端规范

## 规划检查
`python3 .trellis/scripts/task.py validate .trellis/tasks/10-24-sidebar-icon-collapse`
`git diff --check`

## 实施结果
前端实现、规范同步、自动化与真实浏览器验证完成；独立审查已通过。完整证据见 research/verification.md。用户已授权提交、合并到 main、清理临时分支并推送。
