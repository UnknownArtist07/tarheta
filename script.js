/* ---------- Storage adapter: replace these methods with API calls for production. ---------- */
const Storage = (() => {
  const PROFILES_KEY = 'tarheta.profiles.v1';
  const SESSION_KEY = 'tarheta.owner.v1';
  const reserved = new Set(['admin', 'support', 'login', 'api', 'tarheta', 'help', 'about', 'settings']);

  function profiles() {
    try {
      const data = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (error) {
      console.error('Could not read saved Tarheta profiles.', error);
      throw new Error('Saved profiles could not be read. Check this browser’s storage settings.');
    }
  }
  function saveAll(data) {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(PROFILES_KEY, serialized);
      if (serialized.length > 3_500_000) showToast('Storage is nearly full. Remove large data before adding more.');
    } catch (error) {
      console.error('Could not save Tarheta profiles.', error);
      throw new Error('The profile could not be saved. Browser storage may be full or disabled.');
    }
  }
  function getProfile(username) { return profiles()[username] || null; }
  function saveProfile(profile, previousUsername) {
    const all = profiles();
    const existing = all[profile.username];
    if (existing && profile.username !== previousUsername) throw new Error('That username is already taken.');
    if (previousUsername && previousUsername !== profile.username) delete all[previousUsername];
    all[profile.username] = profile;
    saveAll(all);
  }
  function profileExists(username) { return Object.prototype.hasOwnProperty.call(profiles(), username); }
  function usernameAvailable(username, currentUsername) {
    return !reserved.has(username) && (!profileExists(username) || username === currentUsername);
  }
  function getOwner() {
    try { return localStorage.getItem(SESSION_KEY); }
    catch (error) { console.error('Could not read the local demo session.', error); return null; }
  }
  function setOwner(username) {
    try { localStorage.setItem(SESSION_KEY, username); }
    catch (error) { console.error('Could not save the local demo session.', error); throw new Error('Could not keep you signed in in this browser.'); }
  }
  function clearOwner() {
    try { localStorage.removeItem(SESSION_KEY); }
    catch (error) { console.error('Could not clear the local demo session.', error); }
  }
  function incrementViews(username) {
    const all = profiles();
    if (!all[username]) return 0;
    // Placeholder analytics: localStorage counters are per-browser and are not production analytics.
    all[username].views = (Number(all[username].views) || 0) + 1;
    saveAll(all);
    return all[username].views;
  }
  return { getProfile, saveProfile, profileExists, usernameAvailable, getOwner, setOwner, clearOwner, incrementViews };
})();

/* ---------- Validation and safe URL handling ---------- */
const Validation = (() => {
  const usernamePattern = /^[a-z0-9._]{3,30}$/;
  const phonePattern = /^(?:\+63|0)9\d{9}$/;
  function username(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!usernamePattern.test(normalized)) return { value: normalized, error: 'Use 3–30 lowercase letters, numbers, dots, or underscores.' };
    if (['admin', 'support', 'login', 'api', 'tarheta', 'help', 'about', 'settings'].includes(normalized)) return { value: normalized, error: 'That username is reserved.' };
    return { value: normalized, error: '' };
  }
  function phone(value) {
    if (!value) return '';
    const normalized = value.replace(/[\s()-]/g, '');
    return phonePattern.test(normalized) ? normalized : null;
  }
  function safeUrl(value, protocols = ['http:', 'https:']) {
    try {
      const url = new URL(value);
      return protocols.includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  function email(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
  return { username, phone, safeUrl, email };
})();

/* ---------- Router and current application state ---------- */
const state = { profile: null, editingUsername: null, toastTimer: null };
const $ = (id) => document.getElementById(id);

function goTo(name) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  const target = $('screen-' + name);
  if (!target) throw new Error('Unknown screen: ' + name);
  target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function routeProfile(username) {
  // Query-string and hash routes work from a static file host without server-side rewrite rules.
  const normalized = String(username || '').trim().toLowerCase();
  const profile = normalized ? Storage.getProfile(normalized) : null;
  if (!profile) { goTo('not-found'); return; }
  state.profile = profile;
  Storage.incrementViews(profile.username);
  renderPublicProfile(profile);
  goTo('public');
}
function updateAddress(username) {
  const url = new URL(window.location.href);
  url.searchParams.delete('u');
  url.hash = username ? '/' + encodeURIComponent(username) : '';
  history.replaceState({}, '', url);
}
function profileLink(username) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('u', username);
  return url.href;
}
function routeInitial() {
  const queryUsername = new URLSearchParams(window.location.search).get('u');
  const hashUsername = window.location.hash.match(/^#\/(.+)$/);
  if (queryUsername || hashUsername) {
    let username = queryUsername || hashUsername[1];
    try { username = decodeURIComponent(username); } catch (_) { /* Invalid escapes are treated as a missing username. */ }
    routeProfile(username);
    return;
  }
  const savedOwner = Storage.getOwner();
  const ownerProfile = savedOwner ? Storage.getProfile(savedOwner) : null;
  if (ownerProfile) { showOwnerHub(ownerProfile); return; }
  goTo('landing');
}

/* ---------- Shared UI helpers ---------- */
let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function setText(element, value) { element.textContent = value || ''; }
function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0].toUpperCase()).join('') || '?';
}
function headline(profile) { return [profile.title, profile.organization].filter(Boolean).join(' · '); }
function appendDetail(container, label, value) {
  if (!value) return;
  const row = document.createElement('div');
  row.className = 'cc-row';
  const key = document.createElement('span');
  key.className = 'k';
  key.textContent = label.toUpperCase();
  const text = document.createElement('span');
  text.textContent = value;
  row.append(key, text);
  container.append(row);
}
function createAnchor(href, label, className) {
  const link = document.createElement('a');
  link.className = className || 'btn btn-ghost';
  link.href = href;
  link.textContent = label;
  return link;
}
function addActionIcon(element, character) {
  const icon = document.createElement('span');
  icon.className = 'action-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = character;
  element.prepend(icon);
}

