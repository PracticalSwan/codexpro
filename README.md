<p align="center"><img src="docs/favicon.svg" width="72" height="72" alt="CodexPro Full logo"></p>
<h1 align="center">CodexPro Full</h1>
<p align="center">A local MCP bridge for safe ChatGPT development workflows on your own computer.</p>

<p align="center">
  <a href="https://github.com/PracticalSwan/codexpro/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/PracticalSwan/codexpro/ci.yml?branch=main"></a>
  <a href="https://github.com/PracticalSwan/codexpro/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/PracticalSwan/codexpro"></a>
  <a href="LICENSE">License</a>
</p>

## What it does

CodexPro Full connects a compatible ChatGPT MCP client to **workspaces you explicitly authorize**.

- **Understand code:** guarded file reading, repository search, Git context and CodeGraph integration
- **Edit safely:** patching, preflight secret checks, checkpoints and reviewable change sets
- **Verify work:** trusted tests, builds, process/job status and source-linked verification evidence
- **Resume context:** bounded handoffs, operation recovery and optional read-only Codex transcripts
- **Inspect artifacts:** images, documents, tables and safe file export

It is a local, workspace-scoped development bridge, **not** an autonomous agent platform, cloud source index or general-purpose remote desktop.

## Quick start

Requires **Node.js 20+** and a supported Windows or Linux environment.

Install the current verified public release:

```powershell
npm install -g https://github.com/PracticalSwan/codexpro/releases/download/v0.34.1/codexpro-full-0.34.1.tgz
codexpro setup
codexpro doctor
codexpro start
```

Use `codexpro setup` to choose allowed workspace roots and a connection method. Follow [Getting Started](GETTING_STARTED.md) to connect a ChatGPT MCP client. CodexPro **does not start automatically**; the next release appears on [GitHub Releases](https://github.com/PracticalSwan/codexpro/releases) only after verification.

## Safety and privacy

Workspace restrictions, authentication, redaction, mutation approvals, project hooks and process ownership are enforced locally. Credentials and runtime profiles stay outside the repository. Durable Goals never silently commit, push or deploy. See [Security](SECURITY.md).

## Documentation

- [Installation and ChatGPT connection](GETTING_STARTED.md)
- [Feature map](FEATURES.md) and [advanced workflows](docs/usage-workflows.md)
- [FAQ and troubleshooting](FAQ.md)
- [Workspace policy](docs/workspace-policy.md), [trusted hooks](docs/hooks.md) and [checkpoints](docs/checkpoints.md)
- [Changelog](CHANGELOG.md) and [contributing](CONTRIBUTING.md)
- [Project website](https://practicalswan.github.io/codexpro/)

CodexPro Full is an independently maintained fork of [rebel0789/codexpro](https://github.com/rebel0789/codexpro), distributed as `codexpro-full` while preserving the `codexpro` CLI name.
