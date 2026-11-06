// Instant flight booking. The traveler picks a fare, adds every traveler as on the passport and pays
// by card; the app then books the flight with the airline.
// - Nuitée Connect (the same partner as hotels): payment on Nuitée's secure card form, then the app
//   confirms the booking. Adults, children and infants.
// - Duffel + Stripe (kept for later): payment on Stripe's checkout page, then the app buys the ticket.
// Switched on only when the Uniworld server has the keys (state.instant.flights).
import { money } from './live-rates.js';
import { countryList, loadWorld, airportByCode } from './places.js';
import { loadSdk } from './instant.js';

let d = null; // openModal, api, esc, icon, state, toast, showRequest, mergeRequest
const DRAFT = 'uniworld:flight-draft';
const NDRAFT = 'uniworld:nflight-draft';
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
  if (o.provider === 'nuitee') return openNuitee(o, fs);
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

// ---------- Nuitée Connect ----------
const TYPES = { adult: 'Adult', child: 'Child', infant: 'Infant' };
const AGES = { adult: '12+', child: '2–11', infant: 'under 2' };
const ageOn = (born, dayIso) => { const [by, bm, bd] = born.split('-').map(Number), [y, m, dd] = dayIso.split('-').map(Number); return y - by - (m < bm || (m === bm && dd < bd) ? 1 : 0); };
function travelerList(fs) {
  const list = [];
  for (let i = 0; i < (Number(fs.travelers) || 1); i++) list.push('adult');
  for (let i = 0; i < (Number(fs.children) || 0); i++) list.push('child');
  for (let i = 0; i < (Number(fs.infants) || 0); i++) list.push('infant');
  return list;
}
function nuiteeFields(i, type, n, intl, countries, home, prefill) {
  const e = d.esc, max = iso(new Date()), opts = (sel) => countries.map(([cc, name]) => `<option value="${cc}" ${cc === sel ? 'selected' : ''}>${e(name)}</option>`).join('');
  const count = n[type] > 1 ? ` ${n.seen[type] = (n.seen[type] || 0) + 1}` : '';
  return `<fieldset class="full if-pax" data-type="${type}"><legend>${TYPES[type]}${count} <small class="req-optional">${AGES[type]} on the travel date</small></legend>
    ${type === 'adult' ? `<label>Title<select class="field-input" name="title${i}"><option value="">Choose</option><option value="MR">Mr</option><option value="MRS">Mrs</option><option value="MS">Ms</option><option value="MISS">Miss</option></select></label>` : ''}
    <label>Gender <small class="req-optional">as on passport</small><select class="field-input" name="gender${i}" required><option value="">Choose</option><option value="f">Female</option><option value="m">Male</option></select></label>
    <label>First and middle names<input class="field-input" name="given${i}" autocomplete="${i ? 'off' : 'given-name'}" maxlength="60" value="${e(prefill.given || '')}" required/></label>
    <label>Last name<input class="field-input" name="family${i}" autocomplete="${i ? 'off' : 'family-name'}" maxlength="60" value="${e(prefill.family || '')}" required/></label>
    <label>Date of birth<input class="field-input" type="date" name="born${i}" min="1900-01-01" max="${max}" required/></label>
    <label>Nationality<select class="field-input" name="nationality${i}" required>${opts(home)}</select></label>
    <label>Passport number${intl ? '' : ' <small class="req-optional">optional on domestic flights</small>'}<input class="field-input" name="passport${i}" maxlength="20" autocapitalize="characters" autocomplete="off" ${intl ? 'required' : ''}/></label>
    <label>Passport issued by<select class="field-input" name="country${i}">${opts(home)}</select></label>
    <label>Passport expiry<input class="field-input" type="date" name="expires${i}" min="${iso(new Date(Date.now() + 864e5))}" ${intl ? 'required' : ''}/></label>
  </fieldset>`;
}
function openNuitee(o, fs) {
  const e = d.esc, c = saved(), types = travelerList(fs), home = HOME_COUNTRY[d.state.currency] || 'PK';
  const [given, ...rest] = String(c.name || '').trim().split(/\s+/);
  const a = airportByCode(o.depart?.id), b = airportByCode(o.arrive?.id);
  const intl = !a || !b || a.cc !== b.cc;
  const n = { adult: types.filter((t) => t === 'adult').length, child: types.filter((t) => t === 'child').length, infant: types.filter((t) => t === 'infant').length, seen: {} };
  const bags = o.bags ? [o.bags.carryOn ? 'Carry-on bag included' : 'No carry-on bag', o.bags.checked ? 'checked bag included' : 'no checked bag'].join(' · ') : '';
  current = { o, fs, types, intl, requestId: crypto.randomUUID(), acceptPrice: null, provider: 'nuitee' };
  d.openModal(`<div class="modal-body ib">
    <span class="eyebrow">BOOK NOW · INSTANT CONFIRMATION${fs.instantSandbox ? ' · TEST MODE' : ''}</span>
    <h2 id="modalTitle">Who’s flying?</h2>
    <div class="ib-summary"><b>${e(fs.fromLabel)} → ${e(fs.toLabel)}</b><span>${e(o.airlines.join(' + ') || 'Airline')} · ${e(fs.cabin)}${o.fareFamily ? ' · ' + e(o.fareFamily) : ''}</span><span>${e(sliceText(o))}</span>${o.back ? `<span>Return: ${e(sliceText(o.back))}</span>` : ''}${bags ? `<span>${e(bags)}</span>` : ''}<span>${e(rulesText(o))}</span><strong>${anyMoney(o.price, o.currency)}</strong><small>total for ${types.length === 1 ? '1 traveler' : types.length + ' travelers'} · taxes included</small></div>
    <p class="ib-note">Enter every name exactly as it is printed on the passport.</p>
    <form id="ifPax" class="checkout-fields" novalidate>
      ${types.map((t, i) => nuiteeFields(i, t, n, intl, countryList(), home, i === 0 ? { given, family: rest.join(' ') } : {})).join('')}
      <label class="full">Email <small class="req-optional">your booking confirmation goes here</small><input class="field-input" name="email" type="email" autocomplete="email" maxlength="150" value="${e(c.email || '')}" required/></label>
      <label class="full">Phone or WhatsApp <small class="req-optional">the airline texts flight changes here</small><input class="field-input" name="phone" type="tel" autocomplete="tel" maxlength="40" value="${e(c.phone || '')}" placeholder="+92 300 1234567" required/></label>
      <label class="full checkout-consent"><input type="checkbox" name="consent"/><span>The names match the passports${o.refundable ? '' : ', I understand this fare can’t be refunded'}, and Uniworld may contact me about this booking.</span></label>
      <p class="form-error full" id="ifError" role="alert"></p>
      <div class="full" id="ifPrice"></div>
      <button class="dark-button full" type="submit">Continue to card payment ${d.icon('arrow-right')}</button>
    </form>
    <p class="small-print">You pay on the secure card form of Nuitée, our booking partner; Uniworld never sees your card. Your booking is confirmed with the airline straight after payment.</p>
  </div>`);
}
function readNuitee(f) {
  const { types, intl, o, fs } = current;
  const departs = String(o.depart?.time || fs.start).slice(0, 10), lastDay = String((o.back || o).arrive?.time || departs).slice(0, 10);
  const people = [];
  for (let i = 0; i < types.length; i++) {
    const type = types[i], who = types.length > 1 ? `${TYPES[type].toLowerCase()} ${i + 1}` : 'the traveler';
    const p = { type, title: type === 'adult' ? f['title' + i] || '' : '', gender: f['gender' + i], firstName: String(f['given' + i] || '').trim(), lastName: String(f['family' + i] || '').trim(), bornOn: f['born' + i] || '', nationality: f['nationality' + i] };
    if (!p.gender) return { problem: `Choose the gender for ${who}, as on the passport.` };
    if (!p.firstName || !p.lastName) return { problem: `Enter the first and last name for ${who}, exactly as on the passport.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.bornOn)) return { problem: `Enter the date of birth for ${who}.` };
    const age = ageOn(p.bornOn, departs);
    if (type === 'adult' && age < 12) return { problem: `${p.firstName} is under 12 on the travel date. Search again with them as a child.` };
    if (type === 'child' && (age < 2 || age > 11)) return { problem: `${p.firstName} must be 2–11 on the travel date to travel as a child. Search again with the right ages.` };
    if (type === 'infant' && ageOn(p.bornOn, lastDay) >= 2) return { problem: `${p.firstName} must be under 2 for the whole trip to travel as an infant. Search again with them as a child.` };
    const number = String(f['passport' + i] || '').replace(/\s+/g, '').toUpperCase(), expires = f['expires' + i] || '';
    if (intl || number || expires) {
      if (!/^[A-Z0-9]{5,20}$/.test(number)) return { problem: `Enter the passport number for ${who}.` };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || expires <= lastDay) return { problem: `${p.firstName}’s passport must still be valid after the trip ends.` };
      p.passport = { number, country: f['country' + i], expires };
    }
    people.push(p);
  }
  return { people };
}
async function nuiteePrebook(form) {
  const { o, fs, types } = current;
  const f = Object.fromEntries(new FormData(form)), err = form.querySelector('#ifError'), btn = form.querySelector('[type=submit]');
  const { people, problem: missing } = readNuitee(f);
  const email = String(f.email || '').trim(), phone = String(f.phone || '').trim(), digits = phone.replace(/\D/g, '');
  const problem = missing
    || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter an email address for your booking confirmation.'
    : !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15 ? 'Please enter a phone or WhatsApp number with your country code.'
    : !f.consent ? 'Please tick the box to continue.' : '');
  if (problem) { err.textContent = problem; return; }
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Checking the fare with the airline…';
  const lead = people.find((p) => p.type === 'adult') || people[0], name = `${lead.firstName} ${lead.lastName}`;
  try { localStorage.setItem('uniworld:contact', JSON.stringify({ ...saved(), name, email, phone })); } catch { /* optional */ }
  try {
    const r = await d.api('instant/nflight/prebook', 'POST', {
      requestId: current.requestId, offerId: o.offerId, passengers: people, contact: { name, email, phone }, consent: true, market: d.state.currency,
      ...(current.acceptPrice ? { acceptPrice: current.acceptPrice } : {}),
      trip: { fromLabel: fs.fromLabel, toLabel: fs.toLabel, cabin: fs.cabin, adults: types.filter((t) => t === 'adult').length, children: types.filter((t) => t === 'child').length, infants: types.filter((t) => t === 'infant').length, price: o.exact ?? o.price, depart: String(o.depart?.time || '').slice(0, 10), ret: o.back ? String(o.back.depart?.time || '').slice(0, 10) : '' },
    });
    if (r.priceChanged) {
      current.acceptPrice = r.newPrice;
      form.querySelector('#ifPrice').innerHTML = `<p class="ib-note">The airline’s price for this flight is now <b>${anyMoney(r.newPrice, r.currency)}</b>${r.oldPrice ? ` (it was ${anyMoney(r.oldPrice, r.currency)})` : ''}. Continue to book at the new price, or go back and choose another flight.</p>`;
      btn.disabled = false; btn.innerHTML = `Accept ${anyMoney(r.newPrice, r.currency)} and continue ${d.icon('arrow-right')}`;
      return;
    }
    try { localStorage.setItem(NDRAFT, JSON.stringify({ requestId: current.requestId, title: `${fs.fromLabel} → ${fs.toLabel}`, created: Date.now() })); } catch { /* the booking can still finish in this tab */ }
    nuiteePay(r);
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false; btn.innerHTML = `Continue to card payment ${d.icon('arrow-right')}`;
    if (/sold out|no longer available|search again/i.test(ex.message)) current.requestId = crypto.randomUUID();
  }
}
// The seats are held: Nuitée's secure card form. After paying, the page comes back to Uniworld.
function nuiteePay(p) {
  const { o, fs, types } = current, e = d.esc;
  d.openModal(`<div class="modal-body ib">
    <span class="eyebrow">SECURE PAYMENT${p.sandbox ? ' · TEST MODE' : ''}</span>
    <h2 id="modalTitle">Pay ${anyMoney(p.price, p.currency)}</h2>
    <div class="ib-summary"><b>${e(fs.fromLabel)} → ${e(fs.toLabel)}</b><span>${e(o.airlines.join(' + ') || 'Airline')} · ${e(sliceText(o))}</span>${o.back ? `<span>Return: ${e(sliceText(o.back))}</span>` : ''}<span>${types.length === 1 ? '1 traveler' : types.length + ' travelers'} · ${e(rulesText(o))}</span></div>
    ${p.sandbox ? `<p class="ib-note">Test mode: use card 4242 4242 4242 4242, any future date and any 3 digits. No real money moves.</p>` : ''}
    <div id="ifPay" class="ib-pay"><p class="ls-wait">Loading the secure payment form…</p></div>
    <p class="small-print">Your card is charged by Nuitée, our booking partner, on its secure form. Uniworld never sees your card details.</p>
  </div>`);
  loadSdk().then(() => {
    const box = document.getElementById('ifPay');
    if (box) box.innerHTML = '';
    new window.LiteAPIPayment({
      publicKey: p.sandbox ? 'sandbox' : 'live', appearance: { theme: 'flat' }, options: { business: { name: 'Uni World Travel' } },
      targetElement: '#ifPay', secretKey: p.secretKey, returnUrl: `${location.origin}/?nflight=${encodeURIComponent(current.requestId)}#trips`,
    }).handlePayment();
  }).catch(() => {
    const box = document.getElementById('ifPay');
    if (box) box.innerHTML = `<p class="form-error">The payment form couldn’t load. Check your connection and try again, or send a request to an advisor instead.</p>`;
  });
}
// Back from the card form (/?nflight=<id>&payment_intent=…): confirm the booking with the airline. If the page
// closed after paying but before the booking finished, the saved draft (with the card form's payment reference)
// finishes it the next time the app opens.
export async function finishNFlight() {
  const params = new URLSearchParams(location.search);
  let requestId = params.get('nflight');
  const status = params.get('redirect_status');
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(NDRAFT)); } catch { draft = null; }
  const forget = () => { try { localStorage.removeItem(NDRAFT); } catch { /* optional */ } };
  if (requestId) history.replaceState(null, '', location.pathname + (location.hash || '#trips'));
  else {
    if (!draft?.requestId || !draft.pi) return;
    if (Date.now() - (draft.created || 0) > 2 * 864e5) { forget(); return; }
    requestId = draft.requestId;
  }
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;
  const mine = draft?.requestId === requestId ? draft : null;
  if (status && status !== 'succeeded') {
    if (mine) forget();
    d.openModal(`<div class="modal-body ib"><h2 id="modalTitle">The payment didn’t go through.</h2><p>Your card wasn’t charged. Please choose the flight again and try another card, or send a request to an advisor.</p><a class="dark-button" href="#flights">Back to flights</a></div>`, true);
    return;
  }
  const pi = params.get('payment_intent') || mine?.pi || '';
  if (pi && mine && mine.pi !== pi) { try { localStorage.setItem(NDRAFT, JSON.stringify({ ...mine, pi })); } catch { /* the booking can still finish now */ } }
  d.openModal(`<div class="modal-body ib"><span class="eyebrow">PAYMENT RECEIVED</span><h2 id="modalTitle">Booking your flight…</h2><p class="ls-wait" role="status">The airline is confirming your seats. This usually takes under a minute. Please keep this page open.</p>${mine?.title ? `<p class="ib-sub">${d.esc(mine.title)}</p>` : ''}</div>`, true);
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < 150000) {
    try {
      const r = await d.api('instant/nflight/book', 'POST', { requestId, paymentIntent: pi });
      if (mine) forget();
      d.mergeRequest(r);
      d.showRequest(r, false);
      d.toast(r.status === 'confirmed' ? 'Booked! Your flight is confirmed.' : 'Paid. The airline is confirming your seats.');
      return;
    } catch (ex) {
      lastError = ex.message;
      if (/expired|start again/i.test(lastError)) { if (mine) forget(); break; }
      if (/confirm your card payment/i.test(lastError)) break;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  d.openModal(`<div class="modal-body ib"><h2 id="modalTitle">We’re still confirming your flight.</h2><p>${d.esc(lastError || 'The airline is taking longer than usual.')}</p><button class="dark-button" data-if="retry-nfinish" data-id="${d.esc(requestId)}" data-pi="${d.esc(pi)}">Check again</button><p class="small-print">If your card was charged, your booking is safe: Uniworld will confirm it with you, and it will appear in My trips. Don’t pay again.</p></div>`, true);
}

function onClick(ev) {
  const b = ev.target.closest('[data-if]');
  if (!b) return;
  if (b.dataset.if === 'retry-finish') { history.replaceState(null, '', `${location.pathname}?flight=${encodeURIComponent(b.dataset.id)}#trips`); finishFlight(); }
  if (b.dataset.if === 'retry-nfinish') { history.replaceState(null, '', `${location.pathname}?nflight=${encodeURIComponent(b.dataset.id)}${b.dataset.pi ? '&payment_intent=' + encodeURIComponent(b.dataset.pi) : ''}#trips`); finishNFlight(); }
}
function onSubmit(ev) {
  if (ev.target.id !== 'ifPax' || !current) return;
  ev.preventDefault();
  if (current.provider === 'nuitee') nuiteePrebook(ev.target);
  else checkout(ev.target);
}
