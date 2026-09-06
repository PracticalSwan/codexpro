# Activity Log

CodexPro keeps a bounded, sanitized activity/evidence ledger outside each project under the per-user activity directory. It is audit evidence, not an event-sourced execution engine.

## Recorded evidence

Records contain only an action, status, timestamp/sequence, optional duration, existing operation/check/process/Goal IDs, bounded workspace-relative paths, and a sanitized short summary. Each workspace has an independent monotonic sequence cursor.

The read-only `activity_log` MCP tool accepts `after_sequence`, `kinds`, `statuses`, and a bounded `limit`.

## Privacy and failure behavior

The ledger does not persist prompts, unrestricted source text, raw stdout/stderr, authentication values, full environment data, or arbitrary absolute paths. Storage is JSONL under `CODEXPRO_ACTIVITY_DIR`, with deterministic record/byte rotation. A truncated final line is ignored after a crash.

Ledger append failures are observability degradation only: they never fail or roll back an otherwise successful CodexPro operation. Existing telemetry remains the aggregate metrics source.
