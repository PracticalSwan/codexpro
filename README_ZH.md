<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexPro Full logo">
</p>

<h1 align="center">CodexPro Full</h1>

<p align="center">
  让 ChatGPT 在你明确允许的本地仓库上使用编码工具。
</p>

<p align="center">
  <a href="https://github.com/PracticalSwan/codexpro/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/PracticalSwan/codexpro/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/PracticalSwan/codexpro/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/PracticalSwan/codexpro?style=flat-square"></a>
  <img alt="Stable release 0.33.0" src="https://img.shields.io/badge/stable-0.33.0-2563eb?style=flat-square">
  <img alt="Main 0.33.0" src="https://img.shields.io/badge/main-0.33.0-0f766e?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="https://github.com/PracticalSwan/codexpro">GitHub</a>
  ·
  <a href="FAQ_ZH.md">中文 FAQ</a>
  ·
  <a href="SECURITY.md">安全说明</a>
</p>

## CodexPro Full fork status

`PracticalSwan/codexpro` is the canonical independently maintained fork. It preserves the `codexpro` CLI/MCP/profile compatibility surface while maintaining the 0.31-0.32 feature line. Upstream remains `rebel0789/codexpro` under the existing MIT lineage.

稳定发布版是 **0.33.0**；当前 main 属于 0.33.0 发布线。此版包含 Plans 38–46 的运行时溯源、诊断、代码上下文、只读 notebook/表格/依赖检查及默认关闭的本机 HTTP 检查，并保留 0.32.4 的 Tunnel 和 Windows 稳定性修复。

CodexPro Full uses the independent distribution package **`codexpro-full`** while the installed CLI remains **`codexpro`**. GitHub Releases are the canonical public release channel. The upstream npm package `codexpro@latest` is not this fork, and `codexpro-full` is not yet published to npm.

## 它是什么

CodexPro 是本地 MCP server。它连接**你的 ChatGPT 会话**、**你的机器**和**你允许的仓库**。

ChatGPT 可以读取、搜索、编辑、审查、验证、导入附件，并写 handoff 计划。范围始终限制在这些 root 内。

它不是托管 SaaS、模型代理、配额绕过、账号池或远程 shell 服务。

## 安装

GitHub Release:

```bash
npm install -g https://github.com/PracticalSwan/codexpro/releases/download/v0.33.0/codexpro-full-0.33.0.tgz
codexpro --version
```

上面的 tarball 是稳定版 0.33.0，包含 Plans 38–46 与 Tunnel heartbeat / child recovery。只有未来出现 Unreleased 更新时，才从 main 构建。

Source build:

需要：

- Node.js 20+
- 能创建自定义 MCP 插件的 ChatGPT 账号
- OpenAI Secure MCP Tunnel 的 `tunnel_...` ID；只有使用 HTTP 回退时才需要公网 HTTPS 地址

```bash
git clone https://github.com/PracticalSwan/codexpro.git
cd codexpro
git checkout main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.33.0.tgz
codexpro --version
```

## 在 ChatGPT 中连接

1. 在 ChatGPT 的 `Settings -> Apps -> Advanced settings` 打开 **Developer mode**；Business / Enterprise / Edu 可能需要 workspace 管理员先启用。
2. 保持 CSP enforcement 开启（如果当前界面提供该开关），然后打开自定义 App / MCP 连接界面。
3. 创建名为 `CodexPro` 的自定义 MCP App/连接。
4. 连接方式优先选择 **Tunnel**，并填写 OpenAI Platform 创建的 `tunnel_...` ID。
5. 本机 `codexpro start` 会启动并监管官方 `tunnel-client`。0.32.4 及后续版本在 tunnel 子进程退出或持续 not-ready 时只替换该子进程，不重启本地 MCP runtime。OpenAI runtime API key 可用 `codexpro openai-key save` 保存到受保护的用户级 secret 文件，或只通过当前会话环境变量提供；不要保存到 workspace profile。

OpenAI Tunnel 模式不需要把 CodexPro token 放进 ChatGPT URL。CodexPro 仍在本机 loopback MCP hop 上保持 bearer token 保护，并由 `tunnel-client` 通过环境引用转发该 header。

