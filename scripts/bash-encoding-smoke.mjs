import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import iconv from 'iconv-lite';
import { PathGuard } from '../dist/guard.js';
import { decodeBashOutput, runBash } from '../dist/bashOps.js';

function mustNotDetect() {
  throw new Error('encoding detection must not run');
}

const zh = '\u4e2d\u6587\u7f16\u7801\u68c0\u6d4b\u91cd\u590d\u5185\u5bb9';
const ascii = Buffer.from('plain ASCII output');
const utf8Text = `UTF-8 ${zh}`;
const utf8 = Buffer.from(utf8Text);
assert.equal(decodeBashOutput(ascii, 'win32', false, mustNotDetect), 'plain ASCII output');
assert.equal(decodeBashOutput(utf8, 'win32', false, mustNotDetect), utf8Text);

const gb18030Text = `Windows GB18030 ${zh}`.repeat(8);
const gb18030 = iconv.encode(gb18030Text, 'gb18030');
assert.equal(decodeBashOutput(gb18030, 'win32'), gb18030Text, 'real chardet GB18030 decode failed');
const gbkText = `Windows GBK ${zh}`.repeat(8);
const gbk = iconv.encode(gbkText, 'gbk');
assert.equal(decodeBashOutput(gbk, 'win32'), gbkText, 'real chardet GBK decode failed');

const utf16Text = `Windows UTF-16 output ${zh}`;
const utf16le = iconv.encode(utf16Text, 'utf16le');
assert.equal(decodeBashOutput(utf16le, 'win32'), utf16Text, 'UTF-16LE NUL-pattern decode failed');
const utf16leBom = Buffer.concat([Buffer.from([0xff, 0xfe]), utf16le]);
assert.equal(decodeBashOutput(utf16leBom, 'win32'), utf16Text, 'UTF-16LE BOM decode failed');
const utf16be = iconv.encode(utf16Text, 'utf16-be');
assert.equal(decodeBashOutput(utf16be, 'win32'), utf16Text, 'UTF-16BE NUL-pattern decode failed');

const legacy = Buffer.from([0x80]);
assert.equal(
  decodeBashOutput(legacy, 'win32', false, () => [{ name: 'windows-1252', confidence: 80 }]),
  '\u20ac',
  'high-confidence supported encoding was not accepted'
);
assert.equal(
  decodeBashOutput(legacy, 'win32', false, () => [{ name: 'windows-1252', confidence: 79 }]),
  legacy.toString('utf8'),
  'low-confidence encoding did not fall back to UTF-8'
);
assert.equal(
  decodeBashOutput(legacy, 'win32', false, () => [{ name: 'not-a-real-encoding', confidence: 100 }]),
  legacy.toString('utf8'),
  'unsupported encoding did not fall back to UTF-8'
);
assert.equal(decodeBashOutput(legacy, 'win32', false, () => []), legacy.toString('utf8'), 'empty detection did not fall back');
assert.equal(
  decodeBashOutput(legacy, 'win32', false, () => { throw new Error('detector failure'); }),
  legacy.toString('utf8'),
  'detector failure did not fall back'
);
assert.equal(decodeBashOutput(legacy, 'linux', false, mustNotDetect), legacy.toString('utf8'), 'non-Windows invoked detection');
assert.equal(decodeBashOutput(Buffer.alloc(0), 'win32', false, mustNotDetect), '', 'empty output invoked detection');
assert.equal(
  decodeBashOutput(Buffer.concat([Buffer.from('split '), Buffer.from(zh)]), 'win32', false, mustNotDetect),
  `split ${zh}`,
  'combined multi-byte chunks were not decoded as UTF-8'
);
assert.equal(
  decodeBashOutput(Buffer.concat([Buffer.from('prefix '), Buffer.from([0xe4, 0xb8])]), 'win32', true, mustNotDetect),
  'prefix ',
  'truncated UTF-8 tail produced a replacement character instead of dropping only the incomplete code point'
);
assert.equal(
  decodeBashOutput(Buffer.concat([Buffer.from('prefix '), Buffer.from([0xe4, 0xb8])]), 'linux', true, mustNotDetect),
  'prefix ',
  'non-Windows truncated UTF-8 tail produced a replacement character'
);

if (process.platform === 'win32') {
  const rootRaw = await mkdtemp(path.join(os.tmpdir(), 'codexpro-bash-encoding-'));
  const root = await realpath(rootRaw);
  try {
    const config = { bashMode: 'full', maxBashTimeoutMs: 10_000, maxOutputBytes: 100_000, maxBashObservedOutputBytes: 1_000_000, inheritEnv: true, blockedGlobs: [] };
    const workspace = { id: 'encoding-smoke', root, openedAt: new Date().toISOString() };
    const stdoutText = `GBK stdout ${zh}`.repeat(8);
    const stderrText = `UTF-16LE stderr ${zh}`;
    const gbkPayload = iconv.encode(stdoutText, 'gbk').toString('base64');
    const utf16Payload = iconv.encode(stderrText, 'utf16le').toString('base64');
    const childScript = [
      `process.stdout.write(Buffer.from(${JSON.stringify(gbkPayload)}, 'base64'));`,
      `process.stderr.write(Buffer.from(${JSON.stringify(utf16Payload)}, 'base64'));`
    ].join('');
    const result = await runBash(config, new PathGuard(config), workspace, `${JSON.stringify(process.execPath)} -e ${JSON.stringify(childScript)}`);
    assert.equal(result.stdout, stdoutText, `Windows stdout decoding failed: ${JSON.stringify(result)}`);
    assert.equal(result.stderr, stderrText, `Windows stderr decoding failed: ${JSON.stringify(result)}`);
  } finally {
    await rm(rootRaw, { recursive: true, force: true });
  }
}

console.log('bash encoding smoke passed');
