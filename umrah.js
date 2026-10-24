// Live Umrah packages: a return flight to Jeddah or Madinah plus hotels near both holy
// mosques, priced live from Google Flights and Google Hotels. The customer can swap the
// flight or either hotel, then sends the whole package to a Uniworld advisor, who adds
// the visa and transport and confirms the final price before anything is paid.
import { fetchLive, money } from './live-rates.js';

let d = null; // helpers from app.js: openModal, closeModal, openRequest, esc, icon, state, toast, openAdvisor

const ORIGINS = [
  ['Pakistan', [['Karachi', 'KHI'], ['Lahore', 'LHE'], ['Islamabad', 'ISB'], ['Peshawar', 'PEW'], ['Multan', 'MUX'], ['Sialkot', 'SKT'], ['Faisalabad', 'LYP']]],
  ['United Kingdom', [['London Heathrow', 'LHR'], ['London Gatwick', 'LGW'], ['Manchester', 'MAN'], ['Birmingham', 'BHX'], ['Glasgow', 'GLA']]],
  ['USA & Canada', [['New York JFK', 'JFK'], ['Newark', 'EWR'], ['Chicago', 'ORD'], ['Houston', 'IAH'], ['Washington Dulles', 'IAD'], ['Dallas', 'DFW'], ['Atlanta', 'ATL'], ['Los Angeles', 'LAX'], ['Toronto', 'YYZ']]],
];
// Long-haul departures land the next day, so the first hotel night starts a day later.
const NEXT_DAY = new Set(['JFK', 'EWR', 'ORD', 'IAH', 'IAD', 'DFW', 'ATL', 'LAX', 'YYZ']);
const HOME = { PKR: 'KHI', GBP: 'LHR', USD: 'JFK' };
const CITY = {
  makkah: { name: 'Makkah', q: 'Hotels near Masjid al-Haram Makkah', mosque: 'Masjid al-Haram', near: /haram|kaaba|ka.?bah|grand mosque/i },
  madinah: { name: 'Madinah', q: 'Hotels near Masjid an-Nabawi Madinah', mosque: 'the Prophet’s Mosque', near: /nabaw|prophet|green dome/i },
};
const AIRPORT = { JED: 'Jeddah (JED)', MED: 'Madinah (MED)' };
export const LEVELS = {
  value: { label: 'Value', sub: 'up to 3★', stars: [2, 3] },
  comfort: { label: 'Comfort', sub: '4★', stars: [4] },
  luxury: { label: 'Luxury', sub: '5★', stars: [5] },
};
// The Umrah journeys in the app's collection, priced live.
export const PRESETS = {
  'umrah-essentials': { makkah: 4, madinah: 2, level: 'value', label: '7 days', sub: 'Value' },
  'umrah-family': { makkah: 5, madinah: 4, level: 'comfort', label: '10 days', sub: 'Family comfort' },
  'umrah-signature': { makkah: 7, madinah: 6, level: 'luxury', label: '14 days', sub: 'Signature' },
};

// ---------- Small helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (days) => { const t = new Date(); t.setDate(t.getDate() + days); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const addDays = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dur = (min) => (min ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : '');
const clock = (s) => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
const stars = (n) => (n ? '★'.repeat(n) : '');
const ratingWord = (r) => (r >= 4.5 ? 'Excellent' : r >= 4 ? 'Very good' : r >= 3.5 ? 'Good' : r >= 3 ? 'Pleasant' : 'Rated');
const originLabel = (code) => { for (const [, list] of ORIGINS) { const a = list.find((x) => x[1] === code); if (a) return `${a[0]} (${a[1]})`; } return code; };
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  return 'on ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
// "3 min · walking" -> 3; "1 hr 5 min · walking" -> 65; anything not on foot -> null
function walkMinutes(h, re) {
  for (const n of h?.nearby || []) {
    if (!re.test(n.name || '') || !/walk/i.test(n.how || '')) continue;
    const hr = /(\d+)\s*h/.exec(n.how), min = /(\d+)\s*min/.exec(n.how);
    const total = (hr ? Number(hr[1]) * 60 : 0) + (min ? Number(min[1]) : 0);
    if (total) return total;
  }
  return null;
}
const hotelTotal = (h, nights) => h.total || (h.pricePerNight ? h.pricePerNight * nights : null);

