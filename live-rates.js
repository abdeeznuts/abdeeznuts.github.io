// Live prices: the current cheapest flight and hotel for a trip.
// Prices come from Google Flights and Google Hotels through Uniworld's price
// service (a Supabase function that keeps the API key off the phone and caches
// results). "Book with Uniworld" opens the app's request form with the price
// the customer saw; an advisor confirms and books.
const ENDPOINT = 'https://imytqgeldrfmxsxszrqs.supabase.co/functions/v1/uniworld-live-rates';
const ADVISOR_EMAIL = 'contact@uniworldinc.com';

// Popular routes for each market (currency).
export const ROUTES = {
  PKR: [
    { from: 'KHI', to: 'JED', fromCity: 'Karachi', toCity: 'Jeddah', note: 'Umrah' },
    { from: 'LHE', to: 'DXB', fromCity: 'Lahore', toCity: 'Dubai' },
    { from: 'ISB', to: 'LHR', fromCity: 'Islamabad', toCity: 'London' },
  ],
  GBP: [
    { from: 'LHR', to: 'JED', fromCity: 'London', toCity: 'Jeddah', note: 'Umrah' },
    { from: 'MAN', to: 'ISB', fromCity: 'Manchester', toCity: 'Islamabad' },
    { from: 'LHR', to: 'DXB', fromCity: 'London', toCity: 'Dubai' },
  ],
  USD: [
    { from: 'JFK', to: 'JED', fromCity: 'New York', toCity: 'Jeddah', note: 'Umrah' },
    { from: 'IAH', to: 'KHI', fromCity: 'Houston', toCity: 'Karachi' },
    { from: 'JFK', to: 'DXB', fromCity: 'New York', toCity: 'Dubai' },
  ],
};

// [label, code, city used for hotels]
export const AIRPORTS = [
  ['Karachi', 'KHI'], ['Lahore', 'LHE'], ['Islamabad', 'ISB'], ['Peshawar', 'PEW'], ['Multan', 'MUX'], ['Sialkot', 'SKT'],
  ['Jeddah', 'JED', 'Makkah'], ['Madinah', 'MED'], ['Riyadh', 'RUH'], ['Dubai', 'DXB'], ['Abu Dhabi', 'AUH'], ['Doha', 'DOH'],
  ['Istanbul', 'IST'], ['London Heathrow', 'LHR', 'London'], ['London Gatwick', 'LGW', 'London'], ['Manchester', 'MAN'],
  ['Birmingham', 'BHX'], ['Glasgow', 'GLA'], ['New York JFK', 'JFK', 'New York'], ['Newark', 'EWR', 'New York'],
  ['Houston', 'IAH'], ['Chicago', 'ORD'], ['Washington Dulles', 'IAD', 'Washington DC'], ['Dallas', 'DFW'],
  ['Los Angeles', 'LAX'], ['San Francisco', 'SFO'], ['Atlanta', 'ATL'], ['Boston', 'BOS'], ['Miami', 'MIA'],
  ['Toronto', 'YYZ'], ['Paris', 'CDG'], ['Malé, Maldives', 'MLE', 'Maldives'], ['Bali', 'DPS'], ['Santorini', 'JTR'],
  ['Kuala Lumpur', 'KUL'], ['Bangkok', 'BKK'],
];

let ctx = null;
const memory = new Map();
let requestSeq = 0;

const svg = {
  plane: '<path d="m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13"/>',
  bed: '<path d="M3 18v3m18-3v3M3 18h18v-8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8Zm0-5h18M6 8V4h12v4M12 8v5"/>',
  arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  arrowUpRight: '<path d="M6 18 18 6M6 6h12v12"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  swap: '<path d="M7 4v16m0 0-4-4m4 4 4-4M17 20V4m0 0-4 4m4-4 4 4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
};
const ic = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${svg[name]}</svg>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initLiveRates(options) {
  ctx = options;
  document.addEventListener('click', onClick);
  // Swap broken hotel photos for the smaller original, then for the app's fallback art.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img?.tagName !== 'IMG' || !img.classList.contains('live-img')) return;
    if (img.classList.contains('live-logo')) { img.remove(); return; }
    if (img.dataset.thumb && img.src !== img.dataset.thumb) { img.src = img.dataset.thumb; return; }
    if (!img.src.endsWith('fallback.svg')) img.src = 'fallback.svg';
  }, true);
}

