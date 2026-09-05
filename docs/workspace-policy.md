# Workspace policy - CodexPro Full

CodexPro can load an optional `.codexpro-policy.json` from the root of each opened workspace. The file is local project policy: it can make the active global/profile configuration more restrictive, but it cannot grant new access or authority.

## Format

The current schema uses `"version": 1`. Supported fields are `blockedGlobs`, `importantFiles`, `recommendedVerification`, tighter `bashMode`, `writeMode`, `toolMode`, `codexSessions`, `analysisEnabled`, `allowGitPush`, `codeGraphEnabled`, `lspEnabled`, `artifactExportEnabled`, `goalsEnabled`, `limits`, and `analysisLimits`. Resource ceilings under `limits` include read/write/search/process/check/operation/archive/document/export limits plus `maxGoals`, `maxGoalTasks`, and `maxGoalWorkers`. Unknown fields are rejected.

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
