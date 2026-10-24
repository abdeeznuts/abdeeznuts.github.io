// Instant flight booking: the traveler picks a fare, adds names as on the passport, pays by card
// on Stripe's secure page, and the app buys the ticket from the airline through Duffel. If the
// airline can't issue it, the payment is refunded automatically and the Uniworld team takes over.
// Switched on only when the Uniworld server has Duffel and Stripe keys (state.instant.flights).
import { money } from './live-rates.js';
import { countryList, loadWorld } from './places.js';

let d = null; // openModal, api, esc, icon, state, toast, showRequest, mergeRequest
const DRAFT = 'uniworld:flight-draft';
const HOME_COUNTRY = { PKR: 'PK', GBP: 'GB', USD: 'US' };

export function initInstantFlights(deps) {
  d = deps;
  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', onClick);
}
export const instantFlightsOn = () => !!d?.state?.instant?.flights;

// Airline fares come in the airline's currency (USD, GBP, EUR, SAR…).
export function anyMoney(amount, cur) {
  if (['PKR', 'GBP', 'USD'].includes(cur)) return money(amount, cur);
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Math.round(Number(amount))); } catch { return `${cur} ${Math.round(Number(amount)).toLocaleString('en-US')}`; }
}

let current = null; // { o, fs, requestId }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clock = (s) => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
const day = (s) => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function saved() { try { return JSON.parse(localStorage.getItem('uniworld:contact')) || {}; } catch { return {}; } }
const stopsText = (x) => (x.stops === 0 ? 'Nonstop' : `${plural(x.stops, 'stop')}${x.layovers?.length ? ' via ' + x.layovers.map((l) => l.id).filter(Boolean).join(', ') : ''}`);
const sliceText = (x) => `${day(x.depart?.time)} · ${x.depart?.id || ''} ${clock(x.depart?.time)} → ${x.arrive?.id || ''} ${clock(x.arrive?.time)} · ${stopsText(x)}`;
const rulesText = (o) => [o.refundable ? 'Refundable before departure (airline fees may apply)' : 'Non-refundable', o.changeable ? 'Changes allowed (airline fees may apply)' : 'No changes'].join(' · ');

function travelerFields(i, docs, countries, home, prefill) {
  const e = d.esc, max = iso(new Date());
  const minExpiry = iso(new Date(Date.now() + 864e5));
  return `<fieldset class="full if-pax"><legend>Traveler ${i + 1}</legend>
    <label>Title<select class="field-input" name="title${i}" required><option value="">Choose</option><option value="mr">Mr</option><option value="mrs">Mrs</option><option value="ms">Ms</option><option value="miss">Miss</option><option value="dr">Dr</option></select></label>
    <label>Gender <small class="req-optional">as on passport</small><select class="field-input" name="gender${i}" required><option value="">Choose</option><option value="f">Female</option><option value="m">Male</option></select></label>
    <label>First and middle names<input class="field-input" name="given${i}" autocomplete="${i ? 'off' : 'given-name'}" maxlength="60" value="${e(prefill.given || '')}" required/></label>
    <label>Last name<input class="field-input" name="family${i}" autocomplete="${i ? 'off' : 'family-name'}" maxlength="60" value="${e(prefill.family || '')}" required/></label>
    <label>Date of birth<input class="field-input" type="date" name="born${i}" min="1900-01-01" max="${max}" required/></label>
    ${docs ? `<label>Passport number<input class="field-input" name="passport${i}" maxlength="20" autocapitalize="characters" autocomplete="off" required/></label>
    <label>Passport issued by<select class="field-input" name="country${i}" required>${countries.map(([cc, name]) => `<option value="${cc}" ${cc === home ? 'selected' : ''}>${e(name)}</option>`).join('')}</select></label>
    <label>Passport expiry<input class="field-input" type="date" name="expires${i}" min="${minExpiry}" required/></label>` : ''}
  </fieldset>`;
}