function savedForm() { try { return JSON.parse(localStorage.getItem('uniworld:umrah-form')) || {}; } catch { return {}; } }
function saveForm(f) { try { localStorage.setItem('uniworld:umrah-form', JSON.stringify({ from: f.from, makkah: f.makkah, madinah: f.madinah, order: f.order, travelers: f.travelers, level: f.level })); } catch { /* optional */ } }

// The trip's dates: arrive, stay in each city, fly home from the airport you arrived at.
export function planOf(f) {
  const firstIn = addDays(f.depart, NEXT_DAY.has(f.from) ? 1 : 0);
  const cities = (f.order === 'madinah-first' ? [['madinah', f.madinah], ['makkah', f.makkah]] : [['makkah', f.makkah], ['madinah', f.madinah]]).filter(([, n]) => n > 0);
  let at = firstIn;
  const stays = {};
  for (const [city, n] of cities) { stays[city] = { checkIn: at, checkOut: addDays(at, n), nights: n }; at = addDays(at, n); }
  return { depart: f.depart, ret: at, airport: cities[0]?.[0] === 'madinah' ? 'MED' : 'JED', stays, cities: cities.map((c) => c[0]), nights: f.makkah + f.madinah, nextDay: NEXT_DAY.has(f.from) };
}

// ---------- State ----------
let u = null; // { root, form, plan, parts, seq, fetchedAt, picker }

export function initUmrah(deps) {
  d = deps;
  document.addEventListener('click', onPick);
}

