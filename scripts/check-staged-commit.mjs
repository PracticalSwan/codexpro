import { spawnSync } from 'node:child_process';

const input = await readStdinJson();
if (input.event !== 'before_tool' || input.tool !== 'git_commit') process.exit(0);

const blockedPathPatterns = [
  /(^|\/)(?:node_modules|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.cache|coverage)(\/|$)/i,
  /(^|\/)(?:private|secrets?|credentials?)(\/|$)/i,
  /(^|\/)\.env(?:$|\.(?!example$|sample$|template$))/i,
  /\.(?:pem|p12|pfx|jks)$/i,
  /(^|\/)(?:id_rsa|id_ed25519|id_ecdsa|id_dsa)$/i
];

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
];

const failures = [];
const stagedNames = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).stdout
  .split('\0')
  .filter(Boolean)
  .map((value) => value.replace(/\\/g, '/'));

if (!stagedNames.length) failures.push('No staged changes are present.');
for (const file of stagedNames) {
  if (blockedPathPatterns.some((pattern) => pattern.test(file))) {
    failures.push(`Blocked staged path: ${file}`);
    continue;
  }
  const stagedSize = git(['cat-file', '-s', `:${file}`], { allowFailure: true });
  const bytes = Number.parseInt(stagedSize.stdout.trim(), 10);
  if (stagedSize.status === 0 && Number.isFinite(bytes) && bytes > 25 * 1024 * 1024) {
    failures.push(`Large staged file exceeds 25 MiB: ${file}`);
  }
}

const check = git(['diff', '--cached', '--check'], { allowFailure: true });
if (check.status !== 0) failures.push(`git diff --cached --check failed: ${oneLine(check.output)}`);

const patch = git(['diff', '--cached', '--unified=0', '--no-color', '--diff-filter=ACMR']).stdout;
let currentFile = '';
for (const line of patch.split(/\r?\n/)) {
  if (line.startsWith('+++ b/')) {
    currentFile = line.slice(6);
    continue;
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  if (secretPatterns.some((pattern) => pattern.test(line.slice(1)))) {
    failures.push(`Secret-looking staged content detected${currentFile ? ` in ${currentFile}` : ''}.`);
  }
}
if (failures.length) {
  console.error('CodexPro staged-commit safety gate blocked git_commit:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(2);
}

console.log(`Staged-commit safety gate passed (${stagedNames.length} file${stagedNames.length === 1 ? '' : 's'}).`);
process.exit(0);

async function readStdinJson() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try { return raw.trim() ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error || (!allowFailure && result.status !== 0)) {
    console.error(`Staged-commit safety gate could not inspect Git state: ${oneLine(output || result.error?.message || 'git failed')}`);
    process.exit(2);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', output };
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}
