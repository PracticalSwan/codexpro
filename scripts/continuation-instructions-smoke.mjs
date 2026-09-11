import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadConfig } from '../dist/config.js';
import { serverInstructions } from '../dist/server.js';

const baseEnv = { ...process.env, CODEXPRO_BASH_MODE: 'off', CODEXPRO_WRITE_MODE: 'workspace' };
function instructions(enabled) {
  const previous = { ...process.env };
  Object.assign(process.env, baseEnv, { CODEXPRO_CONTINUATION_ENABLED: enabled ? '1' : '0' });
  try { return serverInstructions(loadConfig([])); }
  finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}
function requireText(text, phrases) {
  for (const phrase of phrases) assert(text.includes(phrase), `missing continuation guidance: ${phrase}`);
}

const enabled = instructions(true);
requireText(enabled, [
  'continuationEnabled=true', 'substantial task', 'continuation_checkpoint', 'material progress',
  'proc_*', 'job_*', 'goal_*', 'batch_*', 'continuation_request', 'continuation_complete',
  'continuation_cancel', 'user-gated', 'continuation boundary', 'never a quality target',
  'per MCP tool call', 'restarts for each tool invocation', 'do not wait for a deadline yield or host cutoff'
]);
requireText(enabled, [
  'continuation_status', 'current runtime', 'selectedContinuationIntentId', 'avoid redoing verified work',
  'manualTurnPending', 'continuation_reconcile', 'resume', 'redirect', 'supersede', 'cancel',
  'must not wait or busy-poll', 'must not auto-send'
]);
const disabled = instructions(false);
requireText(disabled, [
  'continuationEnabled=false', 'Do not arm continuation', 'do not launch browser setup', 'do not request Telegram setup',
  'No semantic continuation checkpoint is saved automatically'
]);
assert(!disabled.includes('continuation_arm when'), 'disabled guidance encouraged arming continuation');
const prompt = await fs.readFile(new URL('../CHATGPT_PROMPT.md', import.meta.url), 'utf8');
requireText(prompt, [
  'continuation_status', 'continuation_checkpoint', 'continuation_request', 'continuation_complete',
  'user-gated', 'manualTurnPending', 'continuation_reconcile', 'avoid redoing verified work',
  'per MCP tool call', 'before starting a long or high-variance phase'
]);
const workflow = await fs.readFile(new URL('../docs/agentic/DEVELOPMENT_WORKFLOW.md', import.meta.url), 'utf8');
requireText(workflow, [
  'continuationEnabled=true', 'continuationEnabled=false', 'continuation_status', 'manualTurnPending',
  'resume', 'redirect', 'supersede', 'cancel', 'user-gated'
]);console.log('continuation instructions smoke passed');