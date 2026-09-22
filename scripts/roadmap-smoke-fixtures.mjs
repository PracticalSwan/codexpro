import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { WorkspaceManager, PathGuard } from '../dist/guard.js';

export async function createFixture(prefix = 'codexpro-plan-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-app', version: '1.0.0' }, null, 2));
  await fs.writeFile(path.join(root, 'src', 'main.ts'), 'export const main = true;\n');
  const base = loadConfig(['--root', root, '--allow-root', root, '--tool-mode', 'full', '--write', 'workspace', '--bash', 'safe']);
  const config = { ...base, analysisEnabled: true, localServiceProbeEnabled: true };
  const workspace = new WorkspaceManager(config).defaultWorkspace();
  const guard = new PathGuard(config);
  return { root, config, workspace, guard };
}

export async function removeFixture(fixture) {
  await fs.rm(fixture.root, { recursive: true, force: true });
}