> ChatGPT 的自定义 App / MCP 界面标签会随 plan/client 变化；以当前 Apps / Developer mode 界面为准，选择 Tunnel 并使用与 CodexPro 相同的 `tunnel_...` ID。

同一仓库日常启动：

```bash
codexpro start
```

如果创建插件失败，运行 `codexpro connection-test`，确认 ChatGPT 请求是否到达本地 server。

## ChatGPT 能做什么

在 workspace write 模式（常规 agent 设置）下：

- 读取、搜索、检查仓库
- 用 `write`、`edit` 或受保护的 `apply_patch` 编辑
- 用 `import_file` 导入 ChatGPT 附件
- 用 `bash` 运行白名单检查
- 用 `show_changes` 审查 diff
- 在 `.ai-bridge` 下写计划
- 为不能调工具的会话导出 context bundle

## 多项目

一个 CodexPro 进程可以允许多个仓库：

```bash
codexpro settings set --project ~/code/web --project ~/code/api
codexpro settings show
codexpro start
```

让 ChatGPT 对已允许项目执行 `open_workspace`。`open_current_workspace` 切回启动仓库。

两个 ChatGPT 账号或需要硬隔离时，用不同本地端口和不同 Tunnel ID（或不同 HTTP 回退 URL）跑两个 CodexPro 进程。

## 命令

```bash
codexpro setup
codexpro start
codexpro start --root /path/to/repo
codexpro doctor
codexpro connection-test
codexpro settings
codexpro inspect
codexpro review
```

常用模式：

```bash
codexpro start --no-bash
codexpro start --tool-mode minimal
codexpro start --tool-mode full
codexpro start --mode handoff
codexpro start --mode pro
codexpro start --headless
```

可选工具卡片：

```bash
CODEXPRO_TOOL_CARDS=1 codexpro start
```

## 连接方式

默认是 OpenAI Secure MCP Tunnel：

```bash
# profile 已保存 tunnel ID 后，日常启动
codexpro start

# 显式 OpenAI 模式
codexpro start --tunnel openai --openai-tunnel-id tunnel_...
```

现有 HTTP tunnel 继续作为回退：

```bash
codexpro ngrok --hostname your.ngrok-free.dev
codexpro start --tunnel cloudflare
codexpro stable --hostname codexpro.example.com --tunnel-name codexpro
codexpro tailscale --hostname your-device.your-tailnet.ts.net
codexpro start --tunnel none
```

从已保存的 ngrok profile 迁移到 OpenAI 后，CodexPro 会保留 ngrok hostname/config 作为显式 `codexpro ngrok` 回退。HTTP 回退使用稳定主机名时请固定 token：

```bash
mkdir -p ~/.codexpro
openssl rand -hex 32 > ~/.codexpro/http-token
chmod 600 ~/.codexpro/http-token
```

客户端支持 header 时优先用 `Authorization: Bearer <token>`。`?codexpro_token=` 只用于 HTTP 个人兼容回退。

## 安全默认

- 公网 tunnel 需要 CodexPro HTTP token（至少 24 bytes）
- 非 workspace write 模式不暴露写入工具
- 默认 safe bash
- 拦截 `.env`、密钥、`.git`、构建缓存等路径
- 附件导入只接受已批准 HTTPS 主机上的 ChatGPT Apps SDK 文件对象
- 当前 `main` 的本地 handoff executor 默认阻止标准 Git/GitHub 远程 mutation；只有显式授权后才使用 `--allow-remote-mutations`
- interrupted/orphaned handoff 必须先核对 Git 和目标状态，再重试可能产生远程或持久副作用的操作

公网暴露前先读 [SECURITY.md](SECURITY.md)。

## 更新

```bash
git pull origin main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.33.0.tgz
codexpro --version
```

更新后重启 `codexpro start`。`~/.codexpro` 下的配置会保留。

## 文档

- [中文网站](https://practicalswan.github.io/codexpro/zh.html)
- [Getting Started / 多项目设置](GETTING_STARTED.md)
- [中文 FAQ](FAQ_ZH.md)
- [Security](SECURITY.md)
- [稳定 URL 指南](DOMAIN_SETUP.md)
- [Changelog](CHANGELOG.md)
- [Contributors](CONTRIBUTORS.md)
