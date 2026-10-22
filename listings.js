// Live listings, Booking.com style: real hotels from Google Hotels and real flights
// from Google Flights, through Uniworld's price service. Every result can be booked
// with a request to a Uniworld advisor (no payment in the app).
import { fetchLive, money, parseAirport, AIRPORTS } from './live-rates.js';

let d = null; // helpers from app.js: openModal, openRequest, esc, icon, state, toast

// Popular places. Makkah and Madinah search close to the two holy mosques.
export const PLACES = [
  { label: 'Makkah', sub: 'Near the Haram', q: 'Hotels near Masjid al-Haram Makkah', image: '/assets/makkah.webp' },
  { label: 'Madinah', sub: 'Near the Prophet’s Mosque', q: 'Hotels near Masjid an-Nabawi Madinah' },
  { label: 'Dubai', q: 'Hotels in Dubai', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=80' },
  { label: 'Istanbul', q: 'Hotels in Istanbul', image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=600&q=80' },
  { label: 'London', q: 'Hotels in London', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=600&q=80' },
  { label: 'Hunza', q: 'Hotels in Hunza', image: 'assets/hunza.webp' },
  { label: 'Maldives', q: 'Resorts in Maldives', image: '/assets/maldives.webp' },
  { label: 'Lahore', q: 'Hotels in Lahore' },
  { label: 'Islamabad', q: 'Hotels in Islamabad' },
  { label: 'Karachi', q: 'Hotels in Karachi' },
  { label: 'Bali', q: 'Hotels in Bali' },
  { label: 'Santorini', q: 'Hotels in Santorini' },
  { label: 'New York', q: 'Hotels in New York' },
];
export const placeQuery = (dest) => PLACES.find((p) => p.label.toLowerCase() === String(dest).trim().toLowerCase())?.q || String(dest).trim();

export function initListings(deps) {
  d = deps;
  document.addEventListener('click', onDocClick);
}

// ---------- Helpers ----------
const cur = () => d.state.currency;
const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const weekday = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const dur = (min) => (min ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : '');
const clock = (s) => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  return 'on ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
// "3 min · walking" -> "3 min walk", "1 hr · taxi" -> "1 hr by taxi"
function howText(how) { if (!how) return ''; const [t, type] = String(how).split(' · '); return !type ? t : type === 'walking' ? `${t} walk` : `${t} by ${type}`; }
const ratingWord = (r) => (r >= 4.5 ? 'Excellent' : r >= 4 ? 'Very good' : r >= 3.5 ? 'Good' : r >= 3 ? 'Pleasant' : 'Rated');
const stars = (n) => (n ? `<span class="ls-stars" aria-label="${n}-star hotel">${'★'.repeat(n)}</span>` : '');
const airportLabel = (code) => { const a = AIRPORTS.find((x) => x[1] === code); return a ? `${a[0]} (${a[1]})` : code; };
const noticeText = {
  setup: ['Live listings are switching on.', 'Real hotels and fares appear here once the price feed is connected.'],
  limit: ['Live searches are paused for now.', 'This month’s live searches are used up. A Uniworld advisor can still check anything for you.'],
  empty: ['Nothing found for these dates.', 'Try other dates, fewer filters or a nearby area.'],
  unavailable: ['Live results are taking a moment.', 'We couldn’t reach Google just now. Please try again.'],
  partial: ['Showing the last saved results.', 'Live results couldn’t refresh just now.'],
};
function noticeCard(kind, action = 'retry', scope = 'ls') {
  const [title, text] = noticeText[kind] || noticeText.unavailable;
  const retry = kind === 'unavailable' || kind === 'partial';
  return `<div class="ls-notice"><h3>${title}</h3><p>${text}</p><div>${retry ? `<button class="outline-button compact" data-${scope}="${action}">Try again</button>` : ''}<button class="dark-button compact" data-${scope}="advisor">Ask an advisor</button></div></div>`;
}

// ---------- Stays: live hotel search ----------
const FILTERS = { sort: '', minPrice: '', maxPrice: '', stars: [], rating: '', freeCancellation: false };
let filters = { ...FILTERS, stars: [] };
let stays = null; // the current search on screen

export function mountStays(root, search) {
  if (!root) return () => {};
  const st = { ...search, label: String(search.dest || '').trim(), hotels: [], next: null, loading: false, seq: 0, alive: true, fetchedAt: null, notice: null };
  st.q = placeQuery(st.label);
  st.nights = nightsBetween(st.checkIn, st.checkOut);
  stays = st;
  const onClick = (ev) => stayAction(ev, root, st);
  const onSubmit = (ev) => {
    if (ev.target.id !== 'lsFilters') return;
    ev.preventDefault();
    const f = new FormData(ev.target);
    filters = {
      sort: filters.sort,
      minPrice: String(f.get('minPrice') || '').replace(/\D/g, ''),
      maxPrice: String(f.get('maxPrice') || '').replace(/\D/g, ''),
      stars: f.getAll('stars').map(Number),
      rating: String(f.get('rating') || ''),
      freeCancellation: f.get('freeCancellation') === 'on',
    };
    root.querySelector('#lsFilters').hidden = true;
    load(root, st, false);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  if (!st.label) root.innerHTML = startView();
  else { root.innerHTML = shell(st); load(root, st, false); }
  return () => { st.alive = false; root.removeEventListener('click', onClick); root.removeEventListener('submit', onSubmit); };
}

function startView() {
  const e = d.esc;
  return `<section class="ls-start"><span class="eyebrow">LIVE FROM GOOGLE HOTELS</span><h2>Where would you like to stay?</h2><p>Pick a place, or type any city above. You’ll see real hotels with today’s prices.</p>
    <div class="ls-places">${PLACES.map((p) => `<button class="ls-place" data-ls="place" data-place="${e(p.label)}">${p.image ? `<img src="${e(p.image)}" alt="" loading="lazy"/>` : `<span class="ls-place-dot">${e(p.label.slice(0, 1))}</span>`}<span><b>${e(p.label)}</b>${p.sub ? `<small>${e(p.sub)}</small>` : ''}</span></button>`).join('')}</div></section>`;
}

const filterCount = () => (filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0) + (filters.stars.length ? 1 : 0) + (filters.rating ? 1 : 0) + (filters.freeCancellation ? 1 : 0);

function shell(st) {
  const e = d.esc, ic = d.icon;
  const sorts = [['', 'Recommended'], ['price', 'Lowest price'], ['rating', 'Top rated'], ['reviews', 'Most reviewed']];
  const n = filterCount();
  return `<div class="ls-bar">
      <p class="ls-summary"><span><b>${e(st.label)}</b> · ${day(st.checkIn)} – ${day(st.checkOut)} · ${plural(st.nights, 'night')} · ${plural(st.adults, 'adult')}</span><button class="text-button ls-edit" data-ls="edit">Change search</button></p>
      <div class="ls-tools"><div class="ls-sorts" role="group" aria-label="Sort stays">${sorts.map(([k, l]) => `<button class="chip ${filters.sort === k ? 'active' : ''}" data-ls="sort" data-sort="${k}" aria-pressed="${filters.sort === k}">${l}</button>`).join('')}</div>
      <button class="outline-button compact ls-filter-btn" data-ls="filters" aria-expanded="false" aria-controls="lsFilters">${ic('menu')} Filters${n ? ` (${n})` : ''}</button></div>
    </div>
    <form id="lsFilters" class="ls-filters" hidden>
      <fieldset><legend>Price per night (${e(cur())})</legend><div class="ls-range"><input class="field-input" name="minPrice" inputmode="numeric" placeholder="Min" value="${e(filters.minPrice)}" aria-label="Minimum price per night"/><span>–</span><input class="field-input" name="maxPrice" inputmode="numeric" placeholder="Max" value="${e(filters.maxPrice)}" aria-label="Maximum price per night"/></div></fieldset>
      <fieldset><legend>Hotel class</legend><div class="ls-checks">${[2, 3, 4, 5].map((s) => `<label><input type="checkbox" name="stars" value="${s}" ${filters.stars.includes(s) ? 'checked' : ''}/><span>${s}★</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Guest rating</legend><div class="ls-checks">${[['', 'Any'], ['7', '3.5+'], ['8', '4.0+'], ['9', '4.5+']].map(([v, l]) => `<label><input type="radio" name="rating" value="${v}" ${filters.rating === v ? 'checked' : ''}/><span>${l}</span></label>`).join('')}</div></fieldset>
      <label class="ls-toggle"><input type="checkbox" name="freeCancellation" ${filters.freeCancellation ? 'checked' : ''}/><span>Free cancellation only</span></label>
      <div class="ls-filter-actions"><button type="button" class="text-button" data-ls="clear">Clear all</button><button class="dark-button compact" type="submit">Show stays</button></div>
    </form>
    <div class="ls-list" aria-live="polite"></div>
    <div class="ls-more-wrap"></div>
    <p class="ls-foot"></p>`;
}

function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => `<article class="ls-card ls-skel" aria-hidden="true"><div class="ls-photo"></div><div class="ls-body"><span></span><span></span><span></span></div></article>`).join('');
}

async function load(root, st, more) {
  if (st.loading) return;
  st.loading = true;
  const seq = ++st.seq;
  const list = root.querySelector('.ls-list'), moreWrap = root.querySelector('.ls-more-wrap'), foot = root.querySelector('.ls-foot');
  if (!list) { st.loading = false; return; }
  if (!more) { st.hotels = []; st.next = null; list.innerHTML = skeletonCards(3) + `<p class="ls-wait" role="status">Finding real hotels in ${d.esc(st.label)}…</p>`; moreWrap.innerHTML = ''; }
  else moreWrap.innerHTML = `<p class="ls-wait" role="status">Loading more stays…</p>`;
  const slow = setTimeout(() => { const w = root.querySelector('.ls-wait'); if (w) w.textContent = 'Checking hundreds of hotels. This can take a few seconds…'; }, 5000);
  try {
    const res = await fetchLive({
      kind: 'hotels', q: st.q, checkIn: st.checkIn, checkOut: st.checkOut, adults: st.adults, currency: cur(),
      sort: filters.sort || undefined, minPrice: filters.minPrice || undefined, maxPrice: filters.maxPrice || undefined,
      stars: filters.stars.length ? filters.stars : undefined, rating: filters.rating || undefined,
      freeCancellation: filters.freeCancellation || undefined, page: more ? st.next : undefined,
    });
    if (!st.alive || seq !== st.seq) return;
    st.currency = res.currency;
    if (res.data) {
      st.hotels = more ? [...st.hotels, ...res.data.hotels.filter((h) => !st.hotels.some((x) => x.token && x.token === h.token))] : res.data.hotels;
      st.next = res.data.next;
      st.link = res.data.link;
      st.fetchedAt = res.fetchedAt;
      st.notice = res.stale ? 'partial' : null;
    } else if (!more) { st.notice = res.notice || 'unavailable'; }
    else d.toast(noticeText[res.notice || 'unavailable'][0]);
    render(root, st);
  } catch (e) {
    if (!st.alive || seq !== st.seq) return;
    if (!more) list.innerHTML = e.invalid ? `<div class="ls-notice"><h3>Let’s adjust your search.</h3><p>${d.esc(e.message)}</p></div>` : noticeCard('unavailable');
    else { moreWrap.innerHTML = ''; d.toast('Couldn’t load more stays. Please try again.'); render(root, st); }
    foot.textContent = '';
  } finally {
    clearTimeout(slow);
    if (seq === st.seq) st.loading = false;
  }
}

function render(root, st) {
  const list = root.querySelector('.ls-list'), moreWrap = root.querySelector('.ls-more-wrap'), foot = root.querySelector('.ls-foot');
  if (!list) return;
  if (!st.hotels.length) { list.innerHTML = noticeCard(st.notice || 'empty'); moreWrap.innerHTML = ''; foot.textContent = ''; return; }
  list.innerHTML = (st.notice === 'partial' ? `<p class="ls-stale">${noticeText.partial[0]} ${noticeText.partial[1]}</p>` : '') + st.hotels.map((h, i) => hotelCard(h, i, st)).join('');
  moreWrap.innerHTML = st.next ? `<button class="outline-button ls-more" data-ls="more">Show more stays</button>` : '';
  foot.innerHTML = `${plural(st.hotels.length, 'stay')} · live from Google Hotels, checked ${d.esc(ago(st.fetchedAt))}. Prices per night for ${plural(st.adults, 'adult')}, in ${d.esc(st.currency || cur())}. A Uniworld advisor confirms the final price before you pay.${st.link ? ` <a href="${d.esc(st.link)}" target="_blank" rel="noopener">See on Google Hotels ↗</a>` : ''}`;
}

function hotelCard(h, i, st) {
  const e = d.esc, ic = d.icon, cur = st.currency || d.state.currency;
  const img = h.images[0]?.large || h.images[0]?.thumb;
  const near = h.nearby?.[0];
  return `<article class="ls-card">
    <button class="ls-photo" data-ls="open" data-i="${i}" aria-label="See ${e(h.name)}">${img ? `<img src="${e(img)}" alt="${e(h.name)}" loading="lazy"/>` : ''}${h.deal ? `<span class="ls-deal">${e(h.deal)}</span>` : ''}${h.images.length > 1 ? `<span class="ls-count">${h.images.length} photos</span>` : ''}</button>
    <div class="ls-body">
      <h3><button data-ls="open" data-i="${i}">${e(h.name)}</button></h3>
      <p class="ls-kind">${h.type === 'vacation rental' ? 'Apartment / home' : h.stars ? `${stars(h.stars)} ${h.stars}-star hotel` : 'Hotel'}</p>
      ${h.rating ? `<p class="ls-rating"><b>${h.rating.toFixed(1)}</b><span>${ratingWord(h.rating)}</span>${h.reviews ? `<small>${h.reviews.toLocaleString('en-US')} reviews</small>` : ''}</p>` : ''}
      ${near ? `<p class="ls-near">${ic('pin')} ${e(near.how ? howText(near.how) + ' to ' : '')}${e(near.name)}</p>` : ''}
      ${h.essentialInfo?.length ? `<p class="ls-amen">${h.essentialInfo.slice(0, 3).map(e).join(' · ')}</p>` : h.amenities.length ? `<p class="ls-amen">${h.amenities.slice(0, 3).map(e).join(' · ')}</p>` : ''}
    </div>
    <div class="ls-price">
      <small>${plural(st.nights, 'night')}, ${plural(st.adults, 'adult')}</small>
      <strong>${money(h.pricePerNight, cur)}</strong><small>per night</small>
      ${h.total ? `<small class="ls-total">${money(h.total, cur)} total</small>` : ''}
      <button class="dark-button compact" data-ls="book" data-i="${i}">Book</button>
    </div>
  </article>`;
}

function stayAction(ev, root, st) {
  const b = ev.target.closest('[data-ls]');
  if (!b) return;
  const a = b.dataset.ls;
  if (a === 'place') { d.goStays?.(b.dataset.place); return; }
  if (a === 'open') openHotel(st.hotels[Number(b.dataset.i)], st);
  else if (a === 'book') bookHotel(st.hotels[Number(b.dataset.i)], st);
  else if (a === 'sort') { filters.sort = b.dataset.sort; root.querySelectorAll('[data-ls=sort]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); }); load(root, st, false); }
  else if (a === 'filters') { const f = root.querySelector('#lsFilters'); f.hidden = !f.hidden; b.setAttribute('aria-expanded', String(!f.hidden)); }
  else if (a === 'clear') { filters = { ...FILTERS, stars: [], sort: filters.sort }; root.innerHTML = shell(st); load(root, st, false); }
  else if (a === 'more') load(root, st, true);
  else if (a === 'edit') { const box = document.querySelector('.ls-search'); if (box) { box.classList.remove('is-collapsed'); box.scrollIntoView({ block: 'start', behavior: 'instant' }); box.querySelector('#destination')?.focus(); } }
  else if (a === 'retry') load(root, st, false);
  else if (a === 'advisor') d.openAdvisor?.();
}

function hotelPayload(h, st, room) {
  const cur = st.currency || d.state.currency;
  const price = room?.pricePerNight || h.pricePerNight, total = room ? room.total : h.total;
  const parts = [h.name, h.stars ? `${h.stars}-star` : '', room?.name ? `Room: ${room.name}${room.source ? ` (${room.source})` : ''}` : '', h.address || (h.nearby?.[0] ? `${h.nearby[0].how ? howText(h.nearby[0].how) + ' to ' : ''}${h.nearby[0].name}` : '')].filter(Boolean);
  return {
    kind: 'hotel', hotelName: h.name, city: st.label, start: st.checkIn, end: st.checkOut, travelers: st.adults + (st.children || 0),
    image: h.images?.[0]?.large || h.images?.[0]?.thumb || '', title: h.name,
    details: `${plural(st.nights, 'night')} · ${plural(st.adults, 'adult')}${st.children ? ` · ${plural(st.children, 'child')}` : ''}${st.rooms > 1 ? ` · ${st.rooms} rooms` : ''}`,
    seen: { amount: price, total: total || null, currency: cur, source: 'Google Hotels', checkedAt: st.fetchedAt, per: 'night' },
    chosen: parts.join(' · ').slice(0, 290),
  };
}
const bookHotel = (h, st, room) => { if (h) d.openRequest(hotelPayload(h, st, room)); };

// ---------- One hotel ----------
let shown = null; // { h, st, detail }

function openHotel(h, st) {
  if (!h) return;
  shown = { h, st, detail: null };
  const e = d.esc, ic = d.icon, cur = st.currency || d.state.currency;
  const imgs = h.images.length ? h.images : [];
  d.openModal(`<div class="hd">
    <div class="hd-gallery" id="hdGallery">${imgs.map((im, i) => `<img src="${e(im.large || im.thumb)}" alt="${e(h.name)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}/>`).join('') || '<div class="hd-noimg"></div>'}</div>
    <div class="hd-body">
      <span class="eyebrow">${e(st.label.toUpperCase())}${h.type === 'vacation rental' ? ' · APARTMENT / HOME' : h.stars ? ` · ${h.stars}-STAR HOTEL` : ''}</span>
      <h2 id="modalTitle">${e(h.name)}</h2>
      ${h.rating ? `<p class="ls-rating hd-rating"><b>${h.rating.toFixed(1)}</b><span>${ratingWord(h.rating)}</span>${h.reviews ? `<small>${h.reviews.toLocaleString('en-US')} reviews</small>` : ''}${h.locationRating ? `<small>· Location ${h.locationRating.toFixed(1)}</small>` : ''}</p>` : ''}
      <p class="hd-address" id="hdAddress">${h.nearby?.[0] ? `${ic('pin')} ${e(h.nearby[0].how ? howText(h.nearby[0].how) + ' to ' : '')}${e(h.nearby[0].name)}` : ''}</p>
      <div class="hd-pricebox">
        <div><strong>${money(h.pricePerNight, cur)}</strong><small>per night</small>${h.total ? `<small>${money(h.total, cur)} for ${plural(st.nights, 'night')}</small>` : ''}<small>${weekday(st.checkIn)} → ${weekday(st.checkOut)} · ${plural(st.adults, 'adult')}</small></div>
        <button class="dark-button" data-hd="book">Book with Uniworld ${ic('arrow-right')}</button>
        <p>No payment now. A Uniworld advisor confirms the room and the final price with you.</p>
      </div>
      <section class="hd-section" id="hdPrices"><h3>Prices on booking sites</h3><p class="ls-wait">Checking Booking.com, Agoda, Expedia and more…</p></section>
      <section class="hd-section" id="hdRooms" hidden></section>
      ${h.amenities.length ? `<section class="hd-section"><h3>Popular amenities</h3><ul class="hd-chips" id="hdAmenities">${h.amenities.map((a) => `<li>${e(a)}</li>`).join('')}</ul></section>` : '<section class="hd-section" id="hdAmenitiesWrap" hidden></section>'}
      <section class="hd-section" id="hdNearby"${h.nearby?.length ? '' : ' hidden'}><h3>What’s nearby</h3><ul class="hd-list">${(h.nearby || []).map((n) => `<li><b>${e(n.name)}</b>${n.how ? `<span>${e(howText(n.how))}</span>` : ''}</li>`).join('')}</ul></section>
      <section class="hd-section" id="hdAbout"${h.description || h.checkInTime ? '' : ' hidden'}><h3>Good to know</h3>${h.checkInTime || h.checkOutTime ? `<p>Check-in ${e(h.checkInTime || '—')} · Check-out ${e(h.checkOutTime || '—')}</p>` : ''}${h.description ? `<p>${e(h.description)}</p>` : ''}</section>
      <p class="small-print">Live from Google Hotels, checked ${e(ago(st.fetchedAt))}. ${h.link ? `<a href="${e(h.link)}" target="_blank" rel="noopener">View on Google Hotels ↗</a>` : ''}</p>
    </div>
  </div>`);
  loadDetail(h, st);
}

async function loadDetail(h, st) {
  const box = document.getElementById('hdPrices');
  if (!h.token) { if (box) box.hidden = true; return; }
  try {
    const res = await fetchLive({ kind: 'hotel', token: h.token, checkIn: st.checkIn, checkOut: st.checkOut, adults: st.adults, currency: st.currency || cur() });
    if (!shown || shown.h !== h || !document.getElementById('hdPrices')) return;
    if (!res.data) { document.getElementById('hdPrices').innerHTML = `<h3>Prices on booking sites</h3><p>${d.esc((noticeText[res.notice] || noticeText.unavailable)[1])}</p>`; return; }
    shown.detail = res.data;
    fillDetail(h, st, res.data);
  } catch {
    const el = document.getElementById('hdPrices');
    if (el && shown?.h === h) el.innerHTML = `<h3>Prices on booking sites</h3><p>${noticeText.unavailable[1]}</p>`;
  }
}

function fillDetail(h, st, x) {
  const e = d.esc, ic = d.icon, cur = st.currency || d.state.currency;
  const $ = (id) => document.getElementById(id);
  if (x.images.length > h.images.length) $('hdGallery').innerHTML = x.images.map((im, i) => `<img src="${e(im.large || im.thumb)}" alt="${e(x.name)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}/>`).join('');
  if (x.address) { $('hdAddress').innerHTML = `${ic('pin')} ${e(x.address)}`; h.address = x.address; }
  $('hdPrices').innerHTML = `<h3>Prices on booking sites</h3>${x.prices.length ? `<ul class="hd-prices">${x.prices.map((p) => `<li><span class="hd-src">${p.logo ? `<img class="live-img live-logo" src="${e(p.logo)}" alt="" width="18" height="18" data-fallback="1"/>` : ''}${e(p.source)}${p.official ? ' <small>Official site</small>' : ''}</span><span class="hd-amt"><b>${money(p.pricePerNight, cur)}</b>${p.total ? `<small>${money(p.total, cur)} total</small>` : ''}${p.freeCancellation ? `<small class="hd-free">Free cancellation${p.freeCancellationUntil ? ' until ' + e(p.freeCancellationUntil) : ''}</small>` : ''}</span></li>`).join('')}</ul><p class="hd-note">Book with Uniworld and your advisor matches the best real price.</p>` : '<p>No booking-site prices for these dates.</p>'}${x.typical ? `<p class="hd-note">Usual price here: ${money(x.typical[0], cur)}–${money(x.typical[1], cur)} a night.</p>` : ''}`;
  if (x.rooms.length) {
    const rooms = $('hdRooms');
    rooms.hidden = false;
    rooms.innerHTML = `<h3>Rooms</h3><ul class="hd-rooms">${x.rooms.map((r, i) => `<li>${r.image ? `<img src="${e(r.image)}" alt="" loading="lazy"/>` : ''}<div><b>${e(r.name)}</b><small>${[r.guests ? `Sleeps ${r.guests}` : '', r.breakfast ? 'Breakfast option' : '', r.source ? `via ${r.source}` : ''].filter(Boolean).map(e).join(' · ')}</small></div><div class="hd-room-price"><b>${money(r.pricePerNight, cur)}</b><small>per night</small><button class="outline-button compact" data-hd="room" data-i="${i}">Book</button></div></li>`).join('')}</ul>`;
  }
  if (x.amenities.length && !h.amenities.length) { const w = $('hdAmenitiesWrap'); if (w) { w.hidden = false; w.innerHTML = `<h3>Popular amenities</h3><ul class="hd-chips">${x.amenities.slice(0, 16).map((a) => `<li>${e(a)}</li>`).join('')}</ul>`; } }
  else if (x.amenities.length > h.amenities.length) { const l = $('hdAmenities'); if (l) l.innerHTML = x.amenities.slice(0, 20).map((a) => `<li>${e(a)}</li>`).join(''); }
  if (x.nearby.length) { const n = $('hdNearby'); n.hidden = false; n.innerHTML = `<h3>What’s nearby</h3><ul class="hd-list">${x.nearby.map((p) => `<li><b>${e(p.name)}</b>${p.how ? `<span>${e(howText(p.how))}</span>` : ''}</li>`).join('')}</ul>`; }
  if (x.description || x.checkInTime || x.phone) {
    const a = $('hdAbout');
    a.hidden = false;
    a.innerHTML = `<h3>Good to know</h3>${x.checkInTime || x.checkOutTime ? `<p>Check-in ${e(x.checkInTime || '—')} · Check-out ${e(x.checkOutTime || '—')}</p>` : ''}${x.highlights.length ? `<p class="hd-highlights">${x.highlights.slice(0, 4).map((b) => `<span>${e(b.name)} <b>${b.mentioned ? Math.round((b.positive / b.mentioned) * 100) : 0}% positive</b></span>`).join('')}</p>` : ''}${x.description ? `<p>${e(x.description)}</p>` : ''}`;
  }
}

function onDocClick(ev) {
  const b = ev.target.closest('[data-hd]');
  if (!b || !shown) return;
  if (b.dataset.hd === 'book') bookHotel(shown.h, shown.st);
  else if (b.dataset.hd === 'room') bookHotel(shown.h, shown.st, shown.detail?.rooms?.[Number(b.dataset.i)]);
}

// ---------- Flights: every option for a route ----------
const CABIN_NAMES = { Economy: 'Economy', 'Premium economy': 'Premium economy', Business: 'Business', 'First class': 'First class' };

export async function searchFlights(el, search) {
  if (!el) return;
  const a = parseAirport(search.from), b = parseAirport(search.to);
  if (!a || !b) { el.innerHTML = `<div class="ls-notice"><h3>Which airports?</h3><p>Pick airports from the list, or type a 3-letter code like KHI or JED.</p></div>`; return; }
  if (a.code === b.code) { el.innerHTML = `<div class="ls-notice"><h3>Choose two different airports.</h3></div>`; return; }
  const fs = { a, b, ...search, cabin: CABIN_NAMES[search.cabin] || 'Economy', sort: 'best', stops: 'any', data: null, fetchedAt: null };
  el._flights = fs;
  if (!el._wired) {
    el._wired = true;
    el.addEventListener('click', (ev) => flightAction(ev, el));
  }
  el.innerHTML = `<div class="lf-head"><span class="eyebrow">LIVE FROM GOOGLE FLIGHTS</span><h2>${d.esc(airportLabel(a.code))} → ${d.esc(airportLabel(b.code))}</h2><p>${flightSummary(fs)}</p></div><div class="lf-list">${Array.from({ length: 3 }, () => '<article class="lf-card ls-skel" aria-hidden="true"><span></span><span></span><span></span></article>').join('')}<p class="ls-wait" role="status">Finding real flights…</p></div>`;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  const slow = setTimeout(() => { const w = el.querySelector('.ls-wait'); if (w) w.textContent = 'Comparing airlines and routes. This can take a few seconds…'; }, 5000);
  try {
    const res = await fetchLive({ kind: 'flights', from: a.code, to: b.code, depart: search.start, return: search.end || undefined, adults: Number(search.travelers) || 1, cabin: fs.cabin, currency: cur() });
    if (el._flights !== fs) return;
    fs.data = res.data; fs.fetchedAt = res.fetchedAt; fs.notice = res.data ? (res.stale ? 'partial' : null) : (res.notice || 'unavailable'); fs.currency = res.currency;
    renderFlights(el, fs);
  } catch (e) {
    if (el._flights !== fs) return;
    el.querySelector('.lf-list').innerHTML = e.invalid ? `<div class="ls-notice"><h3>Let’s adjust your search.</h3><p>${d.esc(e.message)}</p></div>` : noticeCard('unavailable', 'retry', 'lf');
  } finally { clearTimeout(slow); }
}

function flightSummary(fs) {
  return `${weekday(fs.start)}${fs.end ? ` → ${weekday(fs.end)}` : ' · one way'} · ${plural(Number(fs.travelers) || 1, 'traveler')} · ${d.esc(fs.cabin)}`;
}

function sortedOptions(fs) {
  let list = [...(fs.data?.options || [])];
  if (fs.stops === 'nonstop') list = list.filter((o) => o.stops === 0);
  else if (fs.stops === 'one') list = list.filter((o) => o.stops <= 1);
  const t = (o) => o.depart?.time || '';
  if (fs.sort === 'price') list.sort((x, y) => x.price - y.price);
  else if (fs.sort === 'fastest') list.sort((x, y) => (x.durationMin ?? 1e9) - (y.durationMin ?? 1e9));
  else if (fs.sort === 'earliest') list.sort((x, y) => t(x).localeCompare(t(y)));
  return list;
}

function renderFlights(el, fs) {
  const e = d.esc;
  const head = `<div class="lf-head"><span class="eyebrow">LIVE FROM GOOGLE FLIGHTS</span><h2>${e(airportLabel(fs.a.code))} → ${e(airportLabel(fs.b.code))}</h2><p>${flightSummary(fs)}</p></div>`;
  if (!fs.data) { el.innerHTML = head + `<div class="lf-list">${noticeCard(fs.notice, 'retry', 'lf')}</div>`; return; }
  const all = fs.data.options, cheapest = Math.min(...all.map((o) => o.price)), fastest = Math.min(...all.map((o) => o.durationMin ?? 1e9));
  const options = sortedOptions(fs);
  const ins = fs.data.insights;
  const level = { low: 'Prices are low right now', typical: 'Prices are typical right now', high: 'Prices are higher than usual' }[ins?.level];
  const cur = fs.currency || d.state.currency;
  const sorts = [['best', 'Best'], ['price', 'Cheapest'], ['fastest', 'Fastest'], ['earliest', 'Earliest']];
  const stops = [['any', 'Any stops'], ['nonstop', 'Nonstop'], ['one', '1 stop max']];
  el.innerHTML = head
    + (level ? `<p class="lf-insight"><b>${level}.</b>${ins.typical?.length === 2 ? ` Google’s usual range: ${money(ins.typical[0], cur)}–${money(ins.typical[1], cur)}.` : ''}</p>` : '')
    + `<div class="lf-controls"><div role="group" aria-label="Sort flights">${sorts.map(([k, l]) => `<button class="chip ${fs.sort === k ? 'active' : ''}" data-lf="sort" data-v="${k}" aria-pressed="${fs.sort === k}">${l}</button>`).join('')}</div><div role="group" aria-label="Stops">${stops.map(([k, l]) => `<button class="chip ${fs.stops === k ? 'active' : ''}" data-lf="stops" data-v="${k}" aria-pressed="${fs.stops === k}">${l}</button>`).join('')}</div></div>`
    + `<div class="lf-list">${options.length ? options.map((o) => flightCard(o, fs, all.indexOf(o), cheapest, fastest)).join('') : `<div class="ls-notice"><h3>No flights match.</h3><p>Try allowing more stops.</p></div>`}</div>`
    + `<p class="ls-foot">${plural(all.length, 'flight')} · live from Google Flights, checked ${e(ago(fs.fetchedAt))}.${fs.end ? ' Round-trip prices include your return; your advisor confirms the return flight.' : ''} A Uniworld advisor confirms the final price before you pay. <a href="${e(fs.data.link)}" target="_blank" rel="noopener">See on Google Flights ↗</a></p>`
    + `<div class="lf-help"><p>Want a different time, airline or a multi-city trip?</p><button class="outline-button compact" data-lf="advisor-request">Ask an advisor</button></div>`;
}

function flightCard(o, fs, i, cheapest, fastest) {
  const e = d.esc, cur = fs.currency || d.state.currency, n = Number(fs.travelers) || 1;
  const nextDay = o.depart?.time && o.arrive?.time && o.arrive.time.slice(0, 10) > o.depart.time.slice(0, 10);
  const via = o.layovers.map((l) => l.id).filter(Boolean).join(', ');
  const badges = [o.best ? 'Best' : '', o.price === cheapest ? 'Cheapest' : '', o.durationMin === fastest ? 'Fastest' : ''].filter(Boolean);
  return `<article class="lf-card">
    <div class="lf-top">${o.logo ? `<img class="live-img live-logo" src="${e(o.logo)}" alt="" width="22" height="22" data-fallback="1"/>` : ''}<span>${e(o.airlines.join(' + ') || 'Airline')}</span>${badges.map((b) => `<span class="lf-badge">${b}</span>`).join('')}</div>
    <div class="lf-route">
      <div><b>${e(clock(o.depart?.time))}</b><small>${e(o.depart?.id || fs.a.code)}</small></div>
      <div class="lf-mid"><small>${e(dur(o.durationMin))}</small><i aria-hidden="true"></i><small>${o.stops === 0 ? 'Nonstop' : `${plural(o.stops, 'stop')}${via ? ` · ${e(via)}` : ''}`}</small></div>
      <div><b>${e(clock(o.arrive?.time))}${nextDay ? '<sup>+1</sup>' : ''}</b><small>${e(o.arrive?.id || fs.b.code)}</small></div>
    </div>
    <div class="lf-bottom"><div><strong>${money(o.price, cur)}</strong><small>${fs.end ? 'round trip' : 'one way'} · ${n > 1 ? `total for ${n} travelers` : 'per person'}</small></div><button class="dark-button compact" data-lf="book" data-i="${i}">Book</button></div>
    <details class="lf-details"><summary>Flight details</summary><ol>${o.legs.map((l, k) => `<li><b>${e(clock(l.from?.time))} ${e(l.from?.id || '')} → ${e(clock(l.to?.time))} ${e(l.to?.id || '')}</b><small>${[l.airline, l.flightNumber, l.airplane, dur(l.durationMin), l.legroom ? `Legroom ${l.legroom}` : '', l.overnight ? 'Overnight' : '', l.delayed ? 'Often delayed 30+ min' : ''].filter(Boolean).map(e).join(' · ')}</small>${o.layovers[k] ? `<small class="lf-layover">${e(dur(o.layovers[k].durationMin))} layover in ${e(o.layovers[k].name || o.layovers[k].id || '')}${o.layovers[k].overnight ? ' · overnight' : ''}</small>` : ''}</li>`).join('')}</ol></details>
  </article>`;
}

function flightPayload(o, fs) {
  const from = airportLabel(fs.a.code), to = airportLabel(fs.b.code), n = Number(fs.travelers) || 1;
  const stopsText = o.stops === 0 ? 'Nonstop' : `${plural(o.stops, 'stop')}${o.layovers.length ? ' via ' + o.layovers.map((l) => l.id).filter(Boolean).join(', ') : ''}`;
  const numbers = o.legs.map((l) => l.flightNumber).filter(Boolean).join(' + ');
  return {
    kind: 'flight', from, to, start: fs.start, end: fs.end || '', travelers: n, cabin: fs.cabin, oneWay: !fs.end,
    title: `${from} → ${to}`, details: `${o.airlines.join(' + ')} · ${stopsText} · ${fs.cabin}`,
    seen: { amount: o.price, currency: fs.currency || d.state.currency, source: 'Google Flights', checkedAt: fs.fetchedAt, per: n > 1 ? 'trip' : 'person', airline: o.airlines.join(' + '), stops: o.stops },
    chosen: `${numbers ? numbers + ' · ' : ''}${o.depart?.id || ''} ${clock(o.depart?.time)} → ${o.arrive?.id || ''} ${clock(o.arrive?.time)} · ${stopsText} · ${dur(o.durationMin)}`.slice(0, 290),
  };
}

function flightAction(ev, el) {
  const b = ev.target.closest('[data-lf]');
  if (!b) return;
  const fs = el._flights;
  const a = b.dataset.lf;
  if (a === 'sort') { fs.sort = b.dataset.v; renderFlights(el, fs); }
  else if (a === 'stops') { fs.stops = b.dataset.v; renderFlights(el, fs); }
  else if (a === 'book') { const o = fs.data?.options?.[Number(b.dataset.i)]; if (o) d.openRequest(flightPayload(o, fs)); }
  else if (a === 'retry') searchFlights(el, fs);
  else if (a === 'advisor' || a === 'advisor-request') {
    const from = airportLabel(fs.a.code), to = airportLabel(fs.b.code);
    d.openRequest({ kind: 'flight', from, to, start: fs.start, end: fs.end || '', travelers: Number(fs.travelers) || 1, cabin: fs.cabin, oneWay: !fs.end, title: `${from} → ${to}`, details: `${fs.cabin} · ${fs.end ? 'return' : 'one way'}` });
  }
}
