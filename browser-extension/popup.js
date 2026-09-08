const $ = (id) => document.getElementById(id);
const setText = (node, value) => node.replaceChildren(document.createTextNode(String(value ?? '')));
function request(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
    if (!response?.ok) { reject(new Error(response?.error || 'Companion action failed.')); return; }
    resolve(response.value);
  }));
}
function render(state) {
  const bound = Boolean(state.currentChatBound);
  setText($('status'), state.available ? `Paired and available${bound ? ' · current chat bound' : ''}` : state.paired ? 'Paired; bridge unavailable' : 'Not paired');
  if (state.bridgeUrl) $('bridge').value = state.bridgeUrl;
  if (state.profileLabel) $('profile').value = state.profileLabel;
  $('task').hidden = !state.task;
  if (state.task) {
    const shortId = String(state.task.id || '').slice(-8);
    setText($('taskSummary'), `${state.task.title || 'Continuation task'} · ${shortId} · ${state.task.state} · rev ${state.task.revision}`);
  }
  const page = state.pageState || {};
  const bindable = state.available && state.task && page.auth_state === 'signed_in' && page.conversation_route_stable;
  const safe = page.auth_state === 'signed_in' && page.composer_ready && !page.streaming && page.platform_state === 'idle' && !page.blocking_interaction && !page.recent_user_input;
  $('bind').disabled = !bindable;
  $('continue').disabled = !state.available || !state.task || state.task.state !== 'continuation_ready' || !bound || !safe || state.task.manual_turn_pending || state.task.dispatch_authorization_pending;
}
async function refresh() {
  try { render(await request({ type: 'codexpro_get_state' })); setText($('error'), ''); }
  catch (error) { setText($('error'), error.message); }
}
$('pair').addEventListener('click', async () => {
  try {
    const state = await request({ type: 'codexpro_pair', bridgeUrl: $('bridge').value.trim(), profileLabel: $('profile').value.trim(), code: $('code').value.trim().toUpperCase() });
    render(state); setText($('error'), ''); $('code').value = '';
  } catch (error) { setText($('error'), error.message); }
});
$('bind').addEventListener('click', async () => {
  try { render(await request({ type: 'codexpro_bind' })); setText($('error'), ''); }
  catch (error) { setText($('error'), error.message); }
});
$('continue').addEventListener('click', async () => {
  try { render(await request({ type: 'codexpro_continue' })); setText($('error'), ''); }
  catch (error) { setText($('error'), error.message); }
});
void refresh();