/* ---------- Owner profile, card rendering and manager ---------- */
function renderProfile(profile) {
  state.profile = profile;
  setText($('hubAvatar'), initials(profile.name));
  setText($('hubUrl'), profile.username);
  setText($('hubName'), profile.name);
  setText($('hubHeadline'), headline(profile));
  setText($('hubBio'), profile.bio);
  setText($('shareUrlText'), profileLink(profile.username));
  setText($('sidebarAvatar'), initials(profile.name));
  setText($('sidebarName'), profile.name);
  setText($('sidebarUsername'), `@${profile.username}`);
  document.querySelectorAll('[data-profile="name"]').forEach((el) => setText(el, profile.name));
  document.querySelectorAll('[data-profile="headline"]').forEach((el) => setText(el, headline(profile)));
  document.querySelectorAll('.card-profile-url').forEach((el) => setText(el, `TARHETA.PH/${profile.username.toUpperCase()}`));
  const details = $('ownerContactDetails');
  details.replaceChildren();
  appendDetail(details, 'Mobile', profile.phone);
  appendDetail(details, 'Email', profile.email);
  appendDetail(details, 'Website', profile.website);
  appendDetail(details, 'Organization', profile.organization);
  setText($('viewCount'), `${Number(profile.views) || 0} profile views`);
  setText($('ownerViewCount'), `${Number(profile.views) || 0} profile views recorded in this browser.`);
  renderCards($('ownerCards'), profile.cards || [], true);
  renderOwnerPreview(profile);
  renderQr(profile.username);
}
function renderOwnerPreview(profile) {
  const preview = $('ownerLivePreview');
  preview.replaceChildren();
  const identity = document.createElement('div');
  identity.className = 'preview-identity';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = initials(profile.name);
  const text = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = profile.name;
  const url = document.createElement('span');
  url.textContent = `tarheta.ph/${profile.username}`;
  const sub = document.createElement('span');
  sub.textContent = headline(profile);
  text.append(name, url, sub);
  identity.append(avatar, text);
  preview.append(identity);
  const callingCard = document.createElement('div');
  callingCard.className = 'preview-calling-card';
  const label = document.createElement('small');
  label.textContent = 'TARHETA · ID';
  const cardName = document.createElement('strong');
  cardName.textContent = profile.name;
  const cardHeadline = document.createElement('span');
  cardHeadline.textContent = headline(profile);
  callingCard.append(label, cardName, cardHeadline);
  preview.append(callingCard);
  const bio = document.createElement('p');
  bio.className = 'profile-bio';
  bio.textContent = profile.bio || '';
  preview.append(bio);
  const cards = document.createElement('div');
  cards.className = 'preview-cards';
  renderCards(cards, profile.cards || [], false);
  preview.append(cards);
}
function renderQr(username, holderId = 'profileQr') {
  const holder = $(holderId);
  holder.replaceChildren();
  if (typeof QRCode === 'undefined') {
    const note = document.createElement('p');
    note.className = 'field-hint';
    note.textContent = 'QR library did not load. Check your connection and reload to generate a QR code.';
    holder.append(note);
    return;
  }
  new QRCode(holder, { text: profileLink(username), width: 168, height: 168, colorDark: '#14171F', colorLight: '#F1ECDF', correctLevel: QRCode.CorrectLevel.M });
}
function cardUrl(card) {
  if (card.type === 'phone') {
    const phone = Validation.phone(card.value);
    return phone ? `tel:${phone}` : null;
  }
  if (card.type === 'email') return Validation.email(card.value) ? `mailto:${card.value}` : null;
  return Validation.safeUrl(card.value);
}
function cardLabel(type) {
  return ({ link: 'LINK', phone: 'PHONE', email: 'EMAIL', photo: 'PHOTO', video: 'VIDEO', document: 'DOCUMENT', location: 'LOCATION', payment: 'PAYMENT' })[type] || 'CARD';
}
function createCardElement(card, owner) {
  const wrapper = document.createElement('article');
  wrapper.className = `card ${card.type === 'photo' || card.type === 'payment' ? 'image' : card.type === 'video' ? 'media' : 'link'}`;
  wrapper.dataset.cardId = card.id;
  wrapper.draggable = Boolean(owner);
  if (owner) {
    wrapper.tabIndex = 0;
    wrapper.setAttribute('aria-label', `${card.title}. Focus then press Alt and arrow keys to reorder.`);
  }
  const kind = document.createElement('div');
  kind.className = 'card-kind';
  kind.textContent = `${cardLabel(card.type)}${owner && !card.isPublic ? ' · PRIVATE' : ''}`;
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = card.title;
  const subtitle = document.createElement('div');
  subtitle.className = 'card-sub';
  subtitle.textContent = card.type === 'phone' ? card.value : card.type === 'email' ? card.value : (card.value || '').replace(/^https?:\/\//, '');
  content.append(title, subtitle);
  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const dot = document.createElement('div');
  dot.className = 'card-dot';
  const mark = document.createElement('div');
  mark.className = 'card-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = ({ phone: '☎', email: '@', photo: '◱', video: '▶', payment: '$', location: '⌖', document: '↓' })[card.type] || '↗';
  foot.append(dot, mark);
  wrapper.append(kind, content, foot);
  if (owner) {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = 'Drag to reorder';
    wrapper.append(handle);
  }
  if (card.type === 'photo' || card.type === 'payment') {
    const imageUrl = Validation.safeUrl(card.value);
    if (imageUrl) {
      const image = document.createElement('img');
      image.className = 'card-image';
      image.src = imageUrl;
      image.alt = card.title;
      image.loading = 'lazy';
      image.width = 640;
      image.height = 400;
      image.addEventListener('error', () => image.remove(), { once: true });
      wrapper.prepend(image);
    }
  }
  const href = cardUrl(card);
  if (href) {
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', owner ? 'group' : 'link');
    wrapper.setAttribute('aria-label', owner
      ? `${card.title}. Focus then press Alt and arrow keys to reorder.`
      : `${card.title}, ${cardLabel(card.type).toLowerCase()}`);
    wrapper.addEventListener('click', (event) => {
      if (event.target.closest('.card-controls')) return;
      if (card.type === 'phone' || card.type === 'email') window.location.href = href;
      else window.open(href, '_blank', 'noopener,noreferrer');
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); wrapper.click(); }
    });
  }
  if (owner) {
    const controls = document.createElement('div');
    controls.className = 'card-controls';
    const actions = [['edit-card', 'Edit'], ['move-up', 'Move up'], ['move-down', 'Move down'], ['delete-card', 'Delete']];
    actions.forEach(([action, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card-control';
      button.dataset.action = action;
      button.dataset.cardId = card.id;
      button.setAttribute('aria-label', `${label} ${card.title}`);
      button.textContent = ({ 'edit-card': 'Edit', 'move-up': '↑', 'move-down': '↓', 'delete-card': '×' })[action];
      controls.append(button);
    });
    wrapper.append(controls);
  }
  return wrapper;
}
function renderCards(container, cards, owner) {
  container.replaceChildren();
  cards.forEach((card) => {
    if (!owner && !card.isPublic) return;
    container.append(createCardElement(card, owner));
  });
  if (owner) bindCardDrag(container);
}
function saveCurrentProfile(next) {
  Storage.saveProfile(next, state.profile.username);
  state.profile = next;
  Storage.setOwner(next.username);
  renderProfile(next);
}
function setPane(which) {
  $('pane-card').classList.toggle('active', which === 'card');
  $('pane-cards').classList.toggle('active', which === 'cards');
  $('pane-tools').classList.toggle('active', which === 'tools');
  document.querySelectorAll('[data-action="pane-card"],[data-action="pane-cards"],[data-action="pane-tools"],[data-action="owner-pane-card"],[data-action="owner-pane-cards"],[data-action="owner-pane-tools"]').forEach((button) => {
    const buttonPane = button.dataset.action.replace('owner-', '').replace('pane-', '');
    const active = buttonPane === which;
    button.classList.toggle('active', active);
    if (button.hasAttribute('role')) button.setAttribute('aria-selected', String(active));
  });
}
function flipCard(card) { card.classList.toggle('flipped'); }
function bindCardDrag(container) {
  let draggedId = null;
  container.querySelectorAll('.card').forEach((cardEl) => {
    cardEl.addEventListener('keydown', (event) => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const id = cardEl.dataset.cardId;
      reorderCard(id, null, event.key === 'ArrowUp' ? -1 : 1);
      requestAnimationFrame(() => container.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.focus());
    });
    cardEl.addEventListener('dragstart', (event) => {
      draggedId = cardEl.dataset.cardId;
      event.dataTransfer.effectAllowed = 'move';
    });
    cardEl.addEventListener('dragover', (event) => event.preventDefault());
    cardEl.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!draggedId || draggedId === cardEl.dataset.cardId) return;
      reorderCard(draggedId, cardEl.dataset.cardId);
      draggedId = null;
    });
  });
}
function reorderCard(id, targetId, direction) {
  const cards = [...(state.profile.cards || [])];
  const from = cards.findIndex((card) => card.id === id);
  if (from < 0) return;
  const [moving] = cards.splice(from, 1);
  const target = direction ? Math.max(0, Math.min(cards.length, from + direction)) : cards.findIndex((card) => card.id === targetId);
  cards.splice(target < 0 ? cards.length : target, 0, moving);
  try { saveCurrentProfile({ ...state.profile, cards }); }
  catch (error) { showToast(error.message); }
}
function openProfileEditor() {
  const form = $('profileForm');
  const profile = state.profile;
  state.editingUsername = profile.username;
  ['name', 'username', 'title', 'organization', 'phone', 'email', 'bio', 'website'].forEach((key) => { form.elements[key].value = profile[key] || ''; });
  updateProfilePreview();
  checkEditUsername();
  $('profileDialog').showModal();
}
function updateProfilePreview() {
  const form = $('profileForm');
  setText($('editUrlPreview'), form.elements.username.value.trim().toLowerCase() || 'username');
  setText($('editNamePreview'), form.elements.name.value.trim() || 'Your name');
  setText($('editHeadlinePreview'), [form.elements.title.value.trim(), form.elements.organization.value.trim()].filter(Boolean).join(' · '));
}
function checkEditUsername() {
  const username = $('editUsername').value.trim().toLowerCase();
  $('editUsername').value = username;
  setText($('editUrlPreview'), username || 'username');
  const result = Validation.username(username);
  const feedback = $('editUsernameFeedback');
  if (!username) { feedback.textContent = ''; feedback.className = 'field-hint'; return; }
  if (result.error) { feedback.textContent = result.error; feedback.className = 'field-hint invalid'; return; }
  if (!Storage.usernameAvailable(username, state.editingUsername)) { feedback.textContent = 'Username is already taken.'; feedback.className = 'field-hint invalid'; return; }
  feedback.textContent = 'Username is available.'; feedback.className = 'field-hint valid';
}
function openCardEditor(card) {
  const form = $('cardForm');
  form.reset();
  form.elements.cardId.value = card ? card.id : '';
  form.elements.title.value = card ? card.title : '';
  form.elements.type.value = card ? card.type : 'link';
  form.elements.value.value = card ? card.value : '';
  form.elements.isPublic.checked = card ? Boolean(card.isPublic) : true;
  setText($('cardDialogTitle'), card ? 'Edit card' : 'Add a card');
  $('cardDialog').showModal();
}
function bindTilt(card) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  card.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = card.getBoundingClientRect();
    const rx = ((event.clientY - rect.top) / rect.height - 0.5) * -6;
    const ry = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
    card.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
  card.addEventListener('pointerleave', () => { card.style.transform = 'perspective(600px) rotateX(0) rotateY(0)'; });
}
function bindHeroParallax() {
  const stage = document.querySelector('.stage');
  const stack = stage?.querySelector('.float-stack');
  if (!stage || !stack || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stack.style.transform = `perspective(900px) rotateX(${y * -3}deg) rotateY(${x * 4}deg)`;
  });
  stage.addEventListener('pointerleave', () => { stack.style.transform = 'perspective(900px) rotateX(0) rotateY(0)'; });
}

