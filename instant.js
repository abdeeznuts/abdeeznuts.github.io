// Instant hotel booking: the guest chooses a room, pays on liteAPI's secure payment form and
// the hotel is booked automatically. If anything fails, the booking goes to the Uniworld team.
// Switched on only when the Uniworld server has a liteAPI key (state.instant.hotels).
import { money } from './live-rates.js';

let d = null; // openModal, closeModal, api, esc, icon, state, toast, showRequest, mergeRequest
const DRAFT = 'uniworld:instant-draft';
const SDK = 'https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1';

export function initInstant(deps) {
  d = deps;
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
}
export const instantOn = () => !!d?.state?.instant?.hotels;

let current = null; // { h, st, offer }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const cancelText = (o) => (o.refundable ? `Free cancellation${o.freeCancelUntil ? ' until ' + new Date(o.freeCancelUntil.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}` : 'Non-refundable');
function saved() { try { return JSON.parse(localStorage.getItem('uniworld:contact')) || {}; } catch { return {}; } }

// Step 1: the rooms you can book right now.
export function openInstant(h, st) {
  if (!h?.offers?.length) return;
  current = { h, st, offer: null };
  const e = d.esc, ic = d.icon, img = h.images?.[0]?.large;
  d.openModal(`<div class="modal-body ib">
    ${img ? `<img class="ib-photo" src="${e(img)}" alt="${e(h.name)}"/>` : ''}
    <span class="eyebrow">${e((st.label || '').toUpperCase())}${h.stars ? ` · ${h.stars}-STAR` : ''} · INSTANT CONFIRMATION</span>
    <h2 id="modalTitle">${e(h.name)}</h2>
    <p class="ib-sub">${h.rating ? `<b>${h.rating.toFixed(1)}</b> guest rating · ` : ''}${e(h.address || '')}</p>
    <p class="ib-sub">${day(st.checkIn)} → ${day(st.checkOut)} · ${plural(st.nights, 'night')} · ${plural(st.adults, 'guest')}</p>
    <h3 class="ib-h">Choose your room</h3>
    <ul class="ib-rooms">${h.offers.map((o, i) => `<li><div><b>${e(o.name)}</b><small>${[o.board, cancelText(o), o.maxOccupancy ? `Sleeps ${o.maxOccupancy}` : ''].filter(Boolean).map(e).join(' · ')}</small></div><div class="ib-price"><b>${money(o.total, o.currency || st.currency)}</b><small>${plural(st.nights, 'night')} total</small><button class="dark-button compact" data-ib="room" data-i="${i}">Book</button></div></li>`).join('')}</ul>
    <p class="small-print">Prices include taxes the hotel charges through us. You pay securely by card and get your confirmation right away. Uniworld’s team is here if anything needs changing.</p>
  </div>`);
}