// Step 1: who is flying (names exactly as on the passport).
export async function openFlightBooking(o, fs) {
  if (!o?.offerId) return;
  await loadWorld();
  current = { o, fs, requestId: crypto.randomUUID() };
  const e = d.esc, n = o.passengers?.length || Number(fs.travelers) || 1, c = saved();
  const [given, ...rest] = String(c.name || '').trim().split(/\s+/);
  const home = HOME_COUNTRY[d.state.currency] || 'PK';
  d.openModal(`<div class="modal-body ib">
    <span class="eyebrow">BOOK NOW · E-TICKET IN MINUTES${fs.instantSandbox ? ' · TEST MODE' : ''}</span>
    <h2 id="modalTitle">Who’s flying?</h2>
    <div class="ib-summary"><b>${e(fs.fromLabel)} → ${e(fs.toLabel)}</b><span>${e(o.airlines.join(' + ') || 'Airline')} · ${e(fs.cabin)}</span><span>${e(sliceText(o))}</span>${o.back ? `<span>Return: ${e(sliceText(o.back))}</span>` : ''}<span>${e(rulesText(o))}</span><strong>${anyMoney(o.price, o.currency)}</strong><small>${n > 1 ? `total for ${n} travelers` : 'per person'} · taxes included</small></div>
    <p class="ib-note">Enter every name exactly as it is printed on the passport. Instant booking is for travelers aged 18 and over; for children, send a request instead.</p>
    <form id="ifPax" class="checkout-fields" novalidate>
      ${Array.from({ length: n }, (_, i) => travelerFields(i, o.docsRequired, countryList(), home, i === 0 ? { given, family: rest.join(' ') } : {})).join('')}
      <label class="full">Email <small class="req-optional">your e-ticket goes here</small><input class="field-input" name="email" type="email" autocomplete="email" maxlength="150" value="${e(c.email || '')}" required/></label>
      <label class="full">Phone or WhatsApp <small class="req-optional">the airline texts flight changes here</small><input class="field-input" name="phone" type="tel" autocomplete="tel" maxlength="40" value="${e(c.phone || '')}" placeholder="+92 300 1234567" required/></label>
      <label class="full checkout-consent"><input type="checkbox" name="consent"/><span>The names match the passports${o.refundable ? '' : ', I understand this fare can’t be refunded'}, and Uniworld may contact me about this booking.</span></label>
      <p class="form-error full" id="ifError" role="alert"></p>
      <button class="dark-button full" type="submit">Continue to card payment ${d.icon('arrow-right')}</button>
    </form>
    <p class="small-print">You pay on Stripe’s secure page; Uniworld never sees your card. The ticket is issued straight after payment. If the airline can’t issue it, your payment is refunded in full automatically.</p>
  </div>`);
}