/* ---------- Public view, share actions and vCard download ---------- */
function renderPublicProfile(profile) {
  document.title = `${profile.name} — Tarheta`;
  document.querySelector('meta[name="description"]').content = profile.bio || `${profile.name} — ${headline(profile)}. Connect through Tarheta.`;
  document.querySelector('meta[property="og:title"]').content = `${profile.name} — Tarheta`;
  document.querySelector('meta[property="og:description"]').content = profile.bio || `${profile.name} — ${headline(profile)}. Connect through Tarheta.`;
  document.querySelector('meta[property="og:url"]').content = profileLink(profile.username);
  document.querySelector('meta[name="twitter:title"]').content = `${profile.name} — Tarheta`;
  document.querySelector('meta[name="twitter:description"]').content = profile.bio || `Connect with ${profile.name} on Tarheta.`;
  setText($('publicAvatar'), initials(profile.name));
  setText($('publicUrl'), profile.username);
  setText($('publicName'), profile.name);
  setText($('publicHeadline'), headline(profile));
  setText($('publicBio'), profile.bio);
  document.querySelectorAll('[data-public-profile="name"]').forEach((el) => setText(el, profile.name));
  document.querySelectorAll('[data-public-profile="headline"]').forEach((el) => setText(el, headline(profile)));
  setText($('publicCardUrl'), `TARHETA.PH/${profile.username.toUpperCase()}`);
  const details = $('publicContactDetails');
  details.replaceChildren();
  appendDetail(details, 'Mobile', profile.phone);
  appendDetail(details, 'Email', profile.email);
  appendDetail(details, 'Website', profile.website);
  appendDetail(details, 'Organization', profile.organization);
  renderCards($('publicCards'), profile.cards || [], false);
  renderQr(profile.username, 'publicQr');
  const primary = $('publicPrimaryActions');
  const secondary = $('publicSecondaryActions');
  primary.replaceChildren();
  secondary.replaceChildren();
  if (profile.phone) {
    const phone = Validation.phone(profile.phone);
    if (phone) {
      const call = createAnchor(`tel:${phone}`, 'Call', 'btn btn-stamp action-large');
      call.dataset.contactAction = 'call';
      primary.append(call);
      const sms = createAnchor(`sms:${phone}`, 'Message', 'btn btn-ghost action-large');
      sms.dataset.contactAction = 'message';
      addActionIcon(sms, '\u2709');
      secondary.append(sms);
    }
  }
  if (profile.email && Validation.email(profile.email)) {
    const email = createAnchor(`mailto:${profile.email}`, 'Email', 'btn btn-ghost action-large');
    addActionIcon(email, '@');
    secondary.append(email);
  }
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-paper action-large';
  save.dataset.action = 'save-contact';
  save.textContent = 'Save Contact';
  primary.append(save);
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'btn btn-ghost action-large';
  share.dataset.action = 'share';
  share.textContent = 'Share';
  addActionIcon(share, '\u2197');
  secondary.append(share);
  const mobileBar = $('mobileContactBar');
  mobileBar.replaceChildren();
  if (profile.phone && Validation.phone(profile.phone)) {
    const mobileCall = createAnchor(`tel:${Validation.phone(profile.phone)}`, 'Call', 'btn btn-stamp');
    mobileCall.dataset.contactAction = 'call';
    mobileBar.append(mobileCall);
  }
  const mobileSave = document.createElement('button');
  mobileSave.type = 'button';
  mobileSave.className = 'btn btn-paper';
  mobileSave.dataset.action = 'save-contact';
  mobileSave.textContent = 'Save contact';
  mobileBar.append(mobileSave);
}
function escapeVCard(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldVCardLine(line) {
  // vCard 3.0 limits each physical line to 75 UTF-8 octets; continuation whitespace counts too.
  const encoder = new TextEncoder();
  const chunks = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      chunks.push(current);
      current = ' ';
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join('\r\n');
}
function buildVCard(profile) {
  const nameParts = profile.name.trim().split(/\s+/);
  const family = nameParts.length > 1 ? nameParts.pop() : '';
  const given = nameParts.join(' ');
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0', `N:${escapeVCard(family)};${escapeVCard(given)};;;`,
    `FN:${escapeVCard(profile.name)}`
  ];
  if (profile.organization) lines.push(`ORG:${escapeVCard(profile.organization)}`);
  if (profile.title) lines.push(`TITLE:${escapeVCard(profile.title)}`);
  if (profile.phone && Validation.phone(profile.phone)) lines.push(`TEL;TYPE=CELL:${escapeVCard(Validation.phone(profile.phone))}`);
  if (profile.email && Validation.email(profile.email)) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(profile.email)}`);
  if (profile.website && Validation.safeUrl(profile.website)) lines.push(`URL:${escapeVCard(profile.website)}`);
  lines.push(`URL:${escapeVCard(`https://tarheta.ph/${encodeURIComponent(profile.username)}`)}`);
  if (profile.bio) lines.push(`NOTE:${escapeVCard(profile.bio)}`);
  lines.push('END:VCARD');
  return lines.map(foldVCardLine).join('\r\n') + '\r\n';
}
function saveContact(profile) {
  const blob = new Blob([buildVCard(profile)], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const filename = profile.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || profile.username;
  anchor.href = url;
  anchor.download = `${filename}.vcf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Contact file downloaded. Open it to add it to your contacts.');
}
async function shareProfile(profile) {
  const url = profileLink(profile.username);
  if (navigator.share) {
    try { await navigator.share({ title: `${profile.name} on Tarheta`, text: `Connect with ${profile.name}.`, url }); return; }
    catch (error) { if (error.name === 'AbortError') return; console.error('Native share failed.', error); }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Profile link copied.');
  } catch (error) {
    console.error('Clipboard write failed.', error);
    showToast('Could not share automatically. Copy the link from your address bar.');
  }
}
async function copyProfileLink() {
  try { await navigator.clipboard.writeText(profileLink(state.profile.username)); showToast('Profile link copied.'); }
  catch (error) { console.error('Clipboard write failed.', error); showToast('Clipboard unavailable. Copy the profile URL shown below.'); }
}
function downloadQr() {
  const image = $('profileQr').querySelector('canvas') || $('profileQr').querySelector('img');
  if (!image) { showToast('QR code is not available yet.'); return; }
  const anchor = document.createElement('a');
  anchor.href = image.tagName === 'CANVAS' ? image.toDataURL('image/png') : image.src;
  anchor.download = `${state.profile.username}-tarheta-qr.png`;
  anchor.click();
}

