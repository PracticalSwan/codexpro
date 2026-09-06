# Durable touched-file checkpoints

CodexPro creates a durable `chk_*` checkpoint for successful `write`, `edit`, `apply_patch`, and `apply_change_set` mutations.

A checkpoint contains only the paths that operation intended to touch. Existing file preimages are stored as SHA-256-addressed blobs outside the workspace under `CODEXPRO_CHECKPOINT_DIR` (default `~/.codexpro/checkpoints`). Identical preimages are deduplicated.

## Restore behavior

Use the `restore_checkpoint` MCP tool with the checkpoint id returned by the original mutation. Restore is all-or-nothing:

- every affected path is resolved again through `PathGuard`;
- all current post-mutation hashes/states are validated before any restoration begins;
- the same file mutation leases used by normal writes are acquired;
- an originally existing file is restored from its verified preimage blob;
- a file created by the original operation is deleted only if it still matches the recorded post-image;
- a file deleted by a patch may be recreated from its preimage only if it is still absent.

If any file was edited, created, deleted, or otherwise changed afterward, restore fails closed and leaves every file untouched.

## Scope and security boundary

Checkpoints are intentionally not repository snapshots. They never snapshot or restore the Git index, refs, ignored dependency trees, blocked paths, credentials, or unrelated files, and they never run `git reset` or `git checkout`.

Checkpoint storage relies on local same-user filesystem permissions. The first implementation does not add encryption or key management. Normal blocked-path checks and secret-write prevention remain authoritative before a checkpointed mutation is allowed.

The store is bounded by the configured operation receipt/file/byte ceilings and uses content-addressed preimages plus compact JSON metadata.

## Configuration

```text
CODEXPRO_CHECKPOINT_DIR=~/.codexpro/checkpoints
```

Normally the default should be kept outside project directories. Changing this setting affects new CodexPro runtimes only.
