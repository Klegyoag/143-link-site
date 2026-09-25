let webMe = null;
let webHome = null;
let webView = 'home';
let webConversation = null;
let webBusy = false;
const webMain = document.querySelector('#webMain');
const safe = value => escapeHtml(String(value ?? ''));
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {dateStyle:'medium',timeStyle:'short'});
};
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

function connection(label, kind = '') {
  const badge = document.querySelector('#connection');
  badge.textContent = label;
  badge.className = `web-connection ${kind}`;
}

function setView(view) {
  webView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  webMain.innerHTML = '<div class="web-skeleton" aria-label="Loading your space"><div></div><div></div><div></div></div>';
  loadView().catch(showError);
}

function showError(error) {
  if (error.status === 401) {
    sessionStorage.removeItem('143_link_token');
    localStorage.removeItem('143_link_refresh');
    location.replace('login.html');
    return;
  }
  connection('Trying to reconnect', 'offline');
  webMain.innerHTML = `<div class="web-panel"><h2>Could not load this page</h2><p>${safe(error.message || 'Check your connection and try again.')}</p><button class="btn btn-primary" id="retryView">Try again</button></div>`;
  document.querySelector('#retryView').addEventListener('click', () => setView(webView));
}

async function loadView() {
  if (webBusy) return;
  webBusy = true;
  try {
    if (webView === 'home') await loadHome();
    if (webView === 'memories') await loadMemories();
    if (webView === 'chat') await loadChat();
    if (webView === 'account') await loadAccount();
    connection('Connected');
  } finally { webBusy = false; }
}

async function loadHome() {
  webHome = await api('/home');
  const partner = webHome.partner;
  const memories = rows(webHome.recent_memories);
  const greeting = webMe?.display_name || webMe?.username || 'you';
  webMain.innerHTML = `
    <div class="kicker"><span class="kicker-dot"></span>YOUR PRIVATE SPACE</div>
    <h1 class="web-title">Hello, ${safe(greeting)} ♡</h1>
    <p class="web-subtitle">Your moments and conversations, together on this screen.</p>
    <div class="web-grid">
      <section class="web-panel"><h2>Us, right now</h2>${partner ? `<div class="web-stat">${safe(partner.display_name || partner.username)}</div><p>Your connected partner.</p>` : '<div class="web-stat">Just you, for now</div><p>Open 143 on your phone to share your pairing code and connect your partner.</p>'}</section>
      <section class="web-panel"><h2>New for you</h2><div class="web-stat">${safe(webHome.unread_messages || 0)}</div><p>Unread messages</p><button class="text-link" data-go="chat">Open chat →</button></section>
      <section class="web-panel wide"><h2>Recent memories</h2>${memories.length ? `<div class="web-stack">${memories.map(memory => `<div class="web-row"><div><h3>${safe(memory.title || 'A moment together')}</h3><p>${safe(memory.content?.body || memory.type || '')}</p></div><span class="web-date">${safe(dateLabel(memory.created_at))}</span></div>`).join('')}</div>` : '<div class="web-empty">Your shared moments will appear here. Create one in Memories.</div>'}<button class="text-link" data-go="memories">View memories →</button></section>
    </div>`;
  webMain.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setView(button.dataset.go)));
}

async function loadMemories() {
  const memories = rows(await api('/memories?limit=30'));
  webMain.innerHTML = `
    <div class="kicker"><span class="kicker-dot"></span>KEPT CLOSE</div><h1 class="web-title">Memories</h1><p class="web-subtitle">Little moments, saved in your shared space.</p>
    <section class="web-panel"><h2>Add a moment</h2><form class="web-form stacked" id="memoryForm"><label for="memoryTitle">Title</label><input id="memoryTitle" maxlength="255" required placeholder="A day worth remembering"><label for="memoryBody">Your memory</label><textarea id="memoryBody" maxlength="10000" required placeholder="What made it special?"></textarea><div class="error" id="memoryError"></div><button class="btn btn-primary" type="submit">Save memory</button></form></section>
    <section class="web-panel" style="margin-top:18px"><h2>All moments</h2><div class="web-list">${memories.length ? memories.map(memory => `<article class="web-row"><div><h3>${safe(memory.title || 'A moment together')}</h3><p>${safe(memory.content?.body || '')}</p></div><span class="web-date">${safe(dateLabel(memory.created_at))}</span></article>`).join('') : '<div class="web-empty">No memories yet. Save the first one above.</div>'}</div></section>`;
  document.querySelector('#memoryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const error = document.querySelector('#memoryError');
    const button = event.currentTarget.querySelector('button');
    error.textContent = ''; button.disabled = true;
    try {
      await api('/memories', {method:'POST',body:JSON.stringify({type:'moment',title:document.querySelector('#memoryTitle').value.trim(),content:{body:document.querySelector('#memoryBody').value.trim()},tags:[]})});
      setView('memories');
    } catch (reason) { error.textContent = reason.message; button.disabled = false; }
  });
}