/* ---------- Form submission and application event wiring ---------- */
function getProfileFormValues(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const usernameCheck = Validation.username(values.username);
  if (usernameCheck.error) throw new Error(usernameCheck.error);
  if (!Storage.usernameAvailable(usernameCheck.value, state.editingUsername)) throw new Error('That username is already taken.');
  const phone = Validation.phone(values.phone || '');
  if (phone === null) throw new Error('Enter a Philippine mobile number like +639171234567 or 09171234567.');
  const email = String(values.email || '').trim();
  if (!Validation.email(email)) throw new Error('Enter a valid email address.');
  let website = String(values.website || '').trim();
  if (website && !Validation.safeUrl(website)) throw new Error('Website must use a valid http:// or https:// URL.');
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  return {
    name: String(values.name || '').trim(),
    username: usernameCheck.value,
    title: String(values.title || '').trim(),
    organization: String(values.organization || '').trim(),
    phone: phone || '',
    email,
    bio: String(values.bio || '').trim(),
    website,
  };
}
function showOwnerHub(profile) {
  document.title = 'tarheta — digital calling card';
  document.querySelector('meta[name="description"]').content = 'One link for your contact details, calling card, and the things you want to share.';
  document.querySelector('meta[property="og:title"]').content = 'Tarheta — digital calling card';
  document.querySelector('meta[property="og:description"]').content = 'One link for your contact details, calling card, and the things you want to share.';
  state.profile = profile;
  Storage.setOwner(profile.username);
  updateAddress('');
  renderProfile(profile);
  setPane('card');
  goTo('hub');
}

