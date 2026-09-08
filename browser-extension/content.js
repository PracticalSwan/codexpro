(() => {
  const FIXED_MESSAGE = 'Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.';
  const adapter = globalThis.CodexProChatGptAdapter;
  if (!adapter) return;
  let timer = null;
  let previous = '';
  let heartbeatTimer = null;
  let lastUserInputAt = 0;
  let composerDirty = false;
  let lastManualEventAt = 0;
  let suppressProgrammaticInput = false;

  function sendRuntime(message) {
    try { chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; }); } catch {}
  }

  function runtimeSend(message) {
    try { chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; }); } catch {}
  }
  function snapshot() { return adapter.observeChatGptPage({ href: location.href, lastUserInputAt }); }
  function emitSnapshot(force = false) {
    timer = null;
    const state = snapshot();
    if (composerDirty) state.recent_user_input = true;
    const fingerprint = JSON.stringify(state);
    if (!force && fingerprint === previous) return;
    previous = fingerprint;
    runtimeSend({ type: 'codexpro_page_state', pageState: state });
  }
  function schedule() { if (!timer) timer = setTimeout(() => emitSnapshot(false), 500); }
  function notifyManual(reason) {
    const now = Date.now();
    if (now - lastManualEventAt < 250) return;
    lastManualEventAt = now;
    runtimeSend({ type: 'codexpro_manual_interaction', reason, routeKey: snapshot().conversation_route_key });
  }
  document.addEventListener('input', (event) => {
    if (!suppressProgrammaticInput && event.isTrusted && adapter.isComposerTarget(event.target)) {
      lastUserInputAt = Date.now();
      composerDirty = true;
      schedule();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.isComposing || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || !adapter.isComposerTarget(event.target)) return;
    lastUserInputAt = Date.now();
    notifyManual('manual_message');
    composerDirty = false;
  }, true);
  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const reason = adapter.classifyClick(event.target);
    if (!reason) return;
    lastUserInputAt = Date.now();
    notifyManual(reason);
    if (reason === 'manual_message') composerDirty = false;
  }, true);

  async function dispatchFixed(message) {
    if (message?.message !== FIXED_MESSAGE || !/^[a-f0-9]{64}$/.test(String(message?.authorizationToken || '')) || !message?.routeKey) return { ok: false, reason: 'dispatch_authorization_invalid' };
    const before = snapshot();
    if (before.conversation_route_key !== message.routeKey) return { ok: false, reason: 'wrong_chat' };
    suppressProgrammaticInput = true;
    let prepared;
    try {
      prepared = adapter.prepareFixedMessage({ message: FIXED_MESSAGE, expectedRouteKey: message.routeKey, href: location.href, lastUserInputAt });
    } finally {
      suppressProgrammaticInput = false;
    }
    if (!prepared.ok) return prepared;
    const deadline = Date.now() + 1500;
    let sent = { ok: false, reason: 'composer_unavailable' };
    do {
      await new Promise((resolve) => setTimeout(resolve, 75));
      sent = adapter.activateSend({ expectedRouteKey: message.routeKey, href: location.href, lastUserInputAt });
      if (sent.ok || sent.reason !== 'composer_unavailable') break;
    } while (Date.now() < deadline);
    if (!sent.ok) return sent;
    composerDirty = false;
    previous = '';
    schedule();
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'codexpro_inspect_page') { sendResponse({ ok: true, value: snapshot() }); return false; }
    if (message?.type === 'codexpro_dispatch_fixed') {
      void dispatchFixed(message).then((value) => sendResponse({ ok: true, value }), (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    return false;
  });

  schedule();
  heartbeatTimer = setInterval(() => { previous = ''; emitSnapshot(true); }, 30000);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }, { once: true });
})();
