import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('browser-extension/chatgpt-adapter.js', 'utf8');
const context = { URL, Date, globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'chatgpt-adapter.js' });
const { observeChatGptPage, routeKey } = context.CodexProChatGptAdapter;

function queryFixture(selectors = []) {
  const set = new Set(selectors);
  return (selector) => set.has(selector) ? { present: true } : null;
}
const chatBase = 'https://chatgpt.com';
const chatId = '12345678-abcd-4def-9999-123456789abc';
const chatUrl = `${chatBase}/c/${chatId}?utm_source=test`;
assert.equal(routeKey(chatUrl), 'c:12345678-abcd-4def-9999-123456789abc');
assert.equal(routeKey('https://chatgpt.com/'), null);
assert.equal(routeKey(`${chatBase}/c/${chatId}?branch=other`), null);

const signedIn = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]']), now: 10_000 });
assert.equal(signedIn.auth_state, 'signed_in');
assert.equal(signedIn.conversation_route_stable, true);
assert.equal(signedIn.composer_ready, true);
assert.equal(signedIn.platform_state, 'idle');
const emptyComposer = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea']), now: 10_000 });
assert.equal(emptyComposer.composer_ready, true, 'empty ChatGPT composer should be ready before Send is rendered');
assert.equal(emptyComposer.platform_state, 'idle', 'empty composer should remain safely idle before fixed text insertion');

const hiddenFallbackOnly = observeChatGptPage({ href: chatUrl, query: queryFixture(['textarea[name="prompt-textarea"]']), now: 10_000 });
assert.equal(hiddenFallbackOnly.auth_state, 'signed_in');
assert.equal(hiddenFallbackOnly.composer_ready, true);

const signedOut = observeChatGptPage({ href: 'https://chatgpt.com/auth/login', query: queryFixture(['a[href*="/auth/login"]']) });
assert.equal(signedOut.auth_state, 'signed_out');
assert.equal(signedOut.platform_state, 'unknown');

const newChat = observeChatGptPage({ href: 'https://chatgpt.com/', query: queryFixture(['#prompt-textarea','[data-testid="send-button"]']) });
assert.equal(newChat.conversation_route_stable, false);
assert.equal(newChat.platform_state, 'unknown');
const streaming = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]','[data-testid="stop-button"]']) });
assert.equal(streaming.streaming, true);
assert.equal(streaming.platform_state, 'busy');
const streamingAria = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]','button[aria-label="Stop generating"]']) });
assert.equal(streamingAria.streaming, true, 'ChatGPT accessible Stop generating control was not recognized');
assert.equal(streamingAria.platform_state, 'busy');

const busy = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]','[aria-busy="true"]']) });
assert.equal(busy.platform_state, 'busy');
const errored = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]','button[aria-label="Retry"]']) });
assert.equal(errored.platform_state, 'error');
const blocked = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]','[role="dialog"]']) });
assert.equal(blocked.platform_state, 'blocked');
assert.equal(blocked.blocking_interaction, true);
const recent = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]']), now: 10_000, lastUserInputAt: 7_500 });
assert.equal(recent.recent_user_input, true);
const staleInput = observeChatGptPage({ href: chatUrl, query: queryFixture(['#prompt-textarea','[data-testid="send-button"]']), now: 10_000, lastUserInputAt: 1_000 });
assert.equal(staleInput.recent_user_input, false);

const serialized = JSON.stringify(signedIn);
for (const forbidden of ['message','prompt','response','text','html','email','account']) assert(!serialized.toLowerCase().includes(forbidden), `adapter output leaked forbidden field ${forbidden}`);
for (const forbiddenSource of ['innerText','textContent','document.body.innerHTML','localStorage','sessionStorage']) assert(!source.includes(forbiddenSource), `adapter source contains forbidden text/storage primitive ${forbiddenSource}`);
const contentSource = await fs.readFile('browser-extension/content.js', 'utf8');
assert(contentSource.includes('suppressProgrammaticInput'), 'content controller does not distinguish extension insertion from genuine user input');
assert(contentSource.includes('!suppressProgrammaticInput && event.isTrusted'), 'programmatic fixed-message insertion can still mark recent_user_input');
assert(!/chrome\.runtime\.sendMessage\([^;]*\)\.catch/.test(contentSource), 'content controller assumes sendMessage returns a Promise');

