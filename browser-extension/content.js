(() => {
  let timer = null;
  let previous = '';
  function snapshot() {
    timer = null;
    const state = {
      auth_state: document.querySelector('textarea,[contenteditable="true"]') ? 'signed_in' : 'unknown',
      composer_available: Boolean(document.querySelector('textarea,[contenteditable="true"]')),
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
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (timer) clearTimeout(timer); }, { once: true });
})();
