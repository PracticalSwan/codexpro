const DEFAULT_STATE = {
  paired: false,
  available: false,
  profileLabel: 'default',
  bridgeUrl: '',
  clientId: '',
  task: null,
  pageState: { auth_state: 'unknown', composer_available: false, streaming: false, blocking_interaction: false }
};
let pollTimer = null;

function loopbackBridgeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
async function stored() {
  const value = await chrome.storage.local.get(['bridgeUrl', 'clientId', 'credential', 'profileLabel', 'uiState']);
  return { ...DEFAULT_STATE, ...(value.uiState || {}), ...value };
}
async function saveUi(patch) {
  const current = await stored();
  const uiState = { paired: Boolean(current.clientId && current.credential), available: Boolean(current.available), profileLabel: current.profileLabel || 'default', bridgeUrl: current.bridgeUrl || '', clientId: current.clientId || '', task: current.task || null, pageState: current.pageState || DEFAULT_STATE.pageState, ...patch };
  await chrome.storage.local.set({ uiState });
  return uiState;
}
function publicState(value) {
  return { paired: Boolean(value.clientId && value.credential), available: Boolean(value.available), profileLabel: value.profileLabel || 'default', bridgeUrl: value.bridgeUrl || '', clientId: value.clientId || '', task: value.task || null, pageState: value.pageState || DEFAULT_STATE.pageState };
}
async function bridgeFetch(pathname, init = {}) {
  const state = await stored();
  if (!loopbackBridgeUrl(state.bridgeUrl) || !state.clientId || !state.credential) throw new Error('Browser companion is not paired.');
  const response = await fetch(`${state.bridgeUrl}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${state.credential}`,
      'x-codexpro-browser-client': state.clientId,
      ...(init.headers || {})
    }
  });
  if (response.status === 401 || response.status === 403) {
    await saveUi({ available: false, task: null });
    throw new Error('Browser continuation authorization is unavailable.');
  }
  if (!response.ok) throw new Error(`Bridge request failed (${response.status}).`);
  return response;
}
async function poll() {
  try {
    const response = await bridgeFetch('/continuation/v1/status');
    const result = await response.json();
    await saveUi({ available: true, task: result.task || null });
    schedule(result.task ? 5000 : 30000);
  } catch {
    await saveUi({ available: false, task: null });
    schedule(30000);
  }
}
function schedule(delay) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => void poll(), delay);
}
async function pair(message) {
  if (!loopbackBridgeUrl(message.bridgeUrl)) throw new Error('Bridge URL must be a loopback http://127.0.0.1 URL.');
  const response = await fetch(`${message.bridgeUrl}/continuation/v1/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_label: message.profileLabel, code: message.code, extension_version: chrome.runtime.getManifest().version })
  });
  if (!response.ok) throw new Error(`Pairing failed (${response.status}).`);
  const result = await response.json();
  await chrome.storage.local.set({ bridgeUrl: message.bridgeUrl, clientId: result.client_id, credential: result.credential, profileLabel: result.profile_label });
  await saveUi({ paired: true, available: false, bridgeUrl: message.bridgeUrl, clientId: result.client_id, profileLabel: result.profile_label, task: null });
  await poll();
  return publicState(await stored());
}
async function sendTaskEvent(kind, task) {
  if (!task?.id || !Number.isInteger(task.revision)) throw new Error('No current task action is available.');
  await bridgeFetch(`/continuation/v1/events/${kind}`, { method: 'POST', body: JSON.stringify({ task_id: task.id, revision: task.revision }) });
  await poll();
  return publicState(await stored());
}
async function sendPageState(pageState) {
  await saveUi({ pageState });
  try {
    await bridgeFetch('/continuation/v1/page-state', { method: 'POST', body: JSON.stringify(pageState) });
  } catch { await saveUi({ available: false, task: null }); }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === 'codexpro_page_state') { await sendPageState(message.pageState); return { ok: true }; }
    if (message?.type === 'codexpro_get_state') return publicState(await stored());
    if (message?.type === 'codexpro_pair') return pair(message);
    if (message?.type === 'codexpro_bind') return sendTaskEvent('bind', (await stored()).task);
    if (message?.type === 'codexpro_continue') return sendTaskEvent('dispatch', (await stored()).task);
    throw new Error('Unsupported companion action.');
  })().then((value) => sendResponse({ ok: true, value }), (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => { schedule(1000); });
chrome.runtime.onStartup.addListener(() => { schedule(1000); });
void poll();
