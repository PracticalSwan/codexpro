# Workspace policy - CodexPro Full

CodexPro can load an optional `.codexpro-policy.json` from the root of each opened workspace. The file is local project policy: it can make the active global/profile configuration more restrictive, but it cannot grant new access or authority.

## Format

Schema `"version": 1` remains fully supported. Schema `"version": 2` adds ordered `toolRules` while preserving all version 1 fields. Supported fields are `blockedGlobs`, `importantFiles`, `recommendedVerification`, tighter `bashMode`, `writeMode`, `toolMode`, `codexSessions`, `analysisEnabled`, `allowGitPush`, `codeGraphEnabled`, `lspEnabled`, `artifactExportEnabled`, `goalsEnabled`, `limits`, and `analysisLimits`. Resource ceilings under `limits` include read/write/search/process/check/operation/archive/document/export limits plus `maxGoals`, `maxGoalTasks`, and `maxGoalWorkers`. Unknown fields are rejected.

```json
{
  "version": 1,
  "blockedGlobs": ["private/**"],
  "importantFiles": ["AGENTS.md", "package.json"],
  "recommendedVerification": ["npm run build", "npm run smoke"],
  "bashMode": "safe",
  "writeMode": "handoff",
  "limits": {
    "maxReadBytes": 120000,
    "maxBashTimeoutMs": 120000
  }
}
```

## Precedence and safety

Global/CLI/profile configuration establishes the ceiling. Workspace policy is applied after that configuration and uses the more restrictive value for modes and the lower value for numeric limits. Extra blocked globs are additive. `allowedRoots`, HTTP/tunnel authentication, host/port authority, credentials, and publication authority cannot be changed by workspace policy.

A missing policy preserves previous behavior. A malformed, oversized (> 65,536 bytes), non-regular, or symlinked policy fails closed when the workspace is opened. Policy contents are cached for the lifetime of the server process; restart CodexPro to intentionally reload a changed policy.

Use the read-only `effective_policy` MCP tool to inspect the configured/effective modes, limits, additional blocked globs, important files, and recommended verification. It intentionally omits absolute workspace paths, tokens, and secret-bearing configuration.

## Version 2 action/resource rules

Version 2 may add `toolRules` entries with `action`, `resource`, and `effect` (`allow` or `deny`). Rules are evaluated in declaration order and the last matching rule wins for each resource. No matching rule preserves the already-authorized global/profile behavior; an `allow` rule therefore never enables a tool or capability that is otherwise disabled.

Filesystem resources use workspace-relative POSIX-style paths, Bash resources use normalized full command text, and `git_push` resources use `remote/branch`. The `write` action is an umbrella restriction for `write`, `edit`, `apply_patch`, `prepare_change_set`, and `apply_change_set`; tool-specific rules still participate in declaration order, so the last matching rule wins. Prepared change sets are rechecked against their stored target paths immediately before application, and a deny on any member rejects the entire transaction before mutation. Multi-resource operations are denied when any target resolves to a deny rule. The `codexpro` supertool passes through the same evaluator as the explicit child tool. Interactive `ask` rules remain unavailable. MCP SDK v2 does not enable them by package version alone; until the connected ChatGPT client proves a supported server-driven approval path, `effect:"ask"` is rejected by policy validation and authority remains allow/deny only.

```json
{
  "version": 2,
  "toolRules": [
    { "action": "write", "resource": "generated/**", "effect": "allow" },
    { "action": "write", "resource": "secrets/**", "effect": "deny" },
    { "action": "bash", "resource": "npm run *", "effect": "allow" },
    { "action": "git_push", "resource": "origin/release-*", "effect": "deny" }
  ]
}
```
