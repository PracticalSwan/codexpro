import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface SourceIdentity {
  head_sha: string | null;
  working_tree_sha256: string | null;
  complete: boolean;
}

export interface VerificationSourceEvidence {
  before: SourceIdentity;
  after: SourceIdentity;
  changed_during_run: boolean | null;
  current_matches: boolean | null;
  warning?: string;
}

function git(root: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 4_000_000 });
  return result.status === 0 && !result.error ? String(result.stdout ?? "") : null;
}

/** Content itself never enters responses or a persistent evidence store. */
export function captureSourceIdentity(root: string): SourceIdentity {
  const head = git(root, ["rev-parse", "--verify", "HEAD"]);
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const diff = git(root, ["diff", "--no-ext-diff", "--binary", "HEAD", "--"]);
  if (!head || status === null || diff === null) return { head_sha: null, working_tree_sha256: null, complete: false };
  const headSha = head.trim();
  if (!/^[a-f0-9]{40}$/i.test(headSha)) return { head_sha: null, working_tree_sha256: null, complete: false };
  const digest = createHash("sha256").update(headSha).update("\0").update(status).update("\0").update(diff).digest("hex");
  // Untracked bytes are not read: report partial provenance rather than imply full coverage.
  const untracked = status.split("\0").some((entry) => entry.startsWith("?? "));
  return { head_sha: headSha, working_tree_sha256: digest, complete: !untracked };
}

export function compareSourceIdentity(before: SourceIdentity, after: SourceIdentity): VerificationSourceEvidence {
  if (!before.head_sha || !after.head_sha || !before.working_tree_sha256 || !after.working_tree_sha256) {
    return { before, after, changed_during_run: null, current_matches: null, warning: "Source identity unavailable; verification provenance unknown." };
  }
  const same = before.head_sha === after.head_sha && before.working_tree_sha256 === after.working_tree_sha256;
  const complete = before.complete && after.complete;
  return {
    before, after,
    changed_during_run: !same,
    current_matches: complete ? same : null,
    ...(!complete ? { warning: "Untracked file contents are not hashed; evidence is incomplete." }
      : !same ? { warning: "Source changed during verification; passing tests are stale for the current source." } : {})
  };
}

export function evaluateVerificationFreshness(evidence: VerificationSourceEvidence, current: SourceIdentity): boolean | null {
  if (!evidence.after.complete || !current.complete || evidence.changed_during_run !== false) return null;
  return evidence.after.head_sha === current.head_sha && evidence.after.working_tree_sha256 === current.working_tree_sha256;
}