// Step 2: who is staying (names as on the passport), then hold the room.
function guestForm(offer) {
  const { h, st } = current, e = d.esc, c = saved();
  const [first, ...rest] = String(c.name || '').trim().split(/\s+/);
  current.offer = offer;
  current.requestId = crypto.randomUUID();
  d.openModal(`<div class="modal-body ib">
    <span class="eyebrow">BOOK NOW · INSTANT CONFIRMATION</span>
    <h2 id="modalTitle">Who’s staying?</h2>
    <div class="ib-summary"><b>${e(h.name)}</b><span>${e(offer.name)}${offer.board ? ' · ' + e(offer.board) : ''}</span><span>${day(st.checkIn)} → ${day(st.checkOut)} · ${plural(st.adults, 'guest')}</span><span>${e(cancelText(offer))}</span><strong>${money(offer.total, offer.currency || st.currency)}</strong></div>
    <form id="ibGuest" class="checkout-fields" novalidate>
      <label>First name <small class="req-optional">as on passport</small><input class="field-input" name="firstName" autocomplete="given-name" maxlength="60" value="${e(first || '')}" required/></label>
      <label>Last name<input class="field-input" name="lastName" autocomplete="family-name" maxlength="60" value="${e(rest.join(' '))}" required/></label>
      <label class="full">Email <small class="req-optional">the hotel confirmation goes here</small><input class="field-input" name="email" type="email" autocomplete="email" maxlength="150" value="${e(c.email || '')}" required/></label>
      <label class="full">Phone or WhatsApp<input class="field-input" name="phone" type="tel" autocomplete="tel" maxlength="40" value="${e(c.phone || '')}" placeholder="+92 300 1234567" required/></label>
      <label class="full">Requests for the hotel <small class="req-optional">optional</small><textarea class="field-input" name="note" rows="2" maxlength="500" placeholder="Early check-in, high floor, wheelchair access…"></textarea></label>
      <label class="full checkout-consent"><input type="checkbox" name="consent"/><span>I agree to the booking terms shown on the next step, and Uniworld may contact me about this booking.</span></label>
      <p class="form-error full" id="ibError" role="alert"></p>
      <button class="dark-button full" type="submit">Continue to secure payment ${d.icon('arrow-right')}</button>
    </form>
  </div>`);
}

async function hold(form) {
  const f = Object.fromEntries(new FormData(form)), err = form.querySelector('#ibError'), btn = form.querySelector('[type=submit]');
  const holder = { firstName: String(f.firstName || '').trim(), lastName: String(f.lastName || '').trim(), email: String(f.email || '').trim(), phone: String(f.phone || '').trim() };
  const digits = holder.phone.replace(/\D/g, '');
  const problem = !holder.firstName || !holder.lastName ? 'Enter the first and last name as on the passport.'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder.email) ? 'Enter an email address for the hotel confirmation.'
    : !/^\+?[\d\s().-]+$/.test(holder.phone) || digits.length < 7 || digits.length > 15 ? 'Please enter a phone or WhatsApp number with your country code.'
    : !f.consent ? 'Please tick the box to continue.' : '';
  if (problem) { err.textContent = problem; return; }
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Holding your room…';
  try { localStorage.setItem('uniworld:contact', JSON.stringify({ ...saved(), name: `${holder.firstName} ${holder.lastName}`, email: holder.email, phone: holder.phone })); } catch { /* optional */ }
  const { h, st, offer, requestId } = current;
  const trip = { hotelId: h.hotelId, hotelName: h.name, city: st.label, image: h.images?.[0]?.large || '', checkIn: st.checkIn, checkOut: st.checkOut, adults: st.adults, roomName: offer.name, board: offer.board || '', sandbox: !!st.sandbox };
  try {
    const p = await d.api('instant/hotel/prebook', 'POST', { requestId, offerId: offer.offerId, trip });
    try { localStorage.setItem(DRAFT, JSON.stringify({ requestId, holder, note: String(f.note || '').trim(), consent: true, market: d.state.currency, title: h.name, created: Date.now() })); } catch { /* the booking can still finish in this tab */ }
    payStep(p, trip);
  } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.innerHTML = `Continue to secure payment ${d.icon('arrow-right')}`; }
}