async function loadChat() {
  if (!webHome?.partner) webHome = await api('/home');
  if (!webHome.partner) {
    webMain.innerHTML = '<div class="kicker"><span class="kicker-dot"></span>STAY CLOSE</div><h1 class="web-title">Chat</h1><div class="web-panel"><h2>Connect your partner first</h2><p>Share your pairing code from the 143 phone app. Once you are together, your conversation will appear here.</p></div>';
    return;
  }
  const conversation = await api('/conversations/couple');
  webConversation = conversation.id;
  const messages = rows(await api(`/conversations/${encodeURIComponent(webConversation)}/messages?limit=50`)).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  webMain.innerHTML = `
    <div class="kicker"><span class="kicker-dot"></span>JUST US</div><h1 class="web-title">Chat</h1><p class="web-subtitle">A conversation with ${safe(webHome.partner.display_name || webHome.partner.username || 'your partner')}.</p>
    <div class="web-chat" id="chatList">${messages.length ? messages.map(message => `<div class="web-message ${message.sender_id === webMe.id ? 'mine' : ''}"><div>${safe(message.body || (message.type === 'text' ? '' : `[${message.type}]`))}</div><small>${safe(dateLabel(message.created_at))}</small></div>`).join('') : '<div class="web-empty">No messages yet. Say hello.</div>'}</div>
    <form class="web-form" id="chatForm"><input id="chatText" maxlength="20000" required autocomplete="off" aria-label="Message" placeholder="Write a message…"><button class="btn btn-primary" type="submit">Send</button></form><div class="error" id="chatError"></div>`;
  const list = document.querySelector('#chatList'); list.scrollTop = list.scrollHeight;
  document.querySelector('#chatForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.querySelector('#chatText'); const error = document.querySelector('#chatError');
    const body = input.value.trim(); if (!body) return;
    error.textContent = ''; event.currentTarget.querySelector('button').disabled = true;
    try { await api(`/conversations/${encodeURIComponent(webConversation)}/messages`, {method:'POST',body:JSON.stringify({type:'text',body,payload:{}})}); await loadChat(); }
    catch (reason) { error.textContent = reason.message; event.currentTarget.querySelector('button').disabled = false; }
  });
}

async function loadAccount() {
  const devices = rows(await api('/linked-devices'));
  webMain.innerHTML = `
    <div class="kicker"><span class="kicker-dot"></span>YOUR SPACE</div><h1 class="web-title">Us</h1><p class="web-subtitle">Your account and trusted screens.</p>
    <div class="web-grid"><section class="web-panel"><h2>Your account</h2><div class="web-stat">${safe(webMe.display_name || webMe.username)}</div><p>@${safe(webMe.username)}</p></section><section class="web-panel"><h2>Your partner</h2><div class="web-stat">${safe(webHome?.partner?.display_name || webHome?.partner?.username || 'Not linked yet')}</div><p>Pair with your partner from the phone app.</p></section><section class="web-panel wide"><h2>Linked devices</h2>${devices.length ? devices.map(device => `<div class="web-row"><div><h3>${safe(device.title || 'Linked device')}</h3><p>${safe(device.data?.platform || 'web')} · ${safe(device.status || 'active')}</p></div><span class="web-date">${safe(dateLabel(device.created_at))}</span></div>`).join('') : '<div class="web-empty">No linked devices found.</div>'}<p>To revoke a screen, open Linked devices in the 143 phone app.</p></section></div>`;
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#signOut').addEventListener('click', async () => {
  try { await api('/auth/logout', {method:'POST'}); } catch (_) { /* Local sign-out still proceeds. */ }
  sessionStorage.removeItem('143_link_token');
  localStorage.removeItem('143_link_refresh');
  location.replace('login.html');
});

(async () => {
  if (!access && !await renewAccess()) { location.replace('login.html'); return; }
  try { webMe = await api('/me'); webHome = await api('/home'); setView('home'); }
  catch (error) { showError(error); }
})();
setInterval(() => {
  if (document.visibilityState !== 'visible' || webBusy || webView !== 'chat' || !webConversation || document.activeElement?.id === 'chatText') return;
  loadChat().catch(() => connection('Trying to reconnect', 'offline'));
}, 12000);