document.addEventListener('click', async (event) => {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    const action = actionElement.dataset.action;
    if (action === 'landing') { updateAddress(''); goTo('landing'); }
    if (action === 'register-screen') goTo('register');
    if (action === 'login-screen') goTo('login');
    if (action === 'demo') routeProfile('demo');
    if (action === 'logout') { Storage.clearOwner(); state.profile = null; updateAddress(''); goTo('landing'); showToast('You have logged out.'); }
    if (action === 'pane-card') setPane('card');
    if (action === 'pane-cards') setPane('cards');
    if (action === 'pane-tools') setPane('tools');
    if (action === 'owner-pane-card') setPane('card');
    if (action === 'owner-pane-cards') setPane('cards');
    if (action === 'owner-pane-tools') setPane('tools');
    if (action === 'edit-profile') openProfileEditor();
    if (action === 'add-card') openCardEditor(null);
    if (action === 'close-dialog') actionElement.closest('dialog').close();
    if (action === 'copy-link') await copyProfileLink();
    if (action === 'download-qr') downloadQr();
    if (action === 'share') await shareProfile(state.profile);
    if (action === 'view-public' && state.profile) window.open(profileLink(state.profile.username), '_blank', 'noopener,noreferrer');
    if (action === 'copy-contact') {
      try { await navigator.clipboard.writeText($('contactValue').textContent); showToast('Number copied.'); }
      catch (error) { console.error('Clipboard write failed.', error); showToast('Could not copy the number.'); }
    }
    if (action === 'save-contact' && state.profile) saveContact(state.profile);
    if (action === 'edit-card' && state.profile) openCardEditor(state.profile.cards.find((card) => card.id === actionElement.dataset.cardId));
    if (action === 'delete-card' && state.profile) {
      const cards = state.profile.cards.filter((card) => card.id !== actionElement.dataset.cardId);
      try { saveCurrentProfile({ ...state.profile, cards }); showToast('Card deleted.'); } catch (error) { showToast(error.message); }
    }
    if ((action === 'move-up' || action === 'move-down') && state.profile) reorderCard(actionElement.dataset.cardId, null, action === 'move-up' ? -1 : 1);
  }
  const contactLink = event.target.closest('[data-contact-action]');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const touchActivation = event.pointerType === 'touch' || coarsePointer;
  const pointerActivation = event.detail > 0;
  if (contactLink && finePointer && !touchActivation && pointerActivation) {
    event.preventDefault();
    openContactPopover(contactLink.dataset.contactAction);
  }
  const card = event.target.closest('#ccCard, #publicCcCard');
  if (card && event.detail !== 0 && !event.target.closest('button')) flipCard(card);
});
document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('#ccCard, #publicCcCard')) {
    event.preventDefault();
    flipCard(event.target);
  }
  if (event.key === 'Escape') document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const typing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (!typing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && state.profile && $('screen-hub').classList.contains('active')) {
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); setPane('cards'); openCardEditor(null); }
    if (event.key.toLowerCase() === 'e') { event.preventDefault(); openProfileEditor(); }
    if (event.key.toLowerCase() === 'c') { event.preventDefault(); copyProfileLink(); }
  }
});
document.addEventListener('pointerover', (event) => {
  const card = event.target.closest('.card');
  if (card && !card.dataset.tiltBound) { card.dataset.tiltBound = 'true'; bindTilt(card); }
});
bindHeroParallax();

