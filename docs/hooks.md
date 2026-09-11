# Trusted project hooks

CodexPro can read an optional `.codexpro-hooks.json` from a workspace root. The file is inert until the exact file fingerprint is trusted locally with the CodexPro CLI.

## Trust boundary

Trust is stored outside the repository under the per-user CodexPro state directory. A trust record binds the workspace canonical realpath and SHA-256 of the exact hook file bytes. Changing the hook file invalidates trust automatically.

MCP exposes only `project_trust_status`. It cannot create or modify trust. Local trust commands are:

```bash
codexpro trust status --root /path/to/repo
codexpro trust hooks --root /path/to/repo
```

Opening a repository never executes hooks and never grants trust.

## User-global staged-commit safety hook

CodexPro also has one narrowly scoped user-global hook: the staged-commit safety gate used by this repository. It is **off by default** and can be enabled explicitly for one local CodexPro installation:

```bash
codexpro hooks staged-commit enable
codexpro hooks status
```

When enabled, it runs before `git_commit` in every CodexPro workspace for that OS user, including workspaces added later. It invokes the packaged `scripts/check-staged-commit.mjs` with the selected workspace as `cwd`, so the checks are identical everywhere without copying scripts into repositories. It blocks commits with no staged changes, blocked/sensitive paths, oversized staged files, `git diff --cached --check` failures, or supported secret-looking additions. Any execution/settings failure blocks `git_commit` rather than bypassing the gate.

This setting does **not** trust, enable, or execute any other project hook. `.codexpro-hooks.json` files keep the separate fingerprint-based trust boundary below. If a trusted project hook points to the same staged-commit script, CodexPro de-duplicates it while the user-global gate is enabled. Disable only this global gate with `codexpro hooks staged-commit disable`.

## Hook file

```json
{
  "version": 1,
  "hooks": {
    "before_tool": [
      { "command": "node", "args": ["scripts/check-policy.mjs"], "timeoutMs": 3000 }
    ]
  }
}
```

Supported events are exactly `session_start`, `before_tool`, `after_tool`, and `task_end`.

`task_end` is emitted only at explicit CodexPro-owned boundaries such as Goal review and terminal handoff completion. Normal chat turns do not create synthetic task boundaries.

## Execution semantics

Hooks execute directly as an executable plus argv array with `shell=false`. CodexPro does not parse or interpolate a shell command string.

Hook stdin is bounded JSON containing only the event and small lifecycle metadata. The parent process environment is not inherited; only the minimal process-launch variables needed by the platform are passed. Credentials, prompts, source contents, and unrestricted environment values are excluded.

Hook execution has independent timeout and output limits. `before_tool` exit code `2` blocks the tool before its handler begins. Exit `0` allows. Other non-zero exits and hook execution failures are warnings. `after_tool`, `session_start`, and `task_end` cannot retroactively change a completed tool result.

Workspace policy is evaluated before hooks. Hooks therefore cannot re-enable a tool/resource denied by global/profile configuration or `.codexpro-policy.json`.

## Configuration

Optional environment settings:

- `CODEXPRO_TRUST_DIR` — out-of-repository trust directory.
- `CODEXPRO_HOOK_TIMEOUT_MS` — default hook timeout, bounded to 100–30,000 ms.
- `CODEXPRO_HOOK_MAX_OUTPUT_BYTES` — captured output ceiling, bounded to 1,024–1,000,000 bytes.

On POSIX systems CodexPro creates trust directories/files with same-user-oriented modes (`0700`/`0600`). On Windows the current user ACL remains the authoritative permission boundary.
