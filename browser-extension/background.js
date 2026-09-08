const FIXED_MESSAGE = 'Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.';
const DEFAULT_PAGE = { auth_state: 'unknown', conversation_route_present: false, conversation_route_stable: false, conversation_route_key: null, composer_ready: false, streaming: false, platform_state: 'unknown', blocking_interaction: false, recent_user_input: false };
const DEFAULT_STATE = { paired: false, available: false, profileLabel: 'default', bridgeUrl: '', clientId: '', task: null, pageState: DEFAULT_PAGE };
const NOTIFICATION_PREFIX = 'codexpro-continuation-';
const NOTIFICATION_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23222222"/><path d="M18 32h28M34 20l12 12-12 12" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let pollTimer = null;

function loopbackBridgeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
function toHex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function ensureRouteSalt() {
  const { routeSalt } = await chrome.storage.local.get('routeSalt');
  if (/^[a-f0-9]{64}$/.test(String(routeSalt || ''))) return routeSalt;
  const next = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await chrome.storage.local.set({ routeSalt: next });
  return next;
}
async function routeFingerprint(routeKey) { return sha256(`${await ensureRouteSalt()}|${routeKey}`); }
async function stored() {
  const value = await chrome.storage.local.get(['bridgeUrl', 'clientId', 'credential', 'profileLabel', 'uiState', 'chatBindings']);
  return { ...DEFAULT_STATE, ...(value.uiState || {}), ...value, chatBindings: value.chatBindings || {} };
}
async function saveUi(patch) {
  const current = await stored();
  const uiState = { paired: Boolean(current.clientId && current.credential), available: Boolean(current.available), profileLabel: current.profileLabel || 'default', bridgeUrl: current.bridgeUrl || '', clientId: current.clientId || '', task: current.task || null, pageState: current.pageState || DEFAULT_PAGE, ...patch };
  await chrome.storage.local.set({ uiState });
  return uiState;
}
function publicState(value, extra = {}) {
  return { paired: Boolean(value.clientId && value.credential), available: Boolean(value.available), profileLabel: value.profileLabel || 'default', bridgeUrl: value.bridgeUrl || '', clientId: value.clientId || '', task: value.task || null, pageState: value.pageState || DEFAULT_PAGE, currentChatBound: false, localBindingAvailable: false, ...extra };
}
async function clearReadyNotification() {
  const { notifiedContinuationId } = await chrome.storage.local.get('notifiedContinuationId');
  if (typeof notifiedContinuationId === 'string' && notifiedContinuationId.startsWith(NOTIFICATION_PREFIX)) {
    try { await chrome.notifications.clear(notifiedContinuationId); } catch {}
  }
  try { await chrome.action.setBadgeText({ text: '' }); } catch {}
  await chrome.storage.local.remove(['notifiedContinuationKey', 'notifiedContinuationId']);
}
async function syncReadyNotification(task) {
  const keyPart = String(task?.notification_key || '');
  const ready = task?.state === 'continuation_ready' && task?.conversation_bound === true && task?.manual_turn_pending !== true && /^[a-f0-9]{64}$/.test(keyPart);
  if (!ready) { await clearReadyNotification(); return; }
  const current = await stored();
  const binding = await bindingFor(task.id);
  if (!binding || current.pageState?.auth_state !== 'signed_in') { await clearReadyNotification(); return; }
  const notificationKey = `${task.id}:${task.revision}:${keyPart}`;
  const saved = await chrome.storage.local.get(['notifiedContinuationKey', 'notifiedContinuationId']);
  if (saved.notifiedContinuationKey === notificationKey) {
    try { await chrome.action.setBadgeText({ text: '1' }); } catch {}
    return;
  }
  await clearReadyNotification();
  const notificationId = `${NOTIFICATION_PREFIX}${keyPart.slice(0, 32)}`;
  await chrome.notifications.create(notificationId, { type: 'basic', iconUrl: NOTIFICATION_ICON, title: 'CodexPro continuation ready', message: `${task.title || 'Current task'} is ready. Open the bound chat and press Continue task.` });
  try { await chrome.action.setBadgeText({ text: '1' }); } catch {}
  await chrome.storage.local.set({ notifiedContinuationKey: notificationKey, notifiedContinuationId: notificationId });
}
async function bridgeFetch(pathname, init = {}) {
  const state = await stored();
  if (!loopbackBridgeUrl(state.bridgeUrl) || !state.clientId || !state.credential) throw new Error('transport_unavailable');
  const response = await fetch(`${state.bridgeUrl}${pathname}`, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${state.credential}`, 'x-codexpro-browser-client': state.clientId, ...(init.headers || {}) } });
  if (!response.ok) {
    let code = response.status === 401 || response.status === 403 ? 'transport_unavailable' : `bridge_${response.status}`;
    try { const body = await response.json(); if (/^[a-z0-9_]{2,64}$/.test(body?.error?.code || '')) code = body.error.code; } catch {}
    if (response.status === 401 || response.status === 403) await saveUi({ available: false, task: null });
    throw new Error(code);
  }
  return response;
}
async function refreshTask() {
  const response = await bridgeFetch('/continuation/v1/status');
  const result = await response.json();
  const task = result.task || null;
  await saveUi({ available: true, task });
  await syncReadyNotification(task);
  return task;
}
async function poll() {
  try {
    const task = await refreshTask();
    schedule(task ? 5000 : 30000);
  } catch {
    await saveUi({ available: false, task: null });
    await clearReadyNotification();
    schedule(30000);
  }
}
function schedule(delay) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => void poll(), delay);
}
async function activeChatPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !String(tab.url || '').startsWith('https://chatgpt.com/')) throw new Error('wrong_chat');
  let response;
  try { response = await chrome.tabs.sendMessage(tab.id, { type: 'codexpro_inspect_page' }); }
  catch { throw new Error('transport_unavailable'); }
  if (!response?.ok || !response.value) throw new Error('transport_unavailable');
  return { tabId: tab.id, pageState: response.value };
}
function safePageReason(pageState) {
  if (pageState?.auth_state !== 'signed_in') return 'authentication_required';
  if (!pageState?.conversation_route_stable || !pageState?.conversation_route_key) return 'wrong_chat';
  if (pageState?.streaming) return 'streaming';
  if (pageState?.blocking_interaction) return 'blocking_interaction';
  if (pageState?.platform_state === 'error') return 'platform_error';
  if (pageState?.platform_state !== 'idle') return 'platform_busy';
  if (!pageState?.composer_ready) return 'composer_unavailable';
  if (pageState?.recent_user_input) return 'recent_user_input';
  return null;
}
async function bindingFor(taskId) {
  const { chatBindings = {} } = await chrome.storage.local.get('chatBindings');
  return chatBindings[taskId] || null;
}
async function saveBinding(taskId, binding) {
  const { chatBindings = {} } = await chrome.storage.local.get('chatBindings');
  await chrome.storage.local.set({ chatBindings: { ...chatBindings, [taskId]: binding } });
}
async function popupState() {
  const current = await stored();
  let pageState = current.pageState || DEFAULT_PAGE;
  let currentChatBound = false;
  let localBindingAvailable = false;
  if (current.available && current.task) {
    const binding = await bindingFor(current.task.id);
    localBindingAvailable = Boolean(binding);
    try {
      const active = await activeChatPage();
      pageState = active.pageState;
      currentChatBound = Boolean(binding && binding.tabId === active.tabId && binding.routeKey === active.pageState.conversation_route_key);
      await saveUi({ pageState });
    } catch {}
  }
  return publicState(await stored(), { currentChatBound, localBindingAvailable, pageState });
}
async function pair(message) {
  if (!loopbackBridgeUrl(message.bridgeUrl)) throw new Error('Bridge URL must be a loopback http://127.0.0.1 URL.');
  const response = await fetch(`${message.bridgeUrl}/continuation/v1/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_label: message.profileLabel, code: message.code, extension_version: chrome.runtime.getManifest().version }) });
  if (!response.ok) throw new Error(`pairing_failed_${response.status}`);
  const result = await response.json();
  await chrome.storage.local.set({ bridgeUrl: message.bridgeUrl, clientId: result.client_id, credential: result.credential, profileLabel: result.profile_label });
  await saveUi({ paired: true, available: false, bridgeUrl: message.bridgeUrl, clientId: result.client_id, profileLabel: result.profile_label, task: null });
  await poll();
  return popupState();
}
async function bindCurrentChat() {
  const task = await refreshTask();
  if (!task?.id || !Number.isInteger(task.revision)) throw new Error('no_current_task');
  const active = await activeChatPage();
  const page = active.pageState;
  if (page.auth_state !== 'signed_in' || !page.conversation_route_stable || !page.conversation_route_key) throw new Error('wrong_chat');
  const fingerprint = await routeFingerprint(page.conversation_route_key);
  const response = await bridgeFetch('/continuation/v1/events/bind', { method: 'POST', body: JSON.stringify({ task_id: task.id, revision: task.revision, conversation_fingerprint: fingerprint }) });
  const result = await response.json();
  await saveBinding(task.id, { tabId: active.tabId, routeKey: page.conversation_route_key, fingerprint });
  const boundTask = result.task || task;
  await saveUi({ task: boundTask, pageState: page, available: true });
  await syncReadyNotification(boundTask);
  return popupState();
}
async function releaseAuthorization(grant) {
  try {
    await bridgeFetch('/continuation/v1/dispatch/release', { method: 'POST', body: JSON.stringify({ task_id: grant.task_id, revision: grant.revision, authorization_token: grant.authorization_token }) });
  } catch {}
}
async function continueCurrentTask() {
  const task = await refreshTask();
  if (!task?.id || !Number.isInteger(task.revision)) throw new Error('no_current_task');
  if (task.state !== 'continuation_ready' || task.manual_turn_pending || task.dispatch_authorization_pending) throw new Error(task.manual_turn_pending ? 'manual_turn_pending' : 'continuation_not_ready');
  const active = await activeChatPage();
  const binding = await bindingFor(task.id);
  if (!binding || binding.tabId !== active.tabId || binding.routeKey !== active.pageState.conversation_route_key) throw new Error('wrong_chat');
  const reason = safePageReason(active.pageState);
  if (reason) throw new Error(reason);
  const body = { task_id: task.id, revision: task.revision, conversation_fingerprint: binding.fingerprint, page_state: { auth_state: 'signed_in', composer_ready: true, streaming: false, platform_state: 'idle', blocking_interaction: false, recent_user_input: false } };
  const response = await bridgeFetch('/continuation/v1/dispatch/authorize', { method: 'POST', body: JSON.stringify(body) });
  const grant = await response.json();
  if (grant.message !== FIXED_MESSAGE || !/^[a-f0-9]{64}$/.test(String(grant.authorization_token || '')) || grant.task_id !== task.id || !Number.isInteger(grant.revision)) {
    await releaseAuthorization(grant);
    throw new Error('dispatch_authorization_invalid');
  }
  let dispatchResult;
  try {
    dispatchResult = await chrome.tabs.sendMessage(active.tabId, { type: 'codexpro_dispatch_fixed', authorizationToken: grant.authorization_token, routeKey: binding.routeKey, taskId: grant.task_id, revision: grant.revision, conversationFingerprint: binding.fingerprint, message: FIXED_MESSAGE });
  } catch {
    await releaseAuthorization(grant);
    throw new Error('transport_unavailable');
  }
  if (!dispatchResult?.ok || !dispatchResult.value?.ok) {
    await releaseAuthorization(grant);
    throw new Error(dispatchResult?.value?.reason || dispatchResult?.error || 'composer_unavailable');
  }
  const completed = await bridgeFetch('/continuation/v1/dispatch/complete', { method: 'POST', body: JSON.stringify({ task_id: grant.task_id, revision: grant.revision, conversation_fingerprint: binding.fingerprint, authorization_token: grant.authorization_token }) });
  const result = await completed.json();
  const completedTask = result.task || null;
  await saveUi({ task: completedTask, available: true });
  await syncReadyNotification(completedTask);
  return popupState();
}
async function sendManualInteraction(message, sender) {
  if (message.reason !== 'manual_message' && message.reason !== 'stop_generating') return;
  const task = await refreshTask().catch(() => null);
  if (!task?.id || !Number.isInteger(task.revision) || !sender.tab?.id) return;
  const binding = await bindingFor(task.id);
  if (!binding || binding.tabId !== sender.tab.id || binding.routeKey !== message.routeKey) return;
  try {
    const response = await bridgeFetch('/continuation/v1/events/manual', { method: 'POST', body: JSON.stringify({ task_id: task.id, revision: task.revision, conversation_fingerprint: binding.fingerprint, reason: message.reason }) });
    const result = await response.json();
    const pausedTask = result.task || null;
    await saveUi({ task: pausedTask, available: true });
    await syncReadyNotification(pausedTask);
  } catch { await saveUi({ available: false }); await clearReadyNotification(); }
}
async function sendPageState(pageState, sender) {
  const current = await stored();
  const nextPageState = current.pageState?.auth_state === 'signed_in' && pageState?.auth_state === 'signed_out' ? { ...pageState, auth_state: 'authentication_required' } : pageState;
  await saveUi({ pageState: nextPageState });
  const binding = current.task?.id ? await bindingFor(current.task.id) : null;
  const routeInvalidated = Boolean(binding && sender?.tab?.id === binding.tabId && binding.routeKey !== nextPageState.conversation_route_key);
  const unsafe = nextPageState.auth_state !== 'signed_in' || routeInvalidated || Boolean(nextPageState.streaming) || Boolean(nextPageState.blocking_interaction) || Boolean(nextPageState.recent_user_input) || nextPageState.platform_state !== 'idle';
  if (unsafe) await clearReadyNotification(); else if (current.task) await syncReadyNotification(current.task);
  const coarse = { auth_state: nextPageState.auth_state, composer_available: Boolean(nextPageState.composer_ready ?? nextPageState.composer_available), streaming: Boolean(nextPageState.streaming), blocking_interaction: Boolean(nextPageState.blocking_interaction) };
  try {
    await bridgeFetch('/continuation/v1/page-state', { method: 'POST', body: JSON.stringify(coarse) });
    await saveUi({ available: true });
    await poll();
  } catch { await saveUi({ available: false, task: null }); await clearReadyNotification(); }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    if (message?.type === 'codexpro_page_state') { await sendPageState(message.pageState, sender); return { ok: true }; }
    if (message?.type === 'codexpro_manual_interaction') { await sendManualInteraction(message, sender); return { ok: true }; }
    if (message?.type === 'codexpro_get_state') return popupState();
    if (message?.type === 'codexpro_pair') return pair(message);
    if (message?.type === 'codexpro_bind') return bindCurrentChat();
    if (message?.type === 'codexpro_continue') return continueCurrentTask();
    throw new Error('unsupported_companion_action');
  })().then((value) => sendResponse({ ok: true, value }), (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void (async () => {
    const saved = await chrome.storage.local.get(['notifiedContinuationId', 'uiState']);
    if (saved.notifiedContinuationId !== notificationId || !saved.uiState?.task?.id) return;
    const binding = await bindingFor(saved.uiState.task.id);
    if (!binding?.tabId) return;
    try {
      const tab = await chrome.tabs.get(binding.tabId);
      await chrome.tabs.update(binding.tabId, { active: true });
      if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    } catch {}
  })();
});

chrome.runtime.onInstalled.addListener(() => { schedule(1000); });
chrome.runtime.onStartup.addListener(() => { schedule(1000); });
void poll();