const currency = () => (ctx?.getCurrency?.() in ROUTES ? ctx.getCurrency() : 'PKR');

export function money(amount, cur = currency()) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return '';
  return cur === 'PKR' ? `PKR ${n.toLocaleString('en-US')}` : `${cur === 'GBP' ? '£' : '$'}${n.toLocaleString('en-US')}`;
}
const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const tripDates = (a, b) => (b ? `${dayLabel(a)} → ${dayLabel(b)}` : `${dayLabel(a)} · one way`);
const duration = (min) => (min ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : '');
const clock = (stamp) => (typeof stamp === 'string' && stamp.length >= 16 ? stamp.slice(11, 16) : '');
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  return 'on ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const isoAdd = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const airportLabel = (code) => { const a = AIRPORTS.find((x) => x[1] === code); return a ? `${a[0]} (${a[1]})` : code; };

export function parseAirport(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const inParens = raw.match(/\(([A-Za-z]{3})\)\s*$/);
  const code = inParens ? inParens[1].toUpperCase() : /^[A-Za-z]{3}$/.test(raw) ? raw.toUpperCase() : null;
  const known = code ? AIRPORTS.find((a) => a[1] === code) : AIRPORTS.find((a) => a[0].toLowerCase().startsWith(raw.toLowerCase()));
  if (!code && !known) return null;
  const label = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { code: code || known[1], city: known ? (known[2] || known[0]) : label || code };
}

export async function fetchLive(body) {
  // text/plain keeps this a "simple" request, so phones skip the CORS preflight round trip.
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!data) throw new Error('Live prices did not respond. Please try again.');
  if (data.reason === 'invalid' || data.reason === 'forbidden') throw Object.assign(new Error(data.message || 'Please check your trip details.'), { invalid: true });
  return data;
}

function remember(key, data) {
  memory.set(key, data);
  try { localStorage.setItem('uniworld:live:' + key, JSON.stringify(data)); } catch { /* storage is optional */ }
}
function recall(key) {
  if (memory.has(key)) return memory.get(key);
  try { const v = JSON.parse(localStorage.getItem('uniworld:live:' + key)); if (v?.trip) { memory.set(key, v); return v; } } catch { /* ignore */ }
  return null;
}

