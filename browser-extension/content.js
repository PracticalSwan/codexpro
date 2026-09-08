(() => {
  let timer = null;
  let previous = '';
  let heartbeatTimer = null;
  function snapshot() {
    timer = null;
    const composerAvailable = Boolean(document.querySelector('textarea,[contenteditable="true"]'));
    const loginVisible = Boolean(document.querySelector('a[href*="/auth/login"],a[href*="/login"],button[data-testid*="login"]')) || /\/auth\/|\/login(?:[/?#]|$)/i.test(location.pathname);
    let authState = 'unknown';
    if (composerAvailable && loginVisible) authState = 'ambiguous';
    else if (composerAvailable) authState = 'signed_in';
    else if (loginVisible) authState = 'signed_out';
    const state = {
      auth_state: authState,
      composer_available: composerAvailable,
      streaming: Boolean(document.querySelector('[data-testid="stop-button"],[data-testid="stop-generating-button"]')),
      blocking_interaction: false
    };
    const fingerprint = JSON.stringify(state);
    if (fingerprint === previous) return;
    previous = fingerprint;
    chrome.runtime.sendMessage({ type: 'codexpro_page_state', pageState: state }).catch(() => undefined);
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(snapshot, 500);
  }
  schedule();
  heartbeatTimer = setInterval(() => { previous = ''; schedule(); }, 30000);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (timer) clearTimeout(timer); if (heartbeatTimer) clearInterval(heartbeatTimer); }, { once: true });
})();
