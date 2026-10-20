# Kiva Agent

Kiva 是一个项目内自包含的 Pi Agent。Pi、Agent 资源、第三方插件声明和运行状态都由本仓库管理，不依赖全局安装的 `pi`。

## 环境

- Node.js 22.19 或更高版本
- npm

## 开始使用

```sh
npm install --ignore-scripts
npm start
```

首次启动后使用 `/login` 配置模型提供方。认证信息保存在被 Git 忽略的 `.kiva/agent/` 中。

也可以把参数直接传给 Pi：

```sh
npm run kiva -- --help
npm run kiva -- -p "解释这个仓库"
```

## 插件

通过项目命令安装和移除插件，命令会强制使用 Pi 的项目作用域：

```sh
npm run plugin:add -- npm:some-pi-package@1.2.3
npm run plugin:remove -- npm:some-pi-package
```

应固定 npm 版本、Git tag 或 commit。插件声明写入 `.pi/settings.json`；下载内容分别位于 `.pi/npm/` 和 `.pi/git/`，不会提交到 Git。

## 目录职责

```text
bin/                    Kiva 命令入口
src/runtime.mjs         本地运行环境和 Pi 进程管理
agent/                  Kiva 自有的 Pi package
  extensions/           TypeScript 扩展
  skills/               按需加载的能力
  prompts/              Prompt 模板
  themes/               TUI 主题
.pi/                    可提交的项目级 Pi 配置
.kiva/                  不提交的认证、会话和缓存
```

`.pi/APPEND_SYSTEM.md` 定义 Kiva 的常驻行为原则。`agent/extensions/kiva.ts` 提供 `/kiva` 命令，用于确认项目扩展已加载。

## 开发检查

```sh
npm test
npm run typecheck
node ./bin/kiva.mjs list --approve
```

当前实现是项目专用 CLI：无论从哪里调用，工作目录都会固定为本仓库根目录。需要让 Kiva 操作任意工作区或提供 Web/API 接口时，再引入 Pi SDK 和自定义资源加载器。