// Exercise the fixed-message DOM path in a separate minimal browser-like VM.
class FakeElement { closest() { return null; } }
class FakeHTMLElement extends FakeElement { constructor(){ super(); this.clicked = 0; this.disabled = false; } click(){ this.clicked += 1; } }
class FakeTextarea extends FakeHTMLElement { constructor(){ super(); this._value=''; this.events=[]; } dispatchEvent(event){ this.events.push(event); return true; } }
Object.defineProperty(FakeTextarea.prototype, 'value', { get(){ return this._value; }, set(value){ this._value=String(value); } });
class FakeInputEvent { constructor(type, init){ this.type=type; this.init=init; } }
const composer = new FakeTextarea(); const send = new FakeHTMLElement();
const dispatchContext = { URL, Date, globalThis: null, Element: FakeElement, HTMLElement: FakeHTMLElement, HTMLTextAreaElement: FakeTextarea, InputEvent: FakeInputEvent, location: { href: chatUrl }, document: { querySelector(selector){ if (selector === '#prompt-textarea') return composer; if (selector === '[data-testid=\"send-button\"]') return send; return null; }, createTextNode(value){ return { value }; } } };
dispatchContext.globalThis = dispatchContext; vm.runInNewContext(source, dispatchContext, { filename: 'chatgpt-adapter-dispatch.js' });
const dispatchAdapter = dispatchContext.CodexProChatGptAdapter;
const fixed = 'Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.';
assert.equal(dispatchAdapter.prepareFixedMessage({ message: fixed, expectedRouteKey: routeKey(chatUrl), href: chatUrl, lastUserInputAt: 0 }).ok, true);
assert.equal(composer.value, fixed);
assert.equal(composer.events.length, 1);
assert.equal(dispatchAdapter.activateSend({ expectedRouteKey: routeKey(chatUrl), href: chatUrl, lastUserInputAt: 0 }).ok, true);
assert.equal(send.clicked, 1);
assert.equal(dispatchAdapter.activateSend({ expectedRouteKey: 'c:wrongroute', href: chatUrl, lastUserInputAt: 0 }).reason, 'wrong_chat');
assert.equal(send.clicked, 1);


// Exercise ChatGPT's contenteditable editor path without reading page/message text.
class FakeEditable extends FakeHTMLElement { constructor(){ super(); this.events=[]; } focus(){ this.focused=true; } dispatchEvent(event){ this.events.push(event); return true; } replaceChildren(){ this.replaced=true; } }
const editable = new FakeEditable(); const editableSend = new FakeHTMLElement(); const execCalls = [];
const editableContext = { URL, Date, globalThis: null, Element: FakeElement, HTMLElement: FakeHTMLElement, HTMLTextAreaElement: FakeTextarea, InputEvent: FakeInputEvent, location: { href: chatUrl }, document: { querySelector(selector){ if (selector === '#prompt-textarea') return editable; if (selector === '[data-testid="send-button"]') return editableSend; return null; }, createTextNode(value){ return { value }; }, execCommand(command, _ui, value){ execCalls.push({ command, value }); return command === 'insertText'; } } };
editableContext.globalThis = editableContext; vm.runInNewContext(source, editableContext, { filename: 'chatgpt-adapter-contenteditable.js' });
const editableAdapter = editableContext.CodexProChatGptAdapter;
assert.equal(editableAdapter.prepareFixedMessage({ message: fixed, expectedRouteKey: routeKey(chatUrl), href: chatUrl, lastUserInputAt: 0 }).ok, true);
assert.equal(execCalls.length, 1);
assert.equal(execCalls[0].command, 'insertText');
assert.equal(execCalls[0].value, fixed);
assert.equal(editableAdapter.prepareFixedMessage({ message: 'arbitrary', expectedRouteKey: routeKey(chatUrl), href: chatUrl, lastUserInputAt: 0 }).reason, 'dispatch_authorization_invalid');
assert.equal(execCalls.length, 1, 'arbitrary message reached editor insertion path');

console.log('chatgpt browser adapter smoke passed');