function readTravelers(f, n, docs, departs) {
  const travelers = [];
  const adultBy = `${Number(departs.slice(0, 4)) - 18}${departs.slice(4)}`;
  for (let i = 0; i < n; i++) {
    const t = {
      title: f['title' + i], gender: f['gender' + i], givenName: String(f['given' + i] || '').trim(), familyName: String(f['family' + i] || '').trim(), bornOn: f['born' + i] || '',
    };
    const who = n > 1 ? `traveler ${i + 1}` : 'the traveler';
    if (!t.title || !t.gender) return { problem: `Choose the title and gender for ${who}, as on the passport.` };
    if (!t.givenName || !t.familyName) return { problem: `Enter the first and last name for ${who}, exactly as on the passport.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.bornOn)) return { problem: `Enter the date of birth for ${who}.` };
    if (t.bornOn > adultBy) return { problem: `Instant booking is for travelers aged 18 and over. For children, send a request and an advisor books the right child fare.` };
    if (docs) {
      t.passport = { number: String(f['passport' + i] || '').replace(/\s+/g, '').toUpperCase(), country: f['country' + i], expires: f['expires' + i] || '' };
      if (!/^[A-Z0-9]{5,20}$/.test(t.passport.number) || !/^\d{4}-\d{2}-\d{2}$/.test(t.passport.expires)) return { problem: `Enter the passport number and expiry date for ${who}.` };
    }
    travelers.push(t);
  }
  return { travelers };
}

// Step 2: hold the fare and go to Stripe's checkout page.
async function checkout(form) {
  const { o, fs, requestId } = current;
  const f = Object.fromEntries(new FormData(form)), err = form.querySelector('#ifError'), btn = form.querySelector('[type=submit]');
  const n = o.passengers?.length || Number(fs.travelers) || 1;
  const { travelers, problem: missing } = readTravelers(f, n, o.docsRequired, String(o.depart?.time || fs.start).slice(0, 10));
  const email = String(f.email || '').trim(), phone = String(f.phone || '').trim(), digits = phone.replace(/\D/g, '');
  const problem = missing
    || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter an email address for your e-ticket.'
    : !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15 ? 'Please enter a phone or WhatsApp number with your country code.'
    : !f.consent ? 'Please tick the box to continue.' : '');
  if (problem) { err.textContent = problem; return; }
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Checking the fare with the airline…';
  const name = `${travelers[0].givenName} ${travelers[0].familyName}`;
  try { localStorage.setItem('uniworld:contact', JSON.stringify({ ...saved(), name, email, phone })); } catch { /* optional */ }
  try {
    const r = await d.api('instant/flight/checkout', 'POST', {
      requestId, offerId: o.offerId, passengers: travelers, contact: { name, email, phone }, consent: true, market: d.state.currency,
      trip: { fromLabel: fs.fromLabel, toLabel: fs.toLabel, cabin: fs.cabin },
    });
    try { localStorage.setItem(DRAFT, JSON.stringify({ requestId, title: `${fs.fromLabel} → ${fs.toLabel}`, created: Date.now() })); } catch { /* the webhook still finishes the booking */ }
    btn.textContent = 'Opening secure payment…';
    location.assign(r.url);
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false; btn.innerHTML = `Continue to card payment ${d.icon('arrow-right')}`;
    current.requestId = crypto.randomUUID(); // a fresh attempt next time
  }
}

// Step 3 (Stripe sends the traveler back to /?flight=<id>#trips): issue the ticket.
export async function finishFlight() {
  const params = new URLSearchParams(location.search);
  const requestId = params.get('flight');
  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) return;
  history.replaceState(null, '', location.pathname + (location.hash || '#trips'));
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT)); } catch { draft = null; }
  d.openModal(`<div class="modal-body ib"><span class="eyebrow">PAYMENT RECEIVED</span><h2 id="modalTitle">Issuing your ticket…</h2><p class="ls-wait" role="status">The airline is confirming your seats. This usually takes under a minute. Please keep this page open.</p>${draft?.title ? `<p class="ib-sub">${d.esc(draft.title)}</p>` : ''}</div>`, true);
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < 150000) {
    try {
      const r = await d.api('instant/flight/complete', 'POST', { requestId });
      if (!r.pending) {
        try { localStorage.removeItem(DRAFT); } catch { /* optional */ }
        d.mergeRequest(r);
        d.showRequest(r, false);
        d.toast(r.status === 'confirmed' ? 'Ticketed! Your booking reference is in My trips.' : 'Our team is finishing this booking for you.');
        return;
      }
    } catch (ex) {
      lastError = ex.message;
      if (/expired|start again/i.test(lastError)) break;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  d.openModal(`<div class="modal-body ib"><h2 id="modalTitle">We’re still confirming your ticket.</h2><p>${d.esc(lastError || 'The airline is taking longer than usual.')}</p><button class="dark-button" data-if="retry-finish" data-id="${d.esc(requestId)}">Check again</button><p class="small-print">If your card was charged, your booking is safe: the app keeps working on it, and Uniworld will confirm it with you. It will appear in My trips.</p></div>`, true);
}

function onClick(ev) {
  const b = ev.target.closest('[data-if]');
  if (!b) return;
  if (b.dataset.if === 'retry-finish') { history.replaceState(null, '', `${location.pathname}?flight=${encodeURIComponent(b.dataset.id)}#trips`); finishFlight(); }
}
function onSubmit(ev) {
  if (ev.target.id !== 'ifPax' || !current) return;
  ev.preventDefault();
  checkout(ev.target);
}
