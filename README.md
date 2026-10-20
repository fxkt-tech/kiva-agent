# Kiva Agent

Kiva 是一个项目内自包含的 Pi Agent。Pi、Agent 资源、第三方插件声明和运行状态都由本仓库管理，不依赖全局安装的 `pi`。

## 环境

- Node.js 22.19 或更高版本
- pnpm 12.14（建议通过 Corepack 启用）

## 开始使用

```sh
corepack enable
pnpm install
pnpm start
```

首次启动后使用 `/login` 配置模型提供方。认证信息保存在被 Git 忽略的 `.kiva/agent/` 中。

也可以直接启动 Web UI：

```sh
pnpm web
```

启动后访问 `http://127.0.0.1:30141`。点击左上角项目卡可以输入本机目录并切换工作区；Pi 的工作目录、文件浏览、Git 差异和会话都会随项目切换。模型、认证和 Kiva 扩展仍复用本仓库 `.kiva/agent/` 中的配置，各项目的会话保存在项目自己的 `.kiva/sessions/` 中。

Web UI 使用 Next.js、shadcn/ui 和 Tailwind CSS。构建或运行生产版本：

```sh
pnpm web:build
pnpm web:start
```

也可以把参数直接传给 Pi：

```sh
pnpm kiva --help
pnpm kiva -p "解释这个仓库"
```

## 插件

通过项目命令安装和移除插件，命令会强制使用 Pi 的项目作用域：

```sh
pnpm plugin:add npm:some-pi-package@1.2.3
pnpm plugin:remove npm:some-pi-package
```

安装命令要求 npm 精确版本、完整 Git commit SHA 或仓库内的本地路径；未固定的远程来源会被拒绝。Git tag 也可能被移动，因此不能作为可复现版本。通用 `kiva install/remove` 入口同样被禁用，防止绕过项目作用域。插件声明写入 `.pi/settings.json`；下载内容分别位于 `.pi/npm/` 和 `.pi/git/`，不会提交到 Git。

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
pnpm test
pnpm typecheck
node ./bin/kiva.mjs list --approve
```

终端 CLI 的工作目录固定为本仓库根目录。Web UI 通过 Pi RPC 运行项目，可在界面中选择其他本机目录作为工作区。