// ---------- Advisor hand-off (real booking goes through a person) ----------
function flightMail(data) {
  const f = data.flight, t = data.trip;
  const subject = `Live fare request: ${t.from} → ${t.to}, ${dayLabel(t.depart)}${t.return ? ' – ' + dayLabel(t.return) : ''}`;
  const body = `Hello Uniworld,\n\nI saw this live fare in the Uniworld app and would like to book it, or the closest option:\n\nRoute: ${t.from} → ${t.to} (${f.tripType})\nDates: ${t.depart}${t.return ? ' to ' + t.return : ''}\nTravelers: ${f.travelers}\nAirline: ${f.airline}${f.flightNumbers?.length ? ' (' + f.flightNumbers.join(', ') + ')' : ''}\nStops: ${f.stops === 0 ? 'Nonstop' : f.stops}\nPrice shown: ${money(f.price, data.currency)} (Google Flights, checked ${ago(f.fetchedAt)})\n\nPlease confirm availability, baggage and the final price.\n\nThank you.`;
  return `mailto:${ADVISOR_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function hotelMail(data, h) {
  const s = data.hotel;
  const subject = `Hotel request: ${h.name}, ${dayLabel(s.checkIn)} – ${dayLabel(s.checkOut)}`;
  const body = `Hello Uniworld,\n\nI saw this hotel rate in the Uniworld app:\n\nHotel: ${h.name}${s.city ? ' (' + s.city + ')' : ''}\nCheck-in: ${s.checkIn}\nCheck-out: ${s.checkOut} (${s.nights} night${s.nights > 1 ? 's' : ''})\nGuests: ${s.guests}\nPrice shown: ${money(h.pricePerNight, data.currency)} per night${h.total ? ', ' + money(h.total, data.currency) + ' total' : ''} (Google Hotels, checked ${ago(s.fetchedAt)})\n\nPlease confirm the room, availability and final price.\n\nThank you.`;
  return `mailto:${ADVISOR_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Book with Uniworld: opens the app's request form with the price the customer saw ----------
const bookables = new Map();
let bookSeq = 0;
function bookButton(payload, label, fallbackHref) {
  if (!ctx?.onBook) return `<a class="live-cta" href="${fallbackHref}">${ic('mail')} ${label}</a>`;
  const id = 'b' + (++bookSeq);
  bookables.set(id, payload);
  if (bookables.size > 60) bookables.delete(bookables.keys().next().value);
  return `<button type="button" class="live-cta" data-action="live-book" data-book="${id}">${label} ${ic('arrowRight')}</button>`;
}
function flightPayload(data) {
  const f = data.flight, t = data.trip;
  const via = f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`;
  return {
    kind: 'flight', from: airportLabel(t.from), to: airportLabel(t.to), start: t.depart, end: t.return || '',
    travelers: f.travelers || t.adults || 1, cabin: 'Economy', oneWay: !t.return,
    title: `${airportLabel(t.from)} → ${airportLabel(t.to)}`, details: `${f.airline} · ${via} · Economy`,
    seen: { amount: f.price, currency: data.currency, source: 'Google Flights', checkedAt: f.fetchedAt, per: (f.travelers || 1) > 1 ? 'trip' : 'person', airline: f.airline, stops: f.stops },
  };
}
function hotelPayload(data, h) {
  const s = data.hotel;
  return {
    kind: 'hotel', hotelName: h.name, city: s.city || '', start: s.checkIn, end: s.checkOut, travelers: s.guests || 2,
    image: h.image || h.thumb || '', title: h.name, details: `${s.nights} night${s.nights > 1 ? 's' : ''}${s.city ? ' · ' + s.city : ''}`,
    seen: { amount: h.pricePerNight, total: h.total || null, currency: data.currency, source: 'Google Hotels', checkedAt: s.fetchedAt, per: 'night' },
  };
}

// ---------- Cards ----------
const LEVELS = { low: ['Low price', 'low'], typical: ['Typical price', 'typical'], high: ['Higher than usual', 'high'] };

// Google's price history for this trip, drawn as a small line chart.
function priceTrend(insights, cur) {
  const points = insights?.history;
  if (!Array.isArray(points) || points.length < 3) return '';
  const prices = points.map((p) => p[1]);
  const min = Math.min(...prices), max = Math.max(...prices);
  const W = 300, H = 64, pad = 6;
  const x = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v) => (max === min ? H / 2 : pad + ((max - v) * (H - pad * 2)) / (max - min));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const days = Math.max(1, Math.round((points[points.length - 1][0] - points[0][0]) / 86400));
  const last = points[points.length - 1];
  const id = 'lt' + Math.random().toString(36).slice(2, 8);
  return `<figure class="live-trend">
    <figcaption><span>Price over the last ${days} day${days > 1 ? 's' : ''}</span><span>${money(min, cur)} – ${money(max, cur)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Price history: lowest ${money(min, cur)}, highest ${money(max, cur)}, latest ${money(last[1], cur)}">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#dec799" stop-opacity=".35"/><stop offset="1" stop-color="#dec799" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="#dec799" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="3.5" fill="#f3eee2"/>
    </svg>
  </figure>`;
}

function flightCard(data) {
  const f = data.flight, t = data.trip, cur = data.currency;
  const level = LEVELS[f.insights?.level];
  const typical = f.insights?.typical?.length === 2 ? `Google’s usual range for this trip: ${money(f.insights.typical[0], cur)}–${money(f.insights.typical[1], cur)}` : '';
  const via = f.layovers?.map((l) => l.id).filter(Boolean).join(', ');
  const stops = f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}${via ? ` via ${via}` : ''}`;
  const nextDay = f.depart?.time && f.arrive?.time && f.arrive.time.slice(0, 10) > f.depart.time.slice(0, 10) ? ' (+1)' : '';
  return `<article class="live-card live-flight">
    <div class="live-card-top"><span class="live-kicker">${ic('plane')} CHEAPEST FLIGHT</span>${level ? `<span class="live-level ${level[1]}">${level[0]}</span>` : ''}</div>
    <div class="live-path">
      <div><b>${esc(t.from)}</b><small>${esc(f.fromCity || '')}</small></div>
      <span class="live-path-line" aria-hidden="true"><i></i>${ic('plane')}<i></i></span>
      <div class="live-path-end"><b>${esc(t.to)}</b><small>${esc(f.toCity || '')}</small></div>
    </div>
    <div class="live-price"><strong>${money(f.price, cur)}</strong><small>${f.tripType.toLowerCase()} · ${f.travelers > 1 ? `${f.travelers} travelers` : 'per person'}</small></div>
    <div class="live-facts">
      <span>${f.airlineLogo ? `<img class="live-img live-logo" src="${esc(f.airlineLogo)}" alt="" data-fallback="1" width="20" height="20"/>` : ''}${esc(f.airline)}</span>
      <span>${esc(stops)}${f.durationMin ? ` · ${duration(f.durationMin)}` : ''}</span>
      <span>${tripDates(t.depart, t.return)}${clock(f.depart?.time) ? ` · departs ${clock(f.depart.time)}, lands ${clock(f.arrive?.time)}${nextDay}` : ''}</span>
    </div>
    ${typical ? `<p class="live-note">${typical}</p>` : ''}
    ${priceTrend(f.insights, cur)}
    <div class="live-actions">${bookButton(flightPayload(data), 'Book with Uniworld', flightMail(data))}${ctx?.onAllFlights ? `<button type="button" class="live-link" data-action="live-all-flights" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-depart="${esc(t.depart)}" data-return="${esc(t.return || '')}" data-adults="${f.travelers || 1}">All ${f.compared ? f.compared + ' ' : ''}flights ${ic('arrowRight')}</button>` : `<a class="live-link" href="${esc(f.link || data.links.flights)}" target="_blank" rel="noopener">Google Flights ${ic('arrowUpRight')}</a>`}</div>
    <span class="live-stamp">${f.stale ? 'Last checked' : 'Checked'} ${ago(f.fetchedAt)}${f.compared ? ` · ${f.compared} fares compared` : ''} · <a href="${esc(f.link || data.links.flights)}" target="_blank" rel="noopener">Google Flights ↗</a></span>
  </article>`;
}

function hotelCard(data) {
  const s = data.hotel, h = s.cheapest, cur = data.currency;
  const rating = h.rating ? `<span class="live-rating">${ic('star')} ${h.rating.toFixed(1)}${h.reviews ? ` <small>(${h.reviews.toLocaleString('en-US')})</small>` : ''}</span>` : '';
  const stars = h.stars ? `${h.stars}-star hotel` : 'Hotel';
  const alt = s.wellRated;
  return `<article class="live-card live-hotel">
    <div class="live-photo">${h.image ? `<img class="live-img" src="${esc(h.image)}" data-thumb="${esc(h.thumb || '')}" data-fallback="1" alt="${esc(h.name)}" loading="lazy"/>` : '<div class="live-photo-empty"></div>'}
      <span class="live-kicker on-photo">${ic('bed')} CHEAPEST HOTEL${s.city ? ` · ${esc(s.city.toUpperCase())}` : ''}</span></div>
    <div class="live-hotel-body">
      <h3>${esc(h.name)}</h3>
      <p class="live-hotel-sub">${rating}<span>${stars}</span>${h.source ? `<span>via ${esc(h.source)}</span>` : ''}</p>
      <div class="live-price"><strong>${money(h.pricePerNight, cur)}</strong><small>per night${h.total ? ` · ${money(h.total, cur)} for ${s.nights} night${s.nights > 1 ? 's' : ''}` : ''}</small></div>
      <p class="live-dates">${dayLabel(s.checkIn)} → ${dayLabel(s.checkOut)} · ${s.guests} guest${s.guests > 1 ? 's' : ''}</p>
      ${alt ? `<a class="live-alt" href="${esc(alt.link || s.link)}" target="_blank" rel="noopener"><span>Best-rated cheap pick</span><b>${esc(alt.name)}</b><small>${alt.rating ? `★ ${alt.rating.toFixed(1)} · ` : ''}${money(alt.pricePerNight, cur)} / night</small></a>` : ''}
      <div class="live-actions">${bookButton(hotelPayload(data, h), 'Book with Uniworld', hotelMail(data, h))}${ctx?.onAllHotels ? `<button type="button" class="live-link" data-action="live-all-hotels" data-place="${esc(String(s.city || '').split(' · ')[0])}" data-checkin="${esc(s.checkIn)}" data-checkout="${esc(s.checkOut)}" data-adults="${s.guests || 2}">All hotels ${ic('arrowRight')}</button>` : `<a class="live-link" href="${esc(h.link || s.link)}" target="_blank" rel="noopener">Google Hotels ${ic('arrowUpRight')}</a>`}</div>
      <span class="live-stamp">${s.stale ? 'Last checked' : 'Checked'} ${ago(s.fetchedAt)}${s.compared ? ` · ${s.compared} stays compared` : ''} · <a href="${esc(h.link || s.link)}" target="_blank" rel="noopener">Google Hotels ↗</a></span>
    </div>
  </article>`;
}

function missingCard(kind, data, error) {
  const flight = kind === 'flight';
  const link = flight ? data?.links?.flights : data?.links?.hotels;
  const empty = data?.empty?.includes(kind);
  const title = empty ? (flight ? 'No flights found for these dates.' : 'No hotel rates found for these dates.')
    : data?.notice === 'setup' ? 'Live prices are switching on.'
    : data?.notice === 'limit' ? 'Live checks are paused for now.'
    : 'Live prices are taking a moment.';
  const text = empty ? 'Try nearby dates or another airport.'
    : data?.notice === 'setup' ? 'Real-time fares appear here once the price feed is connected.'
    : data?.notice === 'limit' ? 'This month’s live price checks are used up. Prices return automatically next month.'
    : (error || 'We couldn’t reach the price feed. Check your connection and try again.');
  return `<article class="live-card live-missing ${flight ? 'live-flight' : ''}">
    <span class="live-kicker">${ic(flight ? 'plane' : 'bed')} ${flight ? 'CHEAPEST FLIGHT' : 'CHEAPEST HOTEL'}</span>
    <h3>${title}</h3><p>${esc(text)}</p>
    <div class="live-actions">${!data || data.notice === 'unavailable' || data.notice === 'partial' ? `<button type="button" class="live-cta" data-action="live-retry">${ic('refresh')} Try again</button>` : ''}${link ? `<a class="live-link" href="${esc(link)}" target="_blank" rel="noopener">See on ${flight ? 'Google Flights' : 'Google Hotels'} ${ic('arrowUpRight')}</a>` : ''}</div>
  </article>`;
}

function skeleton(message = 'Checking real fares and hotel rates…') {
  return `<article class="live-card live-skeleton live-flight" aria-hidden="true"><span></span><span></span><span></span><span></span></article>
    <article class="live-card live-skeleton" aria-hidden="true"><span class="photo"></span><span></span><span></span><span></span></article>
    <p class="live-wait" role="status">${esc(message)}</p>`;
}

function renderResults(grid, data, error) {
  const wantsHotel = data?.trip?.hotelCity !== null || !data;
  grid.innerHTML = (data?.flight ? flightCard(data) : missingCard('flight', data, error))
    + (data?.hotel ? hotelCard(data) : wantsHotel ? missingCard('hotel', data, error) : '');
  grid.setAttribute('aria-busy', 'false');
}

// ---------- Section on Home / Flights ----------
export function liveRatesSection(place = 'home') {
  const flightsPage = place === 'flights';
  return `<section class="live-rates wrap" data-live-rates="${place}" aria-labelledby="liveTitle-${place}">
    <div class="live-head"><div>
      <span class="eyebrow live-eyebrow"><i class="live-dot" aria-hidden="true"></i>LIVE · GOOGLE FLIGHTS &amp; HOTELS</span>
      <h2 id="liveTitle-${place}">${flightsPage ? 'Real fares,' : 'Cheapest'} <span class="serif">right now.</span></h2>
      <p>${flightsPage ? 'The lowest real fares on popular routes, checked through the day.' : 'The lowest real flight and hotel prices for your next trip, checked through the day.'}</p>
    </div><button type="button" class="text-button live-any" data-action="live-search">Check any trip ${ic('arrowRight')}</button></div>
    <div class="live-routes" role="group" aria-label="Popular routes"></div>
    <div class="live-grid" aria-live="polite" aria-busy="true">${skeleton()}</div>
    <p class="live-foot">Real prices from Google Flights and Google Hotels at the time shown: round trip for 1 traveler, 3 weeks out, and 7 nights for 2 guests. Fares change quickly, so a Uniworld advisor confirms the final price before you pay.</p>
  </section>`;
}

const routeIndexKey = (cur) => 'uniworld:live-route:' + cur;
function chosenRoute(cur) {
  let i = 0;
  try { i = Number(localStorage.getItem(routeIndexKey(cur))) || 0; } catch { /* ignore */ }
  return Math.min(Math.max(i, 0), ROUTES[cur].length - 1);
}

export function mountLiveRates(root = document) {
  root.querySelectorAll('[data-live-rates]').forEach((section) => {
    const cur = currency();
    const index = chosenRoute(cur);
    section.querySelector('.live-routes').innerHTML = ROUTES[cur].map((r, i) => `<button type="button" class="live-route ${i === index ? 'active' : ''}" data-action="live-route" data-index="${i}" aria-pressed="${i === index}"><b>${r.fromCity}</b>${ic('arrowRight')}<b>${r.toCity}</b>${r.note ? `<small>${r.note}</small>` : ''}</button>`).join('');
    loadRoute(section, index);
  });
}

async function loadRoute(section, index) {
  const cur = currency();
  const route = ROUTES[cur][index];
  const grid = section.querySelector('.live-grid');
  const key = `deal:${route.from}:${route.to}:${cur}`;
  const seq = ++requestSeq;
  section.dataset.seq = seq;
  section.dataset.index = index;
  const known = recall(key);
  if (known && (known.flight || known.hotel)) {
    renderResults(grid, known);
    // Just checked a moment ago (e.g. navigating back to Home): no need to ask again.
    if (Date.now() - (known.clientAt || 0) < 120000) return;
  } else { grid.innerHTML = skeleton(); grid.setAttribute('aria-busy', 'true'); }
  const slow = setTimeout(() => {
    const wait = grid.querySelector('.live-wait');
    if (wait) wait.textContent = 'Comparing hundreds of fares and hotels. The first check of the day takes a few seconds…';
  }, 6000);
  try {
    const data = await fetchLive({ kind: 'deal', from: route.from, to: route.to, currency: cur, city: AIRPORTS.find((a) => a[1] === route.to)?.[2] || route.toCity });
    if (section.dataset.seq !== String(seq) || !section.isConnected) return;
    if (data.flight || data.hotel) remember(key, { ...data, clientAt: Date.now() });
    // Keep showing the last good prices if the feed has nothing new to add.
    if (!data.flight && !data.hotel && known && (known.flight || known.hotel)) renderResults(grid, { ...known, notice: data.notice });
    else renderResults(grid, data);
  } catch (e) {
    if (section.dataset.seq !== String(seq) || !section.isConnected) return;
    if (!(known && (known.flight || known.hotel))) renderResults(grid, null, e.message);
  } finally {
    clearTimeout(slow);
  }
}

// ---------- "Check any trip" ----------
export function openLiveSearch(prefill = {}) {
  const cur = currency();
  const r = ROUTES[cur][0];
  const depart = prefill.depart && prefill.depart >= isoAdd(0) ? prefill.depart : isoAdd(14);
  const ret = prefill.return && prefill.return > depart ? prefill.return : '';
  ctx.openModal(`<div class="modal-body live-modal">
    <span class="eyebrow live-eyebrow"><i class="live-dot" aria-hidden="true"></i>LIVE PRICES · ${cur}</span>
    <h2 id="modalTitle">What does it cost <span class="serif">right now?</span></h2>
    <p>Real fares from Google Flights and hotel rates from Google Hotels, for your exact dates.</p>
    <form id="liveSearchForm" class="live-form" novalidate>
      <div class="live-airports">
        <label><span>Flying from</span><input class="field-input" name="from" list="liveAirports" value="${esc(prefill.from || airportLabel(r.from))}" placeholder="Karachi (KHI)" autocomplete="off" required/></label>
        <button type="button" class="live-swap" data-action="live-swap" aria-label="Swap airports">${ic('swap')}</button>
        <label><span>Flying to</span><input class="field-input" name="to" list="liveAirports" value="${esc(prefill.to || airportLabel(r.to))}" placeholder="Jeddah (JED)" autocomplete="off" required/></label>
      </div>
      <div class="live-when">
        <label><span>Departure</span><input class="field-input" type="date" name="depart" min="${isoAdd(0)}" max="${isoAdd(330)}" value="${depart}" required/></label>
        <label><span>Return <small>optional</small></span><input class="field-input" type="date" name="return" min="${depart}" max="${isoAdd(390)}" value="${ret}"/></label>
        <label><span>Travelers</span><select class="field-input" name="adults">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}" ${i + 1 === (prefill.adults || 1) ? 'selected' : ''}>${i + 1} ${i ? 'travelers' : 'traveler'}</option>`).join('')}</select></label>
      </div>
      <button class="dark-button live-submit" type="submit">Show the cheapest prices ${ic('arrowRight')}</button>
      <p class="form-error" id="liveSearchError" role="alert"></p>
    </form>
    <datalist id="liveAirports">${AIRPORTS.map((a) => `<option value="${esc(a[0])} (${a[1]})"></option>`).join('')}</datalist>
    <div id="liveSearchResults" class="live-grid live-grid-modal" aria-live="polite"></div>
    <p class="small-print">Prices are what Google shows right now for your market (${cur}). A Uniworld advisor confirms availability and the final price before anything is booked.</p>
  </div>`);
  const form = document.getElementById('liveSearchForm');
  form.elements.depart.addEventListener('change', () => { form.elements.return.min = form.elements.depart.value; });
  form.addEventListener('submit', submitLiveSearch);
}

async function submitLiveSearch(e) {
  e.preventDefault();
  const form = e.currentTarget, error = document.getElementById('liveSearchError'), out = document.getElementById('liveSearchResults');
  const f = Object.fromEntries(new FormData(form));
  const a = parseAirport(f.from), b = parseAirport(f.to);
  error.textContent = '';
  if (!a || !b) { error.textContent = 'Pick airports from the list, or type a 3-letter code like KHI.'; return; }
  if (a.code === b.code) { error.textContent = 'Choose two different airports.'; return; }
  if (!f.depart || f.depart < isoAdd(0)) { error.textContent = 'Choose a departure date from today onward.'; return; }
  if (f.return && f.return < f.depart) { error.textContent = 'Your return date is before departure.'; return; }
  const button = form.querySelector('.live-submit');
  button.disabled = true;
  out.innerHTML = skeleton(`Checking ${a.code} → ${b.code} and hotels in ${b.city}…`);
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const slow = setTimeout(() => { const w = out.querySelector('.live-wait'); if (w) w.textContent = 'Comparing hundreds of fares and hotels. This can take a few seconds…'; }, 6000);
  try {
    const data = await fetchLive({ kind: 'search', from: a.code, to: b.code, depart: f.depart, return: f.return || undefined, adults: Number(f.adults) || 1, currency: currency(), city: b.city });
    if (!out.isConnected) return;
    renderResults(out, data);
  } catch (err) {
    if (!out.isConnected) return;
    if (err.invalid) { out.innerHTML = ''; error.textContent = err.message; }
    else renderResults(out, null, err.message);
  } finally {
    clearTimeout(slow);
    if (button.isConnected) button.disabled = false;
  }
}

// ---------- Live fare inside the flight search ----------
export async function liveFlightBanner(el, search) {
  if (!el) return;
  const a = parseAirport(search.from), b = parseAirport(search.to);
  if (!a || !b || a.code === b.code) { el.remove(); return; }
  el.innerHTML = `<div class="live-banner is-loading"><i class="live-dot" aria-hidden="true"></i><span>Checking the real lowest fare on Google Flights…</span></div>`;
  try {
    const cur = currency();
    const data = await fetchLive({ kind: 'search', from: a.code, to: b.code, depart: search.start, return: search.end || undefined, adults: Number(search.travelers) || 1, currency: cur, parts: ['flight'] });
    if (!el.isConnected) return;
    const f = data.flight;
    if (!f) {
      el.innerHTML = data.links?.flights ? `<div class="live-banner is-quiet"><span>Live fares for this route aren’t available right now.</span><a class="live-link" href="${esc(data.links.flights)}" target="_blank" rel="noopener">See on Google Flights ${ic('arrowUpRight')}</a></div>` : '';
      return;
    }
    const via = f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`;
    el.innerHTML = `<div class="live-banner">
      <div class="live-banner-main"><span class="eyebrow live-eyebrow"><i class="live-dot" aria-hidden="true"></i>REAL FARE RIGHT NOW</span>
        <strong>${money(f.price, data.currency)}</strong><small>${f.tripType.toLowerCase()} · ${f.travelers > 1 ? `${f.travelers} travelers` : 'per person'}</small>
        <p>${esc(f.airline)} · ${via}${f.durationMin ? ` · ${duration(f.durationMin)}` : ''} · checked ${ago(f.fetchedAt)}</p></div>
      <div class="live-actions">${bookButton(flightPayload(data), 'Book this fare', flightMail(data))}<a class="live-link" href="${esc(f.link || data.links.flights)}" target="_blank" rel="noopener">Google Flights ${ic('arrowUpRight')}</a></div>
      <small class="live-banner-note">The lowest real economy fare on Google Flights right now. An advisor confirms the exact flight and price with you before booking.</small>
    </div>`;
  } catch {
    if (el.isConnected) el.innerHTML = '';
  }
}

function onClick(e) {
  const b = e.target.closest('[data-action^="live-"]');
  if (!b) return;
  const action = b.dataset.action;
  if (action === 'live-search') openLiveSearch(ctx.getDates?.() || {});
  else if (action === 'live-all-flights') ctx?.onAllFlights?.({ from: airportLabel(b.dataset.from), to: airportLabel(b.dataset.to), depart: b.dataset.depart, return: b.dataset.return, adults: Number(b.dataset.adults) || 1 });
  else if (action === 'live-all-hotels') ctx?.onAllHotels?.({ place: b.dataset.place, checkIn: b.dataset.checkin, checkOut: b.dataset.checkout, adults: Number(b.dataset.adults) || 2 });
  else if (action === 'live-book') {
    const payload = bookables.get(b.dataset.book);
    if (payload && ctx?.onBook) ctx.onBook(payload);
  }
  else if (action === 'live-route') {
    const section = b.closest('[data-live-rates]');
    const index = Number(b.dataset.index) || 0;
    section.querySelectorAll('.live-route').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    try { localStorage.setItem(routeIndexKey(currency()), String(index)); } catch { /* ignore */ }
    loadRoute(section, index);
  } else if (action === 'live-retry') {
    const section = b.closest('[data-live-rates]');
    if (section) loadRoute(section, Number(section.dataset.index) || 0);
    else document.getElementById('liveSearchForm')?.requestSubmit();
  } else if (action === 'live-swap') {
    const form = document.getElementById('liveSearchForm');
    if (!form) return;
    const from = form.elements.from.value;
    form.elements.from.value = form.elements.to.value;
    form.elements.to.value = from;
  }
}
