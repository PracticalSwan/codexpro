(() => {
  const ROUTE_ID = /^[A-Za-z0-9_-]{8,128}$/;
  const FIXED_MESSAGE = 'Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.';
  const COMPOSER = ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]', 'textarea[name="prompt-textarea"]', 'textarea[data-id="root"]'];
  const SEND = ['#composer-submit-button', '[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send dictated message"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]', 'button.composer-submit-btn'];
  const STOP = ['[data-testid="stop-button"]', '[data-testid="stop-generating-button"]', 'button[aria-label="Stop generating"]'];
  const LOGIN = ['a[href*="/auth/login"]', 'a[href*="/login"]', 'button[data-testid*="login"]'];
  const BLOCKING = ['[role="dialog"]', '[data-testid*="approval"]', '[data-testid*="safety"]', '[data-testid*="payment"]'];
  const ERROR = ['[data-testid="retry-button"]', 'button[aria-label="Retry"]', '[data-testid*="error"]'];
  const BUSY = ['[aria-busy="true"]', '[data-testid="loading"]'];

  function routeKey(href) {
    try {
      const url = new URL(String(href || ''));
      if (url.origin !== 'https://chatgpt.com') return null;
      if (url.searchParams.has('branch') || url.searchParams.has('branch_id') || url.searchParams.has('parent_message_id')) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      const c = parts.lastIndexOf('c');
      if (c < 0 || c !== parts.length - 2 || !ROUTE_ID.test(parts[c + 1] || '')) return null;
      return `c:${parts[c + 1]}`;
    } catch { return null; }
  }
  function first(query, selectors) { for (const selector of selectors) { const node = query(selector); if (node) return node; } return null; }
  function any(query, selectors) { return Boolean(first(query, selectors)); }
  function findComposer(query = (selector) => document.querySelector(selector)) { return first(query, COMPOSER); }
  function findSendControl(composer) {
    const form = composer?.closest?.('form');
    if (form?.querySelector) return first((selector) => form.querySelector(selector), SEND);
    return first((selector) => document.querySelector(selector), SEND);
  }
  function observeChatGptPage(input = {}) {
    const query = input.query || ((selector) => document.querySelector(selector));
    const href = input.href || location.href;
    const conversationRouteKey = routeKey(href);
    const composerNode = findComposer(query);
    const composer = Boolean(composerNode);
    const sendControl = composerNode && query === undefined ? Boolean(findSendControl(composerNode)) : any(query, SEND);
    const loginVisible = any(query, LOGIN) || /\/auth\/|\/login(?:[/?#]|$)/i.test(new URL(href).pathname);
    const streaming = any(query, STOP);
    const blocking = any(query, BLOCKING);
    const platformError = any(query, ERROR);
    const platformBusy = any(query, BUSY);
    let authState = 'unknown';
    if (composer && loginVisible) authState = 'ambiguous';
    else if (composer) authState = 'signed_in';
    else if (loginVisible) authState = 'signed_out';
    let platformState = 'unknown';
    if (blocking) platformState = 'blocked';
    else if (platformError) platformState = 'error';
    else if (streaming || platformBusy) platformState = 'busy';
    else if (authState === 'signed_in' && conversationRouteKey && composer) platformState = 'idle';
    const now = Number(input.now ?? Date.now());
    const recentUserInput = Number.isFinite(input.lastUserInputAt) && now - Number(input.lastUserInputAt) >= 0 && now - Number(input.lastUserInputAt) < 5000;
    return { auth_state: authState, conversation_route_present: Boolean(conversationRouteKey), conversation_route_stable: Boolean(conversationRouteKey), conversation_route_key: conversationRouteKey, composer_ready: composer, streaming, platform_state: platformState, blocking_interaction: blocking, recent_user_input: recentUserInput };
  }

  function isComposerTarget(node) { return node instanceof Element && Boolean(node.closest(COMPOSER.join(','))); }
  function classifyClick(node) {
    if (!(node instanceof Element)) return null;
    if (node.closest(STOP.join(','))) return 'stop_generating';
    if (node.closest(SEND.join(','))) return 'manual_message';
    return null;
  }
  function safeDispatchReason(state, expectedRouteKey) {
    if (state.auth_state !== 'signed_in') return 'authentication_required';
    if (!state.conversation_route_stable || state.conversation_route_key !== expectedRouteKey) return 'wrong_chat';
    if (state.streaming) return 'streaming';
    if (state.blocking_interaction) return 'blocking_interaction';
    if (state.platform_state === 'error') return 'platform_error';
    if (state.platform_state !== 'idle') return 'platform_busy';
    if (!state.composer_ready) return 'composer_unavailable';
    if (state.recent_user_input) return 'recent_user_input';
    return null;
  }

  function prepareFixedMessage(input = {}) {
    const state = observeChatGptPage({ href: input.href, lastUserInputAt: input.lastUserInputAt });
    const reason = safeDispatchReason(state, input.expectedRouteKey);
    if (reason) return { ok: false, reason };
    const composer = findComposer();
    if (!composer) return { ok: false, reason: 'composer_unavailable' };
    if (input.message !== FIXED_MESSAGE) return { ok: false, reason: 'dispatch_authorization_invalid' };
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) return { ok: false, reason: 'composer_unavailable' };
      setter.call(composer, FIXED_MESSAGE);
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
      return { ok: true };
    }
    composer.focus?.();
    let inserted = false;
    if (typeof document.execCommand === 'function') {
      try { inserted = document.execCommand('insertText', false, FIXED_MESSAGE) === true; } catch {}
    }
    if (!inserted) {
      composer.replaceChildren(document.createTextNode(FIXED_MESSAGE));
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    }
    return { ok: true };
  }

  function activateSend(input = {}) {
    const state = observeChatGptPage({ href: input.href, lastUserInputAt: input.lastUserInputAt });
    const reason = safeDispatchReason(state, input.expectedRouteKey);
    if (reason && reason !== 'composer_unavailable') return { ok: false, reason };
    const composer = findComposer();
    const send = composer ? findSendControl(composer) : null;
    if (!(send instanceof HTMLElement) || ('disabled' in send && send.disabled)) return { ok: false, reason: 'composer_unavailable' };
    send.click();
    return { ok: true };
  }

  globalThis.CodexProChatGptAdapter = Object.freeze({ observeChatGptPage, routeKey, isComposerTarget, classifyClick, prepareFixedMessage, activateSend });
})();
