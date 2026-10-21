// Booking requests: the customer's "Request to book" flow and the Uniworld team inbox.
// Nothing is charged in the app. A request goes to the Uniworld team, an advisor
// confirms availability and the final price, and the status shows up in My trips.
import { money as liveMoney } from './live-rates.js';

// Uniworld contact details (from uniworldinc.com). Put the WhatsApp number in
// international format with no + or spaces (for example 923001234567) to show
// WhatsApp buttons across the app.
export const CONTACT = {
  email: 'contact@uniworldinc.com',
  phone: '+18444002310',
  phoneLabel: '+1 (844) 400-2310',
  whatsapp: '',
};

const STATUS = {
  new: ['Request sent', 'Your request is with the Uniworld team. An advisor will contact you soon.'],
  in_progress: ['Advisor on it', 'An advisor is checking real availability and prices for you.'],
  confirmed: ['Confirmed', 'Uniworld has confirmed this trip. See the message from your advisor.'],
  cancelled: ['Cancelled', 'This request is cancelled. You can send a new one any time.'],
};
const KIND = { stay: 'STAY', holiday: 'JOURNEY', experience: 'EXPERIENCE', flight: 'FLIGHT', hotel: 'HOTEL' };
const REACH = { whatsapp: 'WhatsApp', call: 'phone', email: 'email' };

let d = null;      // helpers from app.js: api, openModal, toast, fmt, esc, icon, state, onChange
let draft = null;  // the request being filled in
let memoryKey = '';

export function initRequests(deps) {
  d = deps;
  document.addEventListener('click', onClick);
}