$('regName').addEventListener('input', () => {
  const input = $('regUser');
  if (!input.dataset.touched) {
    input.value = $('regName').value.toLowerCase().trim().replace(/[^a-z0-9._]+/g, '').slice(0, 30);
    checkRegistrationUsername();
  }
});
$('regUser').addEventListener('input', () => { $('regUser').dataset.touched = 'true'; checkRegistrationUsername(); });
$('profileForm').elements.username.addEventListener('input', checkEditUsername);
['name', 'title', 'organization'].forEach((key) => $('profileForm').elements[key].addEventListener('input', updateProfilePreview));
function checkRegistrationUsername() {
  const input = $('regUser');
  const candidate = input.value.trim().toLowerCase();
  input.value = candidate;
  setText($('urlPreview'), candidate || 'username');
  const result = Validation.username(candidate);
  const feedback = $('usernameFeedback');
  if (!candidate) { feedback.textContent = '3+ characters: lowercase letters, numbers, dots, underscores.'; feedback.className = 'field-hint'; return; }
  if (result.error) { feedback.textContent = result.error; feedback.className = 'field-hint invalid'; return; }
  if (!Storage.usernameAvailable(candidate)) { feedback.textContent = 'Username is already taken.'; feedback.className = 'field-hint invalid'; return; }
  feedback.textContent = 'Username is available.'; feedback.className = 'field-hint valid';
  setText($('registerAsideUrl'), candidate);
}
$('regUser').addEventListener('input', () => setText($('registerAsideUrl'), $('regUser').value || 'username'));
function openContactPopover(kind) {
  const number = Validation.phone(state.profile?.phone || '');
  if (!number) return;
  setText($('contactPopoverTitle'), kind === 'message' ? 'Message this number' : 'Call this number');
  setText($('contactValue'), number);
  renderQr(state.profile.username, 'popoverQr');
  $('contactPopover').showModal();
}
$('regForm').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const profile = { ...getProfileFormValues(event.currentTarget), cards: [], views: 0, createdAt: new Date().toISOString() };
    Storage.saveProfile(profile);
    showOwnerHub(profile);
    showToast('Your hub has been created!');
  } catch (error) { showToast(error.message); }
});
$('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const username = String(new FormData(event.currentTarget).get('username') || '').trim().toLowerCase();
  const profile = Storage.getProfile(username);
  if (!profile) { showToast('No saved profile for that username in this browser.'); return; }
  // This username-only localStorage sign-in is a demo convenience, NOT real authentication.
  showOwnerHub(profile);
  showToast(`Welcome back, ${profile.name}.`);
});
$('profileForm').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const values = getProfileFormValues(event.currentTarget);
    const next = { ...state.profile, ...values };
    saveCurrentProfile(next);
    state.editingUsername = null;
    $('profileDialog').close();
    showToast('Profile updated.');
  } catch (error) { showToast(error.message); }
});
$('cardType').addEventListener('change', () => {
  const placeholders = { link: 'https://example.com', phone: '+639171234567', email: 'hello@example.com', photo: 'https://example.com/photo.jpg', video: 'https://example.com/video', document: 'https://example.com/resume.pdf', location: 'https://maps.google.com/?q=Manila', payment: 'https://example.com/payment-qr.png' };
  $('cardValue').placeholder = placeholders[$('cardType').value];
});
$('cardForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const type = String(data.get('type'));
  const value = String(data.get('value') || '').trim();
  if (type === 'phone' && Validation.phone(value) === null) { showToast('Enter a Philippine mobile number in +63 or 09 format.'); return; }
  if (type === 'email' && !Validation.email(value)) { showToast('Enter a valid email address.'); return; }
  if (type !== 'phone' && type !== 'email' && !Validation.safeUrl(value)) { showToast('Use a valid http:// or https:// URL for this card.'); return; }
  const id = String(data.get('cardId') || '');
  const existing = state.profile.cards.find((card) => card.id === id);
  const generatedId = window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const card = { id: id || generatedId, title: String(data.get('title') || '').trim(), type, value, isPublic: data.get('isPublic') === 'on' };
  const cards = existing ? state.profile.cards.map((item) => item.id === id ? card : item) : [...state.profile.cards, card];
  try { saveCurrentProfile({ ...state.profile, cards }); $('cardDialog').close(); showToast(existing ? 'Card updated.' : 'Card added.'); }
  catch (error) { showToast(error.message); }
});

/* ---------- Seed data and first-load route ---------- */
function seedDemo() {
  if (Storage.profileExists('demo')) return;
  Storage.saveProfile({
    username: 'demo', name: 'Juan Dela Cruz', title: 'BS Computer Engineering', organization: 'PUP Main',
    phone: '09171234567', email: 'juan@example.com', bio: 'Student, maker, and curious about how things work.',
    website: 'https://example.com', views: 0, createdAt: new Date().toISOString(),
    cards: [
      { id: 'demo-school', title: 'School Portal', type: 'link', value: 'https://portal.pup.edu.ph', isPublic: true },
      { id: 'demo-linkedin', title: 'LinkedIn', type: 'link', value: 'https://www.linkedin.com', isPublic: true },
      { id: 'demo-video', title: 'Intro Reel', type: 'video', value: 'https://example.com/intro-video', isPublic: true },
      { id: 'demo-private', title: 'Private draft', type: 'link', value: 'https://example.com', isPublic: false }
    ]
  });
}
try {
  seedDemo();
  routeInitial();
} catch (error) {
  console.error('Tarheta could not start.', error);
  goTo('landing');
  showToast(error.message || 'Tarheta could not load saved data.');
}