// Step 3: liteAPI's payment form. After paying, the page comes back to Uniworld and the booking completes.
function payStep(p, trip) {
  const e = d.esc;
  d.openModal(`<div class="modal-body ib">
    <span class="eyebrow">SECURE PAYMENT</span>
    <h2 id="modalTitle">Pay ${money(p.price, p.currency)}</h2>
    <div class="ib-summary"><b>${e(trip.hotelName)}</b><span>${e(trip.roomName)}${p.board ? ' · ' + e(p.board) : ''}</span><span>${day(trip.checkIn)} → ${day(trip.checkOut)}</span><span>${p.refundable ? 'Free cancellation' + (p.freeCancelUntil ? ' until ' + e(p.freeCancelUntil.slice(0, 10)) : '') : 'Non-refundable'}</span></div>
    ${p.priceChanged ? `<p class="ib-note">The hotel’s price changed slightly since your search. This is the final price.</p>` : ''}
    ${p.sandbox ? `<p class="ib-note">Test mode: use card 4242 4242 4242 4242, any future date and any 3 digits. No real money moves.</p>` : ''}
    <div id="ibPay" class="ib-pay"><p class="ls-wait">Loading the secure payment form…</p></div>
    <p class="small-print">Your card is charged by liteAPI (Nuitée), our booking partner, on its secure form. Uniworld never sees your card details.</p>
  </div>`);
  loadSdk().then(() => {
    const config = {
      publicKey: p.sandbox ? 'sandbox' : 'live',
      appearance: { theme: 'flat' },
      options: { business: { name: 'Uni World Travel' } },
      targetElement: '#ibPay',
      secretKey: p.secretKey,
      returnUrl: `${location.origin}/?instant=${encodeURIComponent(current.requestId)}#trips`,
    };
    const box = document.getElementById('ibPay');
    if (box) box.innerHTML = '';
    new window.LiteAPIPayment(config).handlePayment();
  }).catch(() => {
    const box = document.getElementById('ibPay');
    if (box) box.innerHTML = `<p class="form-error">The payment form couldn’t load. Check your connection and try again, or send a request to an advisor instead.</p>`;
  });
}
let sdkPromise = null;
function loadSdk() {
  if (window.LiteAPIPayment) return Promise.resolve();
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK; s.async = true;
    s.onload = () => (window.LiteAPIPayment ? resolve() : reject(new Error('sdk')));
    s.onerror = () => { sdkPromise = null; reject(new Error('sdk')); };
    document.head.append(s);
  });
  return sdkPromise;
}

// Step 4 (after the payment page sends the guest back): finish the booking.
export async function finishInstant() {
  const params = new URLSearchParams(location.search);
  const requestId = params.get('instant');
  if (!requestId) return;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT)); } catch { draft = null; }
  history.replaceState(null, '', location.pathname + (location.hash || '#trips'));
  if (!draft || draft.requestId !== requestId) { d.toast('We couldn’t find this booking on this phone. If you paid, Uniworld will contact you.'); return; }
  d.openModal(`<div class="modal-body ib"><span class="eyebrow">ALMOST DONE</span><h2 id="modalTitle">Confirming your hotel…</h2><p class="ls-wait">This takes a few seconds. Please keep this page open.</p></div>`, true);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await d.api('instant/hotel/book', 'POST', { requestId, holder: draft.holder, note: draft.note, consent: true, market: draft.market });
      try { localStorage.removeItem(DRAFT); } catch { /* optional */ }
      d.mergeRequest(r);
      d.showRequest(r, false);
      d.toast(r.status === 'confirmed' ? 'Booked! Your hotel is confirmed.' : 'Our team is finishing this booking for you.');
      return;
    } catch (ex) {
      if (attempt === 2) { d.openModal(`<div class="modal-body ib"><h2 id="modalTitle">We’re still confirming.</h2><p>${d.esc(ex.message)}</p><button class="dark-button" data-ib="retry-finish" data-id="${d.esc(requestId)}">Try again</button><p class="small-print">If your card was charged, your booking is safe: Uniworld will confirm it with you.</p></div>`, true); return; }
      await new Promise((res) => setTimeout(res, 2500));
    }
  }
}

function onClick(ev) {
  const b = ev.target.closest('[data-ib]');
  if (!b) return;
  if (b.dataset.ib === 'room' && current) guestForm(current.h.offers[Number(b.dataset.i)]);
  else if (b.dataset.ib === 'retry-finish') { history.replaceState(null, '', `${location.pathname}?instant=${encodeURIComponent(b.dataset.id)}#trips`); finishInstant(); }
}
function onSubmit(ev) {
  if (ev.target.id !== 'ibGuest') return;
  ev.preventDefault();
  hold(ev.target);
}
