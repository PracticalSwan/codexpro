import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootUrlPath = decodeURIComponent(new URL('..', import.meta.url).pathname);
const root = path.resolve(rootUrlPath.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

const revision = String(process.env.CODEXPRO_BUILD_REVISION || git(['rev-parse', 'HEAD']) || '').trim();
const exactTag = String(process.env.CODEXPRO_BUILD_TAG || git(['describe', '--tags', '--exact-match', 'HEAD']) || '').trim();
const branch = String(process.env.CODEXPRO_BUILD_CHANNEL || git(['branch', '--show-current']) || '').trim();
const channel = exactTag.startsWith('v') ? 'release' : branch === 'main' ? 'main' : revision ? 'source' : 'unknown';
const output = {
  packageName: packageJson.name,
  version: packageJson.version,
  revision: /^[0-9a-f]{7,64}$/i.test(revision) ? revision : null,
  channel
};
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'build-metadata.json'), `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
try { fs.chmodSync(path.join(dist, 'build-metadata.json'), 0o600); } catch {}
console.log(JSON.stringify(output));