export function mountUmrah(root, preset) {
  if (!root) return () => {};
  const saved = savedForm();
  const cur = d.state.currency;
  const form = {
    from: ORIGINS.some(([, l]) => l.some((a) => a[1] === saved.from)) ? saved.from : HOME[cur] || 'KHI',
    depart: isoLocal(30),
    makkah: Number.isInteger(saved.makkah) ? saved.makkah : 5,
    madinah: Number.isInteger(saved.madinah) ? saved.madinah : 4,
    order: saved.order === 'madinah-first' ? 'madinah-first' : 'makkah-first',
    travelers: Number.isInteger(saved.travelers) ? saved.travelers : 2,
    level: LEVELS[saved.level] ? saved.level : 'comfort',
  };
  if (preset && PRESETS[preset]) Object.assign(form, { makkah: PRESETS[preset].makkah, madinah: PRESETS[preset].madinah, level: PRESETS[preset].level });
  u = { root, form, plan: null, parts: null, seq: 0, fetchedAt: null, currency: cur, preset: preset || '' };
  root.innerHTML = formView();
  const onSubmit = (ev) => { if (ev.target.id === 'umForm') { ev.preventDefault(); submit(); } };
  const onChange = (ev) => { if (ev.target.closest('#umForm')) { readForm(); updatePlanLine(); } };
  const onClick = (ev) => {
    const b = ev.target.closest('[data-um]');
    if (!b || !root.contains(b)) return;
    const a = b.dataset.um;
    if (a === 'preset') applyPreset(b.dataset.id);
    else if (a === 'change') openPicker(b.dataset.part);
    else if (a === 'request') requestPackage();
    else if (a === 'advisor') d.openAdvisor?.();
    else if (a === 'retry') search();
    else if (a === 'edit') root.querySelector('#umForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onChange);
  root.addEventListener('click', onClick);
  return () => {
    u.seq++;
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onChange);
    root.removeEventListener('click', onClick);
    u = null;
  };
}

// Fill the form from one of the collection's journeys and price it right away.
export function applyPreset(id, run = true) {
  if (!u || !PRESETS[id]) return false;
  const p = PRESETS[id];
  Object.assign(u.form, { makkah: p.makkah, madinah: p.madinah, level: p.level });
  u.preset = id;
  const f = u.root.querySelector('#umForm');
  if (f) {
    f.makkah.value = String(p.makkah);
    f.madinah.value = String(p.madinah);
    f.querySelector(`[name=level][value=${p.level}]`).checked = true;
    u.root.querySelectorAll('[data-um=preset]').forEach((x) => { const on = x.dataset.id === id; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    updatePlanLine();
  }
  u.root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  if (run) submit();
  return true;
}

// ---------- Form ----------
function formView() {
  const e = d.esc, ic = d.icon, f = u.form;
  const opt = (n, sel, word) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n ? plural(n, word) : 'None'}</option>`;
  return `<div class="um-head"><span class="eyebrow">LIVE UMRAH PACKAGES</span><h2>Build your Umrah. <span class="serif">See today’s price.</span></h2><p>Real flights and real hotels near both holy mosques, priced live. Change anything, then send it to a Uniworld advisor.</p></div>
  <form class="um-form" id="umForm" novalidate>
    <div class="um-presets" role="group" aria-label="Start from a journey">${Object.entries(PRESETS).map(([id, p]) => `<button type="button" class="chip ${u.preset === id ? 'active' : ''}" data-um="preset" data-id="${id}" aria-pressed="${u.preset === id}"><b>${p.label}</b> · ${p.sub}</button>`).join('')}</div>
    <div class="um-grid">
      <label class="um-from">Flying from<select class="field-input" name="from">${ORIGINS.map(([g, list]) => `<optgroup label="${e(g)}">${list.map(([n, c]) => `<option value="${c}" ${c === f.from ? 'selected' : ''}>${e(n)} (${c})</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Departure<input class="field-input" type="date" name="depart" value="${f.depart}" min="${isoLocal(1)}" max="${isoLocal(300)}" required/></label>
      <label>Travelers<select class="field-input" name="travelers">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}" ${i + 1 === f.travelers ? 'selected' : ''}>${plural(i + 1, 'traveler')}</option>`).join('')}</select></label>
      <label>Nights in Makkah<select class="field-input" name="makkah">${Array.from({ length: 21 }, (_, i) => opt(i, f.makkah, 'night')).join('')}</select></label>
      <label>Nights in Madinah<select class="field-input" name="madinah">${Array.from({ length: 16 }, (_, i) => opt(i, f.madinah, 'night')).join('')}</select></label>
      <fieldset class="um-seg"><legend>Visit first</legend><div>${[['makkah-first', 'Makkah'], ['madinah-first', 'Madinah']].map(([v, l]) => `<label><input type="radio" name="order" value="${v}" ${f.order === v ? 'checked' : ''}/><span>${l}</span></label>`).join('')}</div></fieldset>
      <fieldset class="um-seg um-levels"><legend>Hotels</legend><div>${Object.entries(LEVELS).map(([v, l]) => `<label><input type="radio" name="level" value="${v}" ${f.level === v ? 'checked' : ''}/><span>${l.label}<small>${l.sub}</small></span></label>`).join('')}</div></fieldset>
    </div>
    <p class="um-plan" id="umPlan">${planLine()}</p>
    <button class="dark-button um-submit" type="submit">${ic('sparkles')} See my live package price</button>
    <p class="form-error" id="umError" role="alert"></p>
    <p class="form-help">Live from Google Flights and Google Hotels. Nothing is booked or charged until an advisor confirms with you.</p>
  </form>
  <div class="um-results" id="umResults" aria-live="polite"></div>`;
}

function readForm() {
  const f = u.root.querySelector('#umForm');
  if (!f) return;
  const v = Object.fromEntries(new FormData(f));
  Object.assign(u.form, {
    from: String(v.from || u.form.from), depart: String(v.depart || ''), travelers: Number(v.travelers) || 1,
    makkah: Number(v.makkah) || 0, madinah: Number(v.madinah) || 0,
    order: v.order === 'madinah-first' ? 'madinah-first' : 'makkah-first', level: LEVELS[v.level] ? v.level : 'comfort',
  });
  const p = PRESETS[u.preset];
  if (p && (p.makkah !== u.form.makkah || p.madinah !== u.form.madinah || p.level !== u.form.level)) {
    u.preset = '';
    u.root.querySelectorAll('[data-um=preset]').forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
  }
}

function problemOf(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.depart) || f.depart < isoLocal(1)) return 'Choose a departure date from tomorrow onwards.';
  if (f.depart > isoLocal(300)) return 'Choose a departure date within the next 10 months.';
  if (f.makkah + f.madinah < 1) return 'Add at least one night in Makkah or Madinah.';
  if (f.makkah + f.madinah > 30) return 'For more than 30 nights, ask an advisor to plan it with you.';
  return '';
}

function planLine() {
  const f = u.form;
  if (problemOf(f)) return '';
  const p = planOf(f);
  const parts = p.cities.map((c) => `${CITY[c].name} ${plural(p.stays[c].nights, 'night')}`).join(' → ');
  return `${d.icon('calendar')} Fly ${day(p.depart)}${p.nextDay ? ' (arrive next day)' : ''} · ${parts} · fly home ${day(p.ret)}`;
}
function updatePlanLine() { const el = u.root.querySelector('#umPlan'); if (el) el.innerHTML = planLine(); }

function submit() {
  readForm();
  const err = u.root.querySelector('#umError');
  const problem = problemOf(u.form);
  if (err) err.textContent = problem;
  if (problem) return;
  saveForm(u.form);
  search();
}

// ---------- Live search: one flight search and one hotel search per city ----------
async function search() {
  if (!u) return;
  const f = { ...u.form }, plan = planOf(f), seq = ++u.seq, cur = d.state.currency;
  u.plan = plan; u.currency = cur; u.parts = null;
  const box = u.root.querySelector('#umResults');
  box.innerHTML = `<div class="um-loading">${['flight', ...plan.cities].map(() => '<article class="um-part ls-skel" aria-hidden="true"><span></span><span></span><span></span></article>').join('')}<p class="ls-wait" role="status">Checking live flights and hotels near the Haram…</p></div>`;
  box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  const slow = setTimeout(() => { const w = box.querySelector('.ls-wait'); if (w) w.textContent = 'Comparing airlines and hotels. This can take a few seconds…'; }, 6000);
  const jobs = {
    flight: fetchLive({ kind: 'flights', from: f.from, to: plan.airport, depart: plan.depart, return: plan.ret, adults: f.travelers, cabin: 'Economy', currency: cur }),
  };
  for (const c of plan.cities) jobs[c] = fetchLive({ kind: 'hotels', q: CITY[c].q, checkIn: plan.stays[c].checkIn, checkOut: plan.stays[c].checkOut, adults: Math.min(f.travelers, 12), currency: cur, stars: LEVELS[f.level].stars });
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  clearTimeout(slow);
  if (!u || seq !== u.seq) return;
  const parts = {};
  let newest = null;
  names.forEach((name, i) => {
    const s = settled[i];
    const res = s.status === 'fulfilled' ? s.value : null;
    const notice = s.status === 'rejected' ? (s.reason?.invalid ? 'invalid' : 'unavailable') : res.data ? (res.stale ? 'partial' : null) : res.notice || 'unavailable';
    const message = s.status === 'rejected' && s.reason?.invalid ? s.reason.message : '';
    const list = name === 'flight' ? res?.data?.options || [] : res?.data?.hotels || [];
    parts[name] = { name, list, notice: list.length ? (notice === 'partial' ? 'partial' : null) : notice || 'empty', message, link: res?.data?.link || null, fetchedAt: res?.fetchedAt || null, currency: res?.currency || cur, pick: 0 };
    if (res?.fetchedAt && (!newest || res.fetchedAt < newest)) newest = res.fetchedAt;
    if (list.length) parts[name].pick = name === 'flight' ? pickFlight(list) : pickHotel(list, CITY[name].near);
  });
  u.parts = parts; u.fetchedAt = newest; u.form = f;
  renderResults();
}

// Google's recommended flights, cheapest first; otherwise the cheapest flight.
function pickFlight(list) {
  const best = list.map((o, i) => [o, i]).filter(([o]) => o.best);
  const pool = best.length ? best : list.map((o, i) => [o, i]);
  return pool.reduce((a, b) => (b[0].price < a[0].price ? b : a))[1];
}
// A well-rated hotel within a short walk of the mosque, at the best price.
function pickHotel(list, near) {
  const top = list.slice(0, 12).map((h, i) => ({ h, i, walk: walkMinutes(h, near) }));
  const close = top.filter((x) => x.walk !== null && x.walk <= 12);
  const pool = close.length ? close : top;
  const good = pool.filter((x) => (x.h.rating ?? 0) >= 4);
  return (good.length ? good : pool).reduce((a, b) => (b.h.pricePerNight < a.h.pricePerNight ? b : a)).i;
}

function chosen(name) { const p = u.parts?.[name]; return p?.list?.[p.pick] || null; }
function partAmount(name) {
  const x = chosen(name);
  if (!x) return null;
  return name === 'flight' ? x.price : hotelTotal(x, u.plan.stays[name].nights);
}
function totals() {
  const names = ['flight', ...u.plan.cities];
  const known = names.filter((n) => partAmount(n));
  const total = known.reduce((s, n) => s + partAmount(n), 0);
  return { total, complete: known.length === names.length, missing: names.filter((n) => !partAmount(n)) };
}

const NOTICE = {
  limit: 'Live searches are paused for this month.',
  setup: 'Live prices are switching on.',
  empty: 'Nothing found for these dates.',
  unavailable: 'Couldn’t reach Google just now.',
  invalid: 'Please check these trip details.',
};

function renderResults() {
  const box = u.root.querySelector('#umResults');
  if (!box) return;
  const e = d.esc, ic = d.icon, f = u.form, plan = u.plan, cur = u.currency;
  const t = totals();
  if (!t.total) {
    const allLimit = Object.values(u.parts).every((p) => p.notice === 'limit' || p.notice === 'setup');
    box.innerHTML = `<div class="ls-notice"><h3>${allLimit ? 'Live prices are paused right now.' : 'We couldn’t price this package just now.'}</h3><p>${allLimit ? 'This month’s live searches are used up. A Uniworld advisor can price this exact package for you.' : 'Please try again, or send it to an advisor and they’ll price it for you.'}</p><div>${allLimit ? '' : `<button class="outline-button compact" data-um="retry">Try again</button>`}<button class="dark-button compact" data-um="request">Send to an advisor</button></div></div>`;
    return;
  }
  const perPerson = Math.round(t.total / f.travelers);
  const head = `<div class="um-summary">
      <div><span class="eyebrow">YOUR UMRAH PACKAGE · LIVE PRICE</span><h3>${plural(plan.nights, 'night')} · ${plural(f.travelers, 'traveler')}</h3><p>${day(plan.depart)} → ${day(plan.ret)} · ${e(originLabel(f.from))} → ${e(AIRPORT[plan.airport])}</p></div>
      <div class="um-total"><small>${t.complete ? 'Flights + hotels, total' : 'Price so far'}</small><strong>${money(t.total, cur)}</strong><small>${f.travelers > 1 ? `about ${money(perPerson, cur)} per person` : 'for 1 traveler'}</small></div>
    </div>`;
  const cards = ['flight', ...plan.cities].map((name, i) => (name === 'flight' ? flightCard(i + 1) : hotelCard(name, i + 1))).join('');
  const lastCity = plan.cities[plan.cities.length - 1];
  const homeNote = plan.airport === 'JED' && lastCity === 'madinah' ? 'the trip from Madinah back to Jeddah airport (the Haramain train takes about 2½ hours)' : plan.airport === 'MED' && lastCity === 'makkah' ? 'the trip from Makkah back to Madinah airport' : '';
  box.innerHTML = head + `<div class="um-parts">${cards}</div>
    <div class="um-extra"><h4>${ic('shield')} Your advisor adds and confirms</h4><ul><li>Umrah visa and Nusuk permits</li><li>Airport and city transfers${homeNote ? `, including ${homeNote}` : ''}</li><li>Room sharing for ${plural(f.travelers, 'traveler')}, and Ziyarat tours if you’d like them</li></ul></div>
    <div class="um-actions"><button class="dark-button" data-um="request">Request this package ${ic('arrow-right')}</button><button class="outline-button" data-um="advisor">Ask an advisor first</button></div>
    <p class="ls-foot">Live from Google Flights and Google Hotels${u.fetchedAt ? `, checked ${e(ago(u.fetchedAt))}` : ''}. Hotel prices are for ${plural(f.travelers, 'guest')} as shown on Google Hotels. Prices change quickly; a Uniworld advisor confirms the final price before you pay.</p>`;
}

function partNotice(p) {
  const text = p.message || NOTICE[p.notice] || NOTICE.unavailable;
  return `<p class="um-notice">${d.esc(text)} Your advisor will price this part for you.</p>`;
}

function flightCard(step) {
  const e = d.esc, p = u.parts.flight, o = chosen('flight'), cur = p.currency, plan = u.plan, f = u.form;
  if (!o) return `<article class="um-part um-flight"><div class="um-part-head"><span class="um-step">${step}</span><div><span class="eyebrow">RETURN FLIGHT</span><h4>${e(originLabel(f.from))} → ${e(AIRPORT[plan.airport])}</h4></div></div>${partNotice(p)}</article>`;
  const nextDay = o.depart?.time && o.arrive?.time && o.arrive.time.slice(0, 10) > o.depart.time.slice(0, 10);
  const via = o.layovers.map((l) => l.id).filter(Boolean).join(', ');
  return `<article class="um-part um-flight">
    <div class="um-part-head"><span class="um-step">${step}</span><div><span class="eyebrow">RETURN FLIGHT</span><h4>${o.logo ? `<img class="live-img live-logo" src="${e(o.logo)}" alt="" width="20" height="20"/>` : ''}${e(o.airlines.join(' + ') || 'Airline')}</h4></div><button class="text-button" data-um="change" data-part="flight">Change</button></div>
    <div class="um-route"><div><b>${e(clock(o.depart?.time))}</b><small>${e(o.depart?.id || f.from)} · ${e(shortDay(plan.depart))}</small></div><div class="um-mid"><small>${e(dur(o.durationMin))}</small><i aria-hidden="true"></i><small>${o.stops === 0 ? 'Nonstop' : `${plural(o.stops, 'stop')}${via ? ` · ${e(via)}` : ''}`}</small></div><div><b>${e(clock(o.arrive?.time))}${nextDay ? '<sup>+1</sup>' : ''}</b><small>${e(o.arrive?.id || plan.airport)}</small></div></div>
    <p class="um-sub">Flying home ${e(day(plan.ret))} from ${e(AIRPORT[plan.airport])}, included in this fare${p.notice === 'partial' ? ' · last saved fare' : ''}.</p>
    <div class="um-price"><b>${money(o.price, cur)}</b><small>round trip · ${f.travelers > 1 ? `total for ${plural(f.travelers, 'traveler')}` : '1 traveler'}</small></div>
  </article>`;
}

function hotelCard(name, step) {
  const e = d.esc, ic = d.icon, p = u.parts[name], h = chosen(name), cur = p.currency, s = u.plan.stays[name], city = CITY[name];
  const head = (title) => `<div class="um-part-head"><span class="um-step">${step}</span><div><span class="eyebrow">${city.name.toUpperCase()} · ${plural(s.nights, 'NIGHT')}</span><h4>${title}</h4></div>${h ? `<button class="text-button" data-um="change" data-part="${name}">Change</button>` : ''}</div>`;
  if (!h) return `<article class="um-part um-hotel">${head(`Hotels near ${e(city.mosque)}`)}${partNotice(p)}</article>`;
  const walk = walkMinutes(h, city.near), img = h.images?.[0]?.large || h.images?.[0]?.thumb, total = hotelTotal(h, s.nights);
  return `<article class="um-part um-hotel">
    ${head(e(h.name))}
    <div class="um-hotel-row">${img ? `<img class="live-img" src="${e(img)}" data-thumb="${e(h.images[0].thumb || '')}" alt="${e(h.name)}" loading="lazy"/>` : ''}<div>
      <p class="um-sub">${h.stars ? `<span class="ls-stars">${stars(h.stars)}</span> ${h.stars}-star` : 'Hotel'}${h.rating ? ` · <b>${h.rating.toFixed(1)}</b> ${ratingWord(h.rating)}${h.reviews ? ` (${h.reviews.toLocaleString('en-US')})` : ''}` : ''}</p>
      ${walk ? `<p class="um-walk">${ic('pin')} ${walk} min walk to ${e(city.mosque)}</p>` : h.nearby?.[0] ? `<p class="um-walk">${ic('pin')} ${e(h.nearby[0].name)}${h.nearby[0].how ? ' · ' + e(h.nearby[0].how) : ''}</p>` : ''}
      <p class="um-sub">${e(day(s.checkIn))} → ${e(day(s.checkOut))}${p.notice === 'partial' ? ' · last saved price' : ''}</p>
    </div></div>
    <div class="um-price"><b>${money(total, cur)}</b><small>${plural(s.nights, 'night')} · ${money(h.pricePerNight, cur)} a night</small></div>
  </article>`;
}

// ---------- Change the flight or a hotel ----------
function openPicker(name) {
  const p = u?.parts?.[name];
  if (!p?.list?.length) return;
  const e = d.esc, cur = p.currency;
  u.picker = name;
  let rows;
  if (name === 'flight') {
    const cheapest = Math.min(...p.list.map((o) => o.price)), fastest = Math.min(...p.list.map((o) => o.durationMin ?? 1e9));
    rows = p.list.map((o, i) => ({ o, i })).sort((a, b) => a.o.price - b.o.price).slice(0, 25).map(({ o, i }) => {
      const badges = [o.best ? 'Google’s pick' : '', o.price === cheapest ? 'Cheapest' : '', o.durationMin === fastest ? 'Fastest' : ''].filter(Boolean);
      const via = o.layovers.map((l) => l.id).filter(Boolean).join(', ');
      return `<li class="${i === p.pick ? 'is-picked' : ''}"><div><b>${e(o.airlines.join(' + ') || 'Airline')}</b>${badges.map((x) => `<span class="lf-badge">${x}</span>`).join('')}<small>${e(clock(o.depart?.time))} ${e(o.depart?.id || '')} → ${e(clock(o.arrive?.time))} ${e(o.arrive?.id || '')} · ${e(dur(o.durationMin))} · ${o.stops === 0 ? 'Nonstop' : `${plural(o.stops, 'stop')}${via ? ' via ' + e(via) : ''}`}</small></div><div class="um-pick-price"><b>${money(o.price, cur)}</b>${i === p.pick ? '<span>Chosen</span>' : `<button class="outline-button compact" data-um-pick="${i}">Choose</button>`}</div></li>`;
    }).join('');
  } else {
    const s = u.plan.stays[name], city = CITY[name];
    rows = p.list.map((h, i) => {
      const walk = walkMinutes(h, city.near), img = h.images?.[0]?.thumb || h.images?.[0]?.large;
      return `<li class="${i === p.pick ? 'is-picked' : ''}">${img ? `<img class="live-img" src="${e(img)}" alt="" loading="lazy"/>` : '<span class="um-noimg"></span>'}<div><b>${e(h.name)}</b><small>${h.stars ? `${h.stars}-star · ` : ''}${h.rating ? `${h.rating.toFixed(1)} ${ratingWord(h.rating)} · ` : ''}${walk ? `${walk} min walk` : h.nearby?.[0] ? e(h.nearby[0].name) : ''}</small></div><div class="um-pick-price"><b>${money(hotelTotal(h, s.nights), cur)}</b><small>${money(h.pricePerNight, cur)} a night</small>${i === p.pick ? '<span>Chosen</span>' : `<button class="outline-button compact" data-um-pick="${i}">Choose</button>`}</div></li>`;
    }).join('');
  }
  const title = name === 'flight' ? 'Choose your flight' : `Choose your ${CITY[name].name} hotel`;
  const sub = name === 'flight' ? `${originLabel(u.form.from)} ⇄ ${AIRPORT[u.plan.airport]} · ${day(u.plan.depart)} → ${day(u.plan.ret)} · cheapest first` : `${plural(u.plan.stays[name].nights, 'night')} · ${day(u.plan.stays[name].checkIn)} → ${day(u.plan.stays[name].checkOut)} · ${LEVELS[u.form.level].label} hotels near ${CITY[name].mosque}`;
  d.openModal(`<div class="modal-body um-picker"><span class="eyebrow">LIVE PRICES</span><h2 id="modalTitle">${title}</h2><p>${e(sub)}</p><ul class="um-pick-list">${rows}</ul>${p.link ? `<p class="small-print"><a href="${e(p.link)}" target="_blank" rel="noopener">See more on Google ↗</a></p>` : ''}</div>`);
}

function onPick(ev) {
  const b = ev.target.closest('[data-um-pick]');
  if (!b || !u?.picker || !u.parts?.[u.picker]) return;
  u.parts[u.picker].pick = Number(b.dataset.umPick);
  u.picker = null;
  d.closeModal?.();
  renderResults();
  d.toast?.('Your package is updated.');
}

// ---------- Send the package to an advisor ----------
function requestPackage() {
  if (!u) return;
  readForm();
  const problem = problemOf(u.form);
  if (problem) { const err = u.root.querySelector('#umError'); if (err) err.textContent = problem; return; }
  const f = u.form, plan = u.plan && u.parts ? u.plan : planOf(f), cur = u.parts ? u.currency : d.state.currency;
  const o = u.parts ? chosen('flight') : null;
  const hotels = Object.fromEntries(plan.cities.map((c) => [c, u.parts ? chosen(c) : null]));
  const breakdown = [];
  const pieces = [];
  if (o) {
    const numbers = o.legs.map((l) => l.flightNumber).filter(Boolean).slice(0, 4).join(' + ');
    const text = `${o.airlines.join(' + ')}${numbers ? ' ' + numbers : ''} · ${o.depart?.id || f.from} ${clock(o.depart?.time)} → ${o.arrive?.id || plan.airport} ${clock(o.arrive?.time)} · ${o.stops === 0 ? 'nonstop' : plural(o.stops, 'stop')} · home ${shortDay(plan.ret)}`;
    breakdown.push({ label: 'Flight', text, amount: o.price, currency: cur });
    pieces.push('Flight: ' + text);
  }
  for (const c of plan.cities) {
    const h = hotels[c], s = plan.stays[c];
    if (!h) continue;
    const walk = walkMinutes(h, CITY[c].near);
    const text = `${h.name}${h.stars ? ` (${h.stars}★)` : ''} · ${plural(s.nights, 'night')} from ${shortDay(s.checkIn)}${walk ? ` · ${walk} min walk` : ''}`;
    breakdown.push({ label: CITY[c].name, text, amount: hotelTotal(h, s.nights), currency: cur });
    pieces.push(`${CITY[c].name}: ${text}`);
  }
  const t = u.parts ? totals() : { total: 0 };
  d.openRequest({
    kind: 'umrah', from: originLabel(f.from), to: AIRPORT[plan.airport], start: plan.depart, end: plan.ret, travelers: f.travelers, cabin: 'Economy',
    makkahNights: f.makkah, madinahNights: f.madinah, order: f.order,
    makkahHotel: hotels.makkah?.name || '', madinahHotel: hotels.madinah?.name || '',
    title: `Umrah package · ${plural(plan.nights, 'night')}`, image: '/assets/makkah.webp',
    details: `${originLabel(f.from)} → ${AIRPORT[plan.airport]} · ${plan.cities.map((c) => `${plan.stays[c].nights} ${CITY[c].name}`).join(' + ')} · ${LEVELS[f.level].label} hotels`,
    seen: t.total ? { amount: t.total, currency: cur, source: 'Google Flights + Google Hotels', checkedAt: u.fetchedAt, per: 'trip' } : undefined,
    breakdown, chosen: pieces.join(' | ').slice(0, 590),
  });
}