// ---------- Small helpers ----------
const $ = (s, root = document) => root.querySelector(s);
const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
function datesOf(r) {
  if (!r.start) return '';
  if (r.kind === 'flight') return r.oneWay || !r.end || r.end === r.start ? `${day(r.start)} · one way` : `${day(r.start)} → ${day(r.end)}`;
  return r.end && r.end !== r.start ? `${day(r.start)} → ${day(r.end)}` : day(r.start);
}
const people = (r) => `${r.travelers} ${r.kind === 'stay' || r.kind === 'hotel' ? 'guest' : 'traveler'}${r.travelers > 1 ? 's' : ''}`;
function priceOf(r) {
  if (r.seen) {
    const s = r.seen;
    const per = s.per === 'night' ? ' / night' : s.per === 'person' ? ' per person' : '';
    return { label: `Live price seen on ${s.source}`, value: liveMoney(s.amount, s.currency) + per, extra: s.total ? `${liveMoney(s.total, s.currency)} total` : '' };
  }
  if (r.estimateUsd) return { label: 'Guide price', value: d.fmt(r.estimateUsd), extra: '' };
  return null;
}
function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) { const n = Math.round(s / 86400); return `${n} day${n > 1 ? 's' : ''} ago`; }
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function savedContact() { try { return JSON.parse(localStorage.getItem('uniworld:contact')) || {}; } catch { return {}; } }
function rememberContact(c) { try { localStorage.setItem('uniworld:contact', JSON.stringify(c)); } catch { /* optional */ } }
// wa.me needs the full international number; fix the common local formats.
function waNumber(phone, market) {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (market === 'PKR' && /^03\d{9}$/.test(digits)) digits = '92' + digits.slice(1);
    else if (market === 'GBP' && /^07\d{9}$/.test(digits)) digits = '44' + digits.slice(1);
    else if (market === 'USD' && /^\d{10}$/.test(digits)) digits = '1' + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

// ---------- Customer: request to book ----------
export function openRequest(trip) {
  draft = { trip, requestId: crypto.randomUUID(), sending: false };
  const c = savedContact(), e = d.esc, ic = d.icon;
  const reach = c.contactBy in REACH ? c.contactBy : 'whatsapp';
  d.openModal(`<div class="checkout-header"><span class="eyebrow">REQUEST TO BOOK</span><h2 id="modalTitle">Let’s make it real.</h2><p class="req-lede">Send this to a Uniworld advisor. Nothing is booked or charged yet.</p></div>
  <div class="checkout-body"><div>
    <form id="requestForm" novalidate>
      <div class="checkout-fields">
        <label class="full">Full name<input class="field-input" name="name" autocomplete="name" maxlength="100" value="${e(c.name)}" placeholder="Your full name" required/></label>
        <label class="full">Phone or WhatsApp<input class="field-input" name="phone" type="tel" autocomplete="tel" maxlength="40" value="${e(c.phone)}" placeholder="+92 300 1234567" required/><small class="req-hint">Include your country code, like +92, +44 or +1.</small></label>
        <label class="full">Email <small class="req-optional">optional</small><input class="field-input" name="email" type="email" autocomplete="email" maxlength="150" value="${e(c.email)}" placeholder="you@example.com"/></label>
        <fieldset class="full req-reach"><legend>Best way to reach you</legend>${Object.entries({ whatsapp: 'WhatsApp', call: 'Phone call', email: 'Email' }).map(([v, l]) => `<label><input type="radio" name="contactBy" value="${v}" ${reach === v ? 'checked' : ''}/><span>${l}</span></label>`).join('')}</fieldset>
        <label class="full">Anything we should know? <small class="req-optional">optional</small><textarea class="field-input" name="note" rows="3" maxlength="800" placeholder="Room preferences, mobility needs, flexible dates…"></textarea></label>
        <label class="full checkout-consent"><input type="checkbox" name="consent"/><span>Uniworld may contact me about this request.</span></label>
        <details class="full req-privacy"><summary>How we use your details</summary><p>Your name, phone, email and trip details go to the Uniworld team so an advisor can arrange this trip. They are saved online with this request and never sold. This phone also remembers your contact details to fill in the next request faster.</p></details>
      </div>
      <p class="form-error" id="requestError" role="alert"></p>
      <button class="dark-button pay-button" type="submit">Send request ${ic('arrow-right')}</button>
      <p class="small-print">An advisor confirms availability, the final price and how to pay before anything is booked.</p>
    </form>
  </div>${summaryCard(trip)}</div>`);
  $('#requestForm').addEventListener('submit', submit);
}

function summaryCard(t) {
  const p = priceOf(t), e = d.esc;
  return `<aside class="checkout-summary req-summary">${t.image ? `<img src="${e(t.image)}" alt=""/>` : ''}<span class="preview-pill">${KIND[t.kind] || 'TRIP'}</span><h4>${e(t.title)}</h4>${t.details ? `<p>${e(t.details)}</p>` : ''}<p>${datesOf(t)} · ${people(t)}</p>${p ? `<div class="rate-line rate-total"><span>${p.label}</span><b>${p.value}</b></div>${p.extra ? `<p class="req-extra">${p.extra}</p>` : ''}` : ''}<p class="small-print">Prices change. Your advisor confirms the final price.</p></aside>`;
}

async function submit(ev) {
  ev.preventDefault();
  if (!draft || draft.sending) return;
  const form = ev.currentTarget, err = $('#requestError'), button = form.querySelector('[type=submit]');
  const f = Object.fromEntries(new FormData(form));
  const name = String(f.name || '').trim(), phone = String(f.phone || '').trim(), email = String(f.email || '').trim();
  const contactBy = String(f.contactBy || 'whatsapp'), note = String(f.note || '').trim(), digits = phone.replace(/\D/g, '');
  const problem = name.length < 2 ? 'Please enter your full name.'
    : !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15 ? 'Please enter a phone or WhatsApp number with your country code.'
    : email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Please check your email address.'
    : contactBy === 'email' && !email ? 'Add your email address, or choose WhatsApp or a call.'
    : !f.consent ? 'Please tick the box so Uniworld can contact you about this request.' : '';
  if (problem) { err.textContent = problem; return; }
  err.textContent = '';
  rememberContact({ name, phone, email, contactBy });
  draft.sending = true;
  button.disabled = true;
  button.textContent = 'Sending your request…';
  const t = draft.trip;
  try {
    const r = await d.api('requests', 'POST', {
      requestId: draft.requestId, kind: t.kind, productId: t.productId, start: t.start, end: t.end, travelers: t.travelers,
      rooms: t.rooms, room: t.room, from: t.from, to: t.to, cabin: t.cabin, hotelName: t.hotelName, city: t.city,
      image: t.kind === 'hotel' ? t.image : undefined, seen: t.seen,
      name, phone, email, contactBy, note, consent: true, market: d.state.currency,
    });
    d.state.requests = [r, ...d.state.requests.filter((x) => x.recordId !== r.recordId)];
    draft = null;
    d.onChange?.();
    showRequest(r, true);
  } catch (ex) {
    if (draft) draft.sending = false;
    if (err.isConnected) err.textContent = `${ex.message} You can safely try again.`;
    if (button.isConnected) { button.disabled = false; button.innerHTML = `Send request ${d.icon('arrow-right')}`; }
  }
}

export function showRequest(r, fresh = false) {
  const [label, text] = STATUS[r.status] || STATUS.new, e = d.esc, ic = d.icon, p = priceOf(r);
  const open = r.status === 'new' || r.status === 'in_progress';
  d.openModal(`<div class="success-panel req-panel">
    <div class="success-icon">${ic(r.status === 'cancelled' ? 'x' : 'check')}</div>
    <span class="eyebrow">${fresh ? 'REQUEST SENT' : `YOUR ${KIND[r.kind] || 'TRIP'} REQUEST`}</span>
    <h2 id="modalTitle">${fresh ? `Thank you, ${e(firstName(r.name))}.` : e(r.title)}</h2>
    <p>${fresh ? `A Uniworld advisor will contact you by ${REACH[r.contactBy] || 'phone'} to confirm availability, the final price and how to pay. Nothing is booked or charged yet.` : text}</p>
    <div class="confirmation-code">${e(r.id)}</div>
    <span class="req-status ${e(r.status)}">${label}</span>
    ${r.customerMessage ? `<div class="req-message"><span class="eyebrow">MESSAGE FROM UNIWORLD</span><p>${e(r.customerMessage)}</p></div>` : ''}
    <div class="booking-facts"><strong>${e(r.title)}</strong>${r.details ? `<p>${e(r.details)}</p>` : ''}<p>${datesOf(r)} · ${people(r)}</p>${p ? `<p>${p.label}: <b>${p.value}</b>${p.extra ? ` · ${p.extra}` : ''}</p>` : ''}<small>${e(r.name)} · ${e(r.phone)}${r.email ? ' · ' + e(r.email) : ''}</small></div>
    <div class="booking-actions">${contactButtons(r)}<button class="text-button" data-action="req-summary" data-id="${e(r.recordId)}">${ic('download')} Download summary</button><button class="text-button" data-action="bookings">Go to My trips ${ic('arrow-right')}</button>${open ? `<button class="text-button danger" data-action="req-cancel" data-id="${e(r.recordId)}">Cancel request</button>` : ''}</div>
  </div>`);
}

function contactButtons(r) {
  const ic = d.icon, text = `Hello Uniworld, this is ${r.name}. My request ${r.id}: ${r.title}, ${datesOf(r)}.`;
  const wa = CONTACT.whatsapp ? `<a class="dark-button" href="https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${ic('phone')} WhatsApp Uniworld</a>` : '';
  return `${wa}<a class="${wa ? 'outline-button' : 'dark-button'}" href="tel:${CONTACT.phone}">${ic('phone')} Call ${CONTACT.phoneLabel}</a><a class="outline-button" href="mailto:${CONTACT.email}?subject=${encodeURIComponent(`Request ${r.id}: ${r.title}`)}&body=${encodeURIComponent(text + '\n\n')}">${ic('mail')} Email Uniworld</a>`;
}

export function requestCards(list) {
  const e = d.esc, ic = d.icon;
  return list.map((r) => `<article class="plan-card booking-card req-card">${r.image ? `<img src="${e(r.image)}" alt="${e(r.destination || r.title)}" loading="lazy"/>` : `<div class="flight-tile">${ic(r.kind === 'flight' ? 'plane' : 'compass')}</div>`}<div><span class="eyebrow">${KIND[r.kind] || 'TRIP'} · ${e(r.id)}</span><h3>${e(r.title)}</h3><p>${datesOf(r)} · ${people(r)}</p><span class="req-status ${e(r.status)}">${(STATUS[r.status] || STATUS.new)[0]}</span>${r.customerMessage ? `<p class="req-card-msg">${ic('mail')} Message from Uniworld</p>` : ''}</div><button class="dark-button compact" data-action="req-view" data-id="${e(r.recordId)}">View ${ic('arrow-right')}</button></article>`).join('');
}

function summaryText(r) {
  const p = priceOf(r);
  const lines = ['UNIWORLD — BOOKING REQUEST', 'This is a request, not a confirmed booking.', '', `Reference: ${r.id}`, `Status: ${(STATUS[r.status] || STATUS.new)[0]}`, `Sent: ${new Date(r.created).toLocaleString('en-GB')}`, '', `Trip: ${r.title}`];
  if (r.details) lines.push(`Details: ${r.details}`);
  lines.push(`Dates: ${datesOf(r)}`, `Travelers: ${r.travelers}`);
  if (p) lines.push(`${p.label}: ${p.value}${p.extra ? ' (' + p.extra + ')' : ''}`);
  lines.push('', `Name: ${r.name}`, `Phone / WhatsApp: ${r.phone}`);
  if (r.email) lines.push(`Email: ${r.email}`);
  if (r.note) lines.push(`Your note: ${r.note}`);
  if (r.customerMessage) lines.push('', `Message from Uniworld: ${r.customerMessage}`);
  lines.push('', `Uniworld · ${CONTACT.email} · ${CONTACT.phoneLabel}`);
  return lines.join('\n');
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function onClick(ev) {
  const b = ev.target.closest('[data-action^="req-"]');
  if (!b) return;
  const a = b.dataset.action, e = d.esc, r = d.state.requests.find((x) => x.recordId === b.dataset.id);
  if (!r) return;
  if (a === 'req-view') showRequest(r);
  else if (a === 'req-summary') { download(`Uniworld-${r.id}.txt`, summaryText(r)); d.toast('Your request summary is ready.'); }
  else if (a === 'req-cancel') d.openModal(`<div class="modal-body"><h2 id="modalTitle">Cancel this request?</h2><p>${e(r.title)} · ${e(r.id)}</p><p>The Uniworld team will see that you cancelled it. Nothing has been charged.</p><button class="dark-button" data-action="req-cancel-yes" data-id="${e(r.recordId)}">Yes, cancel request</button><button class="text-button" data-action="req-view" data-id="${e(r.recordId)}">Keep my request</button><p class="form-error" id="cancelError" role="alert"></p></div>`, true);
  else if (a === 'req-cancel-yes') {
    b.disabled = true;
    try {
      const x = await d.api('requests/' + r.recordId, 'PATCH', { action: 'cancel' });
      d.state.requests = d.state.requests.map((v) => (v.recordId === x.recordId ? x : v));
      d.onChange?.();
      showRequest(x);
      d.toast('Your request is cancelled.');
    } catch (ex) {
      const out = $('#cancelError');
      if (out) out.textContent = ex.message;
      b.disabled = false;
    }
  }
}

// ---------- Team inbox (#staff) ----------
const GROUPS = { open: ['new', 'in_progress'], new: ['new'], in_progress: ['in_progress'], confirmed: ['confirmed'], cancelled: ['cancelled'], all: null };
const FILTERS = [['open', 'Open'], ['new', 'New'], ['in_progress', 'Advisor on it'], ['confirmed', 'Confirmed'], ['cancelled', 'Cancelled'], ['all', 'All']];
function getKey() { try { return localStorage.getItem('uniworld:staff-key') || memoryKey; } catch { return memoryKey; } }
function setKey(key) { memoryKey = key; try { if (key) localStorage.setItem('uniworld:staff-key', key); else localStorage.removeItem('uniworld:staff-key'); } catch { /* memory only */ } }
function getSeen() { try { return Number(localStorage.getItem('uniworld:staff-seen')) || 0; } catch { return 0; } }
function setSeen(ms) { try { localStorage.setItem('uniworld:staff-seen', String(ms)); } catch { /* optional */ } }

export function mountStaff(main) {
  const e = d.esc, ic = d.icon;
  let list = [], filter = 'open', timer = 0, alive = true, checkedAt = 0;
  const seen = getSeen();
  const staffApi = (path, method = 'GET', data) => d.api(path, method, data, { 'x-uniworld-staff': getKey() });
  const count = (k) => (GROUPS[k] ? list.filter((r) => GROUPS[k].includes(r.status)).length : list.length);

  function loginView(message = '', setup = false) {
    document.title = 'Team inbox — Uniworld';
    main.innerHTML = `<section class="wrap staff-page"><div class="staff-login"><span class="eyebrow">UNIWORLD TEAM</span><h1>Team inbox</h1>
      <p>Booking requests from the app arrive here. Enter the team key saved in Supabase as <b>UNIWORLD_STAFF_KEY</b>.</p>
      ${setup ? `<div class="detail-notice">Team access isn’t set up yet. In Supabase, open Edge Functions, then Secrets, and add <b>UNIWORLD_STAFF_KEY</b> with a long password only your team knows. Then enter it here.</div>` : ''}
      <form id="staffLogin"><label>Team key<input class="field-input" name="key" type="password" autocomplete="current-password" required/></label><button class="dark-button" type="submit">Open inbox ${ic('arrow-right')}</button><p class="form-error" role="alert">${e(message)}</p></form>
    </div></section>`;
  }

  function card(r) {
    const p = priceOf(r), wa = waNumber(r.phone, r.market), st = STATUS[r.status] || STATUS.new;
    const hello = `Hello ${firstName(r.name)}, this is Uniworld about your request ${r.id} (${r.title}).`;
    return `<article class="staff-card ${e(r.status)}">
      <div class="staff-card-top"><span class="req-status ${e(r.status)}">${st[0]}</span>${r.created > seen ? '<span class="staff-new">NEW</span>' : ''}<b>${e(r.id)}</b><time datetime="${new Date(r.created).toISOString()}">${ago(r.created)}</time></div>
      <h3>${e(r.title)}</h3>
      <p class="staff-meta">${KIND[r.kind] || 'TRIP'}${r.details ? ' · ' + e(r.details) : ''}</p>
      <p class="staff-meta">${datesOf(r)} · ${people(r)}${r.market ? ' · ' + e(r.market) + ' market' : ''}</p>
      ${p ? `<p class="staff-meta">${p.label}: <b>${p.value}</b>${p.extra ? ' · ' + p.extra : ''}${r.seen?.airline ? ' · ' + e(r.seen.airline) : ''}${r.seen?.checkedAt ? ' · seen ' + ago(Date.parse(r.seen.checkedAt)) : ''}</p>` : ''}
      <div class="staff-person"><div><b>${e(r.name)}</b><span>Prefers ${REACH[r.contactBy] || 'WhatsApp'}</span></div>
        <div class="staff-contact"><a href="tel:${e(String(r.phone).replace(/[^\d+]/g, ''))}">${ic('phone')} ${e(r.phone)}</a>${wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(hello)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${r.email ? `<a href="mailto:${e(r.email)}?subject=${encodeURIComponent('Your Uniworld request ' + r.id)}&body=${encodeURIComponent(hello + '\n\n')}">${ic('mail')} Email</a>` : ''}</div></div>
      ${r.note ? `<blockquote class="staff-quote">${e(r.note)}</blockquote>` : ''}
      ${r.customerMessage ? `<p class="staff-meta">Message to customer: ${e(r.customerMessage)}</p>` : ''}
      <details class="staff-update"><summary>Update request</summary>
        <form data-staff-form="${e(r.recordId)}">
          <label>Status<select class="field-input" name="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Message the customer sees in the app<textarea class="field-input" name="customerMessage" rows="3" maxlength="600" placeholder="e.g. Confirmed: 2 rooms, 7 nights. Pay by bank transfer within 48 hours.">${e(r.customerMessage || '')}</textarea></label>
          <label><span>Team note <small>private</small></span><textarea class="field-input" name="staffNote" rows="2" maxlength="1000">${e(r.staff?.note || '')}</textarea></label>
          <div class="staff-form-actions"><button class="dark-button compact" type="submit">Save</button><span class="staff-saved" role="status"></span></div>
        </form>
      </details>
    </article>`;
  }

  function inboxView() {
    const shown = GROUPS[filter] ? list.filter((r) => GROUPS[filter].includes(r.status)) : list;
    const fresh = list.filter((r) => r.status === 'new').length;
    document.title = `${fresh ? `(${fresh}) ` : ''}Team inbox — Uniworld`;
    main.innerHTML = `<section class="wrap staff-page">
      <div class="staff-head"><div><span class="eyebrow">UNIWORLD TEAM</span><h1>Requests</h1><p>${count('new')} new · ${count('in_progress')} in progress · updated ${new Date(checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p></div>
        <div class="staff-tools"><button class="outline-button compact" data-staff="refresh">Refresh</button><button class="text-button" data-staff="signout">Sign out</button></div></div>
      <div class="chip-row staff-filters">${FILTERS.map(([k, l]) => `<button class="chip ${filter === k ? 'active' : ''}" data-staff="filter" data-filter="${k}" aria-pressed="${filter === k}">${l} (${count(k)})</button>`).join('')}</div>
      <div class="staff-list">${shown.length ? shown.map(card).join('') : `<div class="no-results">${ic('compass')}<h3>Nothing here yet.</h3><p>New booking requests from the app show up here.</p></div>`}</div>
    </section>`;
  }

  async function load() {
    try {
      const v = await staffApi('staff/requests');
      if (!alive) return;
      list = v.requests || [];
      checkedAt = Date.now();
      inboxView();
    } catch (ex) {
      if (!alive) return;
      if (/not set up/i.test(ex.message)) loginView('', true);
      else if (/team key/i.test(ex.message)) { setKey(''); loginView(ex.message); }
      else if (list.length) d.toast(ex.message);
      else main.innerHTML = `<section class="wrap staff-page"><div class="staff-login"><span class="eyebrow">UNIWORLD TEAM</span><h1>Team inbox</h1><p class="form-error" role="alert">${e(ex.message)}</p><button class="dark-button" data-staff="refresh">Try again</button></div></section>`;
    }
  }

  async function onSubmit(ev) {
    const form = ev.target;
    if (form.id === 'staffLogin') {
      ev.preventDefault();
      const key = String(new FormData(form).get('key') || '').trim(), btn = form.querySelector('button'), out = form.querySelector('.form-error');
      btn.disabled = true; out.textContent = '';
      try { await d.api('staff/check', 'GET', undefined, { 'x-uniworld-staff': key }); setKey(key); await load(); }
      catch (ex) { if (/not set up/i.test(ex.message)) loginView('', true); else { out.textContent = ex.message; btn.disabled = false; } }
      return;
    }
    const id = form.dataset.staffForm;
    if (!id) return;
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form)), btn = form.querySelector('button'), note = form.querySelector('.staff-saved');
    btn.disabled = true; note.textContent = 'Saving…';
    try {
      const x = await staffApi('staff/requests/' + id, 'PATCH', { status: f.status, customerMessage: f.customerMessage, staffNote: f.staffNote });
      list = list.map((r) => (r.recordId === x.recordId ? x : r));
      inboxView();
      d.toast(`${x.id} saved. The customer sees the update in the app.`);
    } catch (ex) { note.textContent = ex.message; btn.disabled = false; }
  }

  function onClickStaff(ev) {
    const b = ev.target.closest('[data-staff]');
    if (!b) return;
    if (b.dataset.staff === 'refresh') load();
    else if (b.dataset.staff === 'filter') { filter = b.dataset.filter; inboxView(); }
    else if (b.dataset.staff === 'signout') { setKey(''); setSeen(Date.now()); list = []; loginView('Signed out.'); }
  }

  main.addEventListener('submit', onSubmit);
  main.addEventListener('click', onClickStaff);
  // Check for new requests every minute while the inbox is open (not while someone is typing an update).
  timer = setInterval(() => {
    if (document.hidden || !getKey() || main.querySelector('.staff-update[open]')) return;
    load();
  }, 60000);
  if (getKey()) { main.innerHTML = `<section class="wrap staff-page"><p class="staff-loading">Loading requests…</p></section>`; load(); }
  else loginView();

  return () => {
    alive = false;
    clearInterval(timer);
    main.removeEventListener('submit', onSubmit);
    main.removeEventListener('click', onClickStaff);
    if (list.length) setSeen(Math.max(...list.map((r) => r.created)));
  };
}
