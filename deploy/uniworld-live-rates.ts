// Uniworld live travel data, from Google Flights and Google Hotels through SerpApi.
//   kind 'deal' / 'search' : the cheapest flight and hotel for a trip (home page cards)
//   kind 'hotels'          : a full hotel search with sorting, filters and paging (Stays page)
//   kind 'hotel'           : one hotel's photos, rooms and prices from booking sites
//   kind 'flights'         : every flight option for a route and date
// Results are cached in Postgres so the SerpApi plan lasts, and a monthly cap makes
// sure the plan is never exceeded. When no fresh result can be fetched, the last
// known result is returned and marked as stale.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SERPAPI = 'https://serpapi.com/search.json';
// Websites allowed to use this service. Extra ones (for example a new host for the app) can be
// added without code changes in the UNIWORLD_ALLOWED_ORIGINS secret, separated by commas.
const ALLOWED_ORIGINS = new Set([
  'https://abdeeznuts.github.io',
  'https://app.uniworldinc.com', 'https://uniworldinc.com', 'https://www.uniworldinc.com',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(Deno.env.get('UNIWORLD_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s)),
]);
const MONTHLY_CAP = num(Deno.env.get('UNIWORLD_SERPAPI_MONTHLY_CAP'), 240);
const TTL_HOURS = {
  deal: num(Deno.env.get('UNIWORLD_DEAL_TTL_HOURS'), 12),
  search: num(Deno.env.get('UNIWORLD_SEARCH_TTL_HOURS'), 6),
  list: num(Deno.env.get('UNIWORLD_LIST_TTL_HOURS'), 6),
};
const CURRENCIES: Record<string, { gl: string }> = { PKR: { gl: 'pk' }, GBP: { gl: 'uk' }, USD: { gl: 'us' } };

// Where travellers usually stay when they fly into an airport.
const STAY: Record<string, { city: string; q: string; label?: string }> = {
  JED: { city: 'Makkah', q: 'Hotels near Masjid al-Haram Makkah', label: 'Makkah · near the Haram' },
  MED: { city: 'Madinah', q: 'Hotels near Masjid an-Nabawi Madinah', label: 'Madinah · near the Prophet’s Mosque' },
  KHI: { city: 'Karachi', q: 'Hotels in Karachi' },
  LHE: { city: 'Lahore', q: 'Hotels in Lahore' },
  ISB: { city: 'Islamabad', q: 'Hotels in Islamabad' },
  PEW: { city: 'Peshawar', q: 'Hotels in Peshawar' },
  MUX: { city: 'Multan', q: 'Hotels in Multan' },
  SKT: { city: 'Sialkot', q: 'Hotels in Sialkot' },
  GIL: { city: 'Gilgit', q: 'Hotels in Gilgit' },
  DXB: { city: 'Dubai', q: 'Hotels in Dubai' },
  AUH: { city: 'Abu Dhabi', q: 'Hotels in Abu Dhabi' },
  DOH: { city: 'Doha', q: 'Hotels in Doha' },
  RUH: { city: 'Riyadh', q: 'Hotels in Riyadh' },
  IST: { city: 'Istanbul', q: 'Hotels in Istanbul' },
  SAW: { city: 'Istanbul', q: 'Hotels in Istanbul' },
  LHR: { city: 'London', q: 'Hotels in London' },
  LGW: { city: 'London', q: 'Hotels in London' },
  STN: { city: 'London', q: 'Hotels in London' },
  MAN: { city: 'Manchester', q: 'Hotels in Manchester' },
  BHX: { city: 'Birmingham', q: 'Hotels in Birmingham' },
  GLA: { city: 'Glasgow', q: 'Hotels in Glasgow' },
  JFK: { city: 'New York', q: 'Hotels in New York' },
  EWR: { city: 'New York', q: 'Hotels in New York' },
  LGA: { city: 'New York', q: 'Hotels in New York' },
  IAH: { city: 'Houston', q: 'Hotels in Houston' },
  HOU: { city: 'Houston', q: 'Hotels in Houston' },
  ORD: { city: 'Chicago', q: 'Hotels in Chicago' },
  IAD: { city: 'Washington, D.C.', q: 'Hotels in Washington DC' },
  DCA: { city: 'Washington, D.C.', q: 'Hotels in Washington DC' },
  DFW: { city: 'Dallas', q: 'Hotels in Dallas' },
  LAX: { city: 'Los Angeles', q: 'Hotels in Los Angeles' },
  SFO: { city: 'San Francisco', q: 'Hotels in San Francisco' },
  ATL: { city: 'Atlanta', q: 'Hotels in Atlanta' },
  BOS: { city: 'Boston', q: 'Hotels in Boston' },
  MIA: { city: 'Miami', q: 'Hotels in Miami' },
  MLE: { city: 'Maldives', q: 'Resorts in Maldives' },
  DPS: { city: 'Bali', q: 'Hotels in Bali' },
  JTR: { city: 'Santorini', q: 'Hotels in Santorini' },
  CDG: { city: 'Paris', q: 'Hotels in Paris' },
  KUL: { city: 'Kuala Lumpur', q: 'Hotels in Kuala Lumpur' },
  BKK: { city: 'Bangkok', q: 'Hotels in Bangkok' },
};

type Trip = {
  kind: 'deal' | 'search';
  from: string; to: string; depart: string; ret: string | null;
  adults: number; currency: string; gl: string;
  checkIn: string; checkOut: string; nights: number; hotelAdults: number;
  hotelQuery: string | null; hotelLabel: string | null;
  parts: { flight: boolean; hotel: boolean };
};

function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cors(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || origin === 'null') ? origin : 'https://abdeeznuts.github.io';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const todayUTC = () => new Date().toISOString().slice(0, 10);
function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

class Invalid extends Error {}

function currencyOf(input: Record<string, unknown>) {
  const currency = String(input.currency ?? 'USD').toUpperCase();
  if (!CURRENCIES[currency]) throw new Invalid('Choose PKR, GBP or USD.');
  return currency;
}
function intIn(v: unknown, min: number, max: number, message: string) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Invalid(message);
  return n;
}
const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[^\p{L}\p{N} .,'’&()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Paging and property tokens are opaque strings from Google; accept printable text only.
const token = (v: unknown, max: number) => (typeof v === 'string' && v.length >= 8 && v.length <= max && /^[\x21-\x7e]+$/.test(v) ? v : '');
function safeLink(v: unknown) {
  try { const u = new URL(String(v ?? '')); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

// Any airport in the world by its 3-letter code. A city with several airports can be sent as a
// list, like "LHR,LGW,STN" for all of London (Google Flights searches them together).
function airportCodes(v: unknown) {
  const list = String(v ?? '').toUpperCase().split(',').map((c) => c.trim()).filter(Boolean);
  if (!list.length || list.length > 7 || !list.every((c) => /^[A-Z]{3}$/.test(c))) return null;
  return [...new Set(list)];
}
function routeOf(input: Record<string, unknown>) {
  const from = airportCodes(input.from), to = airportCodes(input.to);
  if (!from || !to) throw new Invalid('Choose airports from the list, or type a 3-letter code like KHI or LHR.');
  if (from.some((c) => to.includes(c))) throw new Invalid('Choose two different airports.');
  return [from.join(','), to.join(',')];
}

function parseTrip(input: Record<string, unknown>): Trip {
  const kind = input.kind === 'deal' ? 'deal' : 'search';
  const [from, to] = routeOf(input);
  const currency = currencyOf(input);

  let depart: string, ret: string | null, adults: number;
  if (kind === 'deal') {
    // Fixed relative dates so everyone viewing the same route shares one cached price per day.
    depart = addDays(todayUTC(), 21);
    ret = addDays(depart, 7);
    adults = 1;
  } else {
    depart = String(input.depart ?? '');
    ret = input.return ? String(input.return) : null;
    if (!isDate(depart)) throw new Invalid('Choose a departure date.');
    // -1 allows "today" for travelers whose local date is still a day behind UTC.
    const lead = daysBetween(todayUTC(), depart);
    if (lead < -1 || lead > 330) throw new Invalid('Choose a departure date within the next 11 months.');
    if (ret !== null) {
      if (!isDate(ret)) throw new Invalid('Choose a valid return date.');
      const len = daysBetween(depart, ret);
      if (len < 0 || len > 60) throw new Invalid('Choose a return date within 60 days of departure.');
    }
    adults = Number(input.adults ?? 1);
    if (!Number.isInteger(adults) || adults < 1 || adults > 9) throw new Invalid('Choose between 1 and 9 travelers.');
  }

  const nights = ret ? Math.min(Math.max(daysBetween(depart, ret), 1), 30) : 3;
  const stay = STAY[to.split(',')[0]];
  const cityHint = String(input.city ?? '').replace(/[^\p{L}\p{N} .,'’-]/gu, '').trim().slice(0, 60);
  const hotelQuery = stay?.q ?? (cityHint ? `Hotels in ${cityHint}` : null);
  const parts = Array.isArray(input.parts) ? input.parts.map(String)
    : typeof input.parts === 'string' ? input.parts.split(',') : ['flight', 'hotel'];
  return {
    kind, from, to, depart, ret, adults, currency, gl: CURRENCIES[currency].gl,
    checkIn: depart, checkOut: addDays(depart, nights), nights,
    hotelAdults: kind === 'deal' ? 2 : Math.min(Math.max(adults, 1), 4),
    hotelQuery, hotelLabel: stay?.label ?? stay?.city ?? (cityHint || null),
    parts: { flight: parts.includes('flight'), hotel: parts.includes('hotel') && !!hotelQuery },
  };
}

function fallbackLinks(t: Trip) {
  const q = `Flights from ${t.from} to ${t.to} on ${t.depart}${t.ret ? ` through ${t.ret}` : ' one way'}`;
  return {
    flights: `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${t.currency}&hl=en&gl=${t.gl}`,
    hotels: t.hotelQuery ? `https://www.google.com/travel/search?q=${encodeURIComponent(t.hotelQuery)}&hl=en&gl=${t.gl}&curr=${t.currency}` : null,
  };
}

const flightKey = (t: Trip) => `f|${t.from}|${t.to}|${t.depart}|${t.ret ?? '-'}|${t.adults}|${t.currency}`;
const hotelKey = (t: Trip) => `h|${t.hotelQuery}|${t.checkIn}|${t.checkOut}|${t.hotelAdults}|${t.currency}`;

async function serp(params: Record<string, string>, key: string) {
  const url = new URL(SERPAPI);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(28000) });
  let json: any = null;
  try { json = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !json || json.error) {
    const msg = String(json?.error ?? `HTTP ${res.status}`);
    // "hasn't returned any results" is an empty search, not a failure.
    if (/hasn't returned any results|no results/i.test(msg)) return { __empty: true };
    throw new Error(msg);
  }
  return json;
}

// Keep a price-history chart light: at most `max` evenly spaced points, always including the latest.
function thin(points: number[][], max: number) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

function shortAirport(a: any) {
  return a ? { id: a.id ?? null, name: a.name ?? null, time: a.time ?? null } : null;
}

function insightsOf(json: any) {
  const pi = json.price_insights ?? null;
  if (!pi) return null;
  const history = Array.isArray(pi.price_history)
    ? pi.price_history.filter((p: any) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && p[1] > 0)
    : [];
  return {
    lowest: typeof pi.lowest_price === 'number' ? pi.lowest_price : null,
    level: typeof pi.price_level === 'string' ? pi.price_level : null,
    typical: Array.isArray(pi.typical_price_range) ? pi.typical_price_range : null,
    history: history.length >= 3 ? thin(history, 40) : null,
  };
}

const validOption = (o: any) => typeof o?.price === 'number' && o.price > 0 && Array.isArray(o.flights) && o.flights.length;

function cheapestFlight(json: any, t: Trip) {
  const options = [...(json.best_flights ?? []), ...(json.other_flights ?? [])].filter(validOption);
  if (!options.length) return null;
  options.sort((a: any, b: any) => a.price - b.price);
  const o = options[0];
  const legs = o.flights;
  const first = legs[0], last = legs[legs.length - 1];
  const airlines = [...new Set(legs.map((l: any) => l.airline).filter(Boolean))];
  const airports = json.airports?.[0] ?? {};
  return {
    price: o.price,
    airline: airlines.join(' + ') || 'Multiple airlines',
    airlineLogo: o.airline_logo ?? first.airline_logo ?? null,
    stops: legs.length - 1,
    durationMin: o.total_duration ?? null,
    depart: shortAirport(first.departure_airport),
    arrive: shortAirport(last.arrival_airport),
    fromCity: airports.departure?.[0]?.city ?? null,
    toCity: airports.arrival?.[0]?.city ?? null,
    flightNumbers: legs.map((l: any) => l.flight_number).filter(Boolean),
    layovers: (o.layovers ?? []).map((l: any) => ({ id: l.id ?? null, name: l.name ?? null, durationMin: l.duration ?? null, overnight: !!l.overnight })),
    tripType: t.ret ? 'Round trip' : 'One way',
    travelers: t.adults,
    compared: options.length,
    insights: insightsOf(json),
    // SerpApi's Google Flights URL reopens this exact search when it carries the encoded query (tfs).
    link: /[?&]tfs=/.test(json.search_metadata?.google_flights_url ?? '') ? json.search_metadata.google_flights_url : fallbackLinks(t).flights,
    dates: { depart: t.depart, return: t.ret },
  };
}

// Google image thumbnails carry their size in the URL; ask for a sharper one for phone cards.
function sharper(url: string | null | undefined, size = 'w900-h600') {
  if (!url) return null;
  const m = url.match(/=([^=/?#]*)$/);
  return /googleusercontent\.com/.test(url) && m && /(^|-)w\d+/.test(m[1]) && /(^|-)h\d+/.test(m[1])
    ? url.slice(0, m.index) + `=${size}-k-no`
    : url;
}
const entityLink = (tok: string | null, gl: string, currency: string) =>
  tok ? `https://www.google.com/travel/hotels/entity/${encodeURIComponent(tok)}?hl=en&gl=${gl}&curr=${currency}` : null;

function hotelCard(p: any, t: Trip) {
  const tok = p.property_token ?? null;
  const thumb = p.images?.[0]?.thumbnail ?? null;
  return {
    name: p.name,
    pricePerNight: p.rate_per_night.extracted_lowest,
    total: p.total_rate?.extracted_lowest ?? null,
    rating: typeof p.overall_rating === 'number' ? p.overall_rating : null,
    reviews: typeof p.reviews === 'number' ? p.reviews : null,
    stars: typeof p.extracted_hotel_class === 'number' ? p.extracted_hotel_class : null,
    image: sharper(thumb) ?? p.images?.[0]?.original_image ?? null,
    thumb,
    source: p.prices?.[0]?.source ?? null,
    amenities: (p.amenities ?? []).slice(0, 4),
    token: tok,
    link: entityLink(tok, t.gl, t.currency) ?? (p.link ?? null),
  };
}

function cheapestHotels(json: any, t: Trip) {
  const all = (json.properties ?? []).filter((p: any) => typeof p?.rate_per_night?.extracted_lowest === 'number' && p.rate_per_night.extracted_lowest > 0 && p.name);
  const hotels = all.filter((p: any) => !p.type || p.type === 'hotel');
  const pool = (hotels.length ? hotels : all).sort((a: any, b: any) => a.rate_per_night.extracted_lowest - b.rate_per_night.extracted_lowest);
  if (!pool.length) return null;
  const cheapest = pool[0];
  const wellRated = pool.find((p: any) => (p.overall_rating ?? 0) >= 4);
  return {
    cheapest: hotelCard(cheapest, t),
    wellRated: wellRated && wellRated !== cheapest ? hotelCard(wellRated, t) : null,
    compared: pool.length,
    city: t.hotelLabel,
    query: t.hotelQuery,
    checkIn: t.checkIn,
    checkOut: t.checkOut,
    nights: t.nights,
    guests: t.hotelAdults,
    // SerpApi's google_hotels_url is an internal Google endpoint, so link to the public hotel search instead.
    link: fallbackLinks(t).hotels,
  };
}

// ---------- Hotel search (Stays page) ----------
const HOTEL_SORTS: Record<string, string> = { price: '3', rating: '8', reviews: '13' };

function stayDates(input: Record<string, unknown>) {
  const checkIn = String(input.checkIn ?? ''), checkOut = String(input.checkOut ?? '');
  if (!isDate(checkIn) || !isDate(checkOut)) throw new Invalid('Choose your check-in and check-out dates.');
  const lead = daysBetween(todayUTC(), checkIn);
  if (lead < -1 || lead > 330) throw new Invalid('Choose a check-in date within the next 11 months.');
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 1 || nights > 30) throw new Invalid('Choose a stay between 1 and 30 nights.');
  return { checkIn, checkOut, nights };
}

function parseHotelSearch(input: Record<string, unknown>) {
  const q = cleanText(input.q, 80);
  if (q.length < 2) throw new Invalid('Tell us where you’d like to stay.');
  const dates = stayDates(input);
  const adults = intIn(input.adults ?? 2, 1, 12, 'Choose between 1 and 12 guests.');
  const currency = currencyOf(input);
  const sort = HOTEL_SORTS[String(input.sort ?? '')] ? String(input.sort) : '';
  const price = (v: unknown) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e8) throw new Invalid('Check the price range.');
    return Math.round(n);
  };
  const minPrice = price(input.minPrice), maxPrice = price(input.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Invalid('The lowest price is above the highest price.');
  const stars = Array.isArray(input.stars) ? [...new Set(input.stars.map(Number).filter((n) => [2, 3, 4, 5].includes(n)))].sort() : [];
  const rating = ['7', '8', '9'].includes(String(input.rating ?? '')) ? String(input.rating) : '';
  const freeCancellation = input.freeCancellation === true || input.freeCancellation === 'true';
  const page = token(input.page, 1000);
  return { q, ...dates, adults, currency, gl: CURRENCIES[currency].gl, sort, minPrice, maxPrice, stars, rating, freeCancellation, page };
}
type HotelSearch = ReturnType<typeof parseHotelSearch>;

function nearbyOf(n: any) {
  const t = Array.isArray(n?.transportations) ? n.transportations[0] : null;
  return { name: n?.name ?? null, category: n?.category ?? null, how: t?.duration ? `${t.duration}${t.type ? ' · ' + String(t.type).toLowerCase() : ''}` : null };
}
function imagesOf(list: any, max: number) {
  return (Array.isArray(list) ? list : []).slice(0, max)
    .map((i: any) => ({ thumb: i?.thumbnail ?? null, large: sharper(i?.thumbnail) ?? i?.original_image ?? null }))
    .filter((i: any) => i.thumb || i.large);
}

function listHotel(p: any, s: { gl: string; currency: string }) {
  const tok = p.property_token ?? null;
  const night = p.rate_per_night?.extracted_lowest;
  return {
    token: tok,
    name: p.name,
    type: p.type === 'vacation rental' ? 'vacation rental' : 'hotel',
    description: typeof p.description === 'string' ? p.description.slice(0, 300) : null,
    images: imagesOf(p.images, 8),
    rating: typeof p.overall_rating === 'number' ? p.overall_rating : null,
    reviews: typeof p.reviews === 'number' ? p.reviews : null,
    locationRating: typeof p.location_rating === 'number' ? p.location_rating : null,
    stars: typeof p.extracted_hotel_class === 'number' ? p.extracted_hotel_class : null,
    pricePerNight: typeof night === 'number' && night > 0 ? night : null,
    priceBeforeTaxes: typeof p.rate_per_night?.extracted_before_taxes_fees === 'number' ? p.rate_per_night.extracted_before_taxes_fees : null,
    total: typeof p.total_rate?.extracted_lowest === 'number' ? p.total_rate.extracted_lowest : null,
    deal: typeof p.deal === 'string' ? p.deal.slice(0, 60) : null,
    dealDescription: typeof p.deal_description === 'string' ? p.deal_description.slice(0, 80) : null,
    amenities: (Array.isArray(p.amenities) ? p.amenities : []).slice(0, 14),
    nearby: (Array.isArray(p.nearby_places) ? p.nearby_places : []).slice(0, 3).map(nearbyOf).filter((n: any) => n.name),
    checkInTime: p.check_in_time ?? null,
    checkOutTime: p.check_out_time ?? null,
    gps: p.gps_coordinates ?? null,
    source: p.prices?.[0]?.source ?? null,
    essentialInfo: (Array.isArray(p.essential_info) ? p.essential_info : []).slice(0, 4),
    link: entityLink(tok, s.gl, s.currency) ?? safeLink(p.link),
  };
}

function hotelList(json: any, s: HotelSearch) {
  if (json?.__empty) return null;
  // A search that names one hotel returns that hotel's details instead of a list.
  const raw = Array.isArray(json.properties) ? json.properties : json.name ? [json] : [];
  const items = raw.filter((p: any) => p?.name).map((p: any) => listHotel(p, s));
  const hotels = items.filter((h: any) => h.pricePerNight);
  if (!hotels.length) return null;
  return {
    hotels,
    unavailable: items.length - hotels.length,
    next: token(json.serpapi_pagination?.next_page_token, 1000) || null,
    from: json.serpapi_pagination?.current_from ?? 1,
    to: json.serpapi_pagination?.current_to ?? hotels.length,
    link: `https://www.google.com/travel/search?q=${encodeURIComponent(s.q)}&hl=en&gl=${s.gl}&curr=${s.currency}`,
  };
}

// ---------- One hotel (details, rooms, prices from booking sites) ----------
function parseHotelDetail(input: Record<string, unknown>) {
  const tok = token(input.token, 600);
  if (!tok) throw new Invalid('Choose a hotel first.');
  const dates = stayDates(input);
  const adults = intIn(input.adults ?? 2, 1, 12, 'Choose between 1 and 12 guests.');
  const currency = currencyOf(input);
  return { token: tok, ...dates, adults, currency, gl: CURRENCIES[currency].gl };
}
type HotelDetail = ReturnType<typeof parseHotelDetail>;

function priceRow(x: any) {
  const night = x?.rate_per_night?.extracted_lowest, total = x?.total_rate?.extracted_lowest;
  return {
    source: typeof x?.source === 'string' ? x.source.slice(0, 60) : null,
    logo: safeLink(x?.logo),
    official: !!x?.official,
    pricePerNight: typeof night === 'number' && night > 0 ? night : null,
    total: typeof total === 'number' && total > 0 ? total : null,
    freeCancellation: !!x?.free_cancellation,
    freeCancellationUntil: typeof x?.free_cancellation_until_date === 'string' ? x.free_cancellation_until_date.slice(0, 30) : null,
    originalPerNight: typeof x?.original_rate_per_night?.extracted_lowest === 'number' ? x.original_rate_per_night.extracted_lowest : null,
  };
}

function hotelDetail(json: any, d: HotelDetail) {
  if (json?.__empty || !json?.name) return null;
  const bySource = new Map<string, any>();
  for (const x of [...(json.featured_prices ?? []), ...(json.prices ?? [])]) {
    const r = priceRow(x);
    if (r.source && r.pricePerNight && !bySource.has(r.source)) bySource.set(r.source, r);
  }
  const rooms = (Array.isArray(json.featured_prices) ? json.featured_prices : []).flatMap((fp: any) =>
    (Array.isArray(fp?.rooms) ? fp.rooms : []).map((room: any) => ({
      source: typeof fp.source === 'string' ? fp.source.slice(0, 60) : null,
      name: typeof room?.name === 'string' ? room.name.slice(0, 90) : null,
      guests: Number.isInteger(room?.num_guests) ? room.num_guests : null,
      pricePerNight: typeof room?.rate_per_night?.extracted_lowest === 'number' ? room.rate_per_night.extracted_lowest : null,
      total: typeof room?.total_rate?.extracted_lowest === 'number' ? room.total_rate.extracted_lowest : null,
      image: sharper(Array.isArray(room?.images) ? room.images[0] : null, 'w600-h400'),
      breakfast: Array.isArray(room?.rates) && room.rates.some((r: any) => r?.breakfast_included),
    }))).filter((r: any) => r.name && r.pricePerNight).slice(0, 10);
  const night = json.rate_per_night?.extracted_lowest;
  const tp = json.typical_price_range;
  return {
    token: json.property_token ?? d.token,
    name: json.name,
    type: json.type === 'vacation rental' ? 'vacation rental' : 'hotel',
    description: typeof json.description === 'string' ? json.description.slice(0, 1200) : null,
    address: typeof json.address === 'string' ? json.address.slice(0, 200) : null,
    phone: typeof json.phone === 'string' ? json.phone.slice(0, 40) : null,
    gps: json.gps_coordinates ?? null,
    checkInTime: json.check_in_time ?? null,
    checkOutTime: json.check_out_time ?? null,
    stars: typeof json.extracted_hotel_class === 'number' ? json.extracted_hotel_class : null,
    rating: typeof json.overall_rating === 'number' ? json.overall_rating : null,
    reviews: typeof json.reviews === 'number' ? json.reviews : null,
    locationRating: typeof json.location_rating === 'number' ? json.location_rating : null,
    ratings: (Array.isArray(json.ratings) ? json.ratings : []).filter((r: any) => typeof r?.stars === 'number').map((r: any) => ({ stars: r.stars, count: r.count ?? 0 })),
    highlights: (Array.isArray(json.reviews_breakdown) ? json.reviews_breakdown : []).slice(0, 6).map((b: any) => ({ name: String(b?.name ?? '').slice(0, 40), positive: b?.positive ?? 0, negative: b?.negative ?? 0, mentioned: b?.total_mentioned ?? 0 })).filter((b: any) => b.name),
    pricePerNight: typeof night === 'number' && night > 0 ? night : null,
    total: typeof json.total_rate?.extracted_lowest === 'number' ? json.total_rate.extracted_lowest : null,
    typical: tp && typeof tp.extracted_lowest === 'number' && typeof tp.extracted_highest === 'number' ? [tp.extracted_lowest, tp.extracted_highest] : null,
    prices: [...bySource.values()].sort((a, b) => a.pricePerNight - b.pricePerNight).slice(0, 12),
    rooms,
    images: imagesOf(json.images, 24),
    amenities: (Array.isArray(json.amenities) ? json.amenities : []).slice(0, 40),
    nearby: (Array.isArray(json.nearby_places) ? json.nearby_places : []).slice(0, 8).map(nearbyOf).filter((n: any) => n.name),
    link: entityLink(json.property_token ?? d.token, d.gl, d.currency),
  };
}

// ---------- Flight list ----------
const CABINS: Record<string, string> = { economy: '1', 'premium economy': '2', business: '3', 'first class': '4', first: '4' };

function parseFlights(input: Record<string, unknown>) {
  const [from, to] = routeOf(input);
  const depart = String(input.depart ?? '');
  if (!isDate(depart)) throw new Invalid('Choose a departure date.');
  const lead = daysBetween(todayUTC(), depart);
  if (lead < -1 || lead > 330) throw new Invalid('Choose a departure date within the next 11 months.');
  const ret = input.return ? String(input.return) : null;
  if (ret !== null) {
    if (!isDate(ret)) throw new Invalid('Choose a valid return date.');
    const len = daysBetween(depart, ret);
    if (len < 0 || len > 60) throw new Invalid('Choose a return date within 60 days of departure.');
  }
  const adults = intIn(input.adults ?? 1, 1, 9, 'Choose between 1 and 9 travelers.');
  const cabin = CABINS[String(input.cabin ?? 'economy').toLowerCase()] ?? '1';
  const currency = currencyOf(input);
  return { from, to, depart, ret, adults, cabin, currency, gl: CURRENCIES[currency].gl };
}
type FlightSearch = ReturnType<typeof parseFlights>;

function flightOption(o: any, best: boolean) {
  const legs = o.flights;
  const first = legs[0], last = legs[legs.length - 1];
  return {
    price: o.price,
    best,
    airlines: [...new Set(legs.map((l: any) => l.airline).filter(Boolean))],
    logo: safeLink(o.airline_logo ?? first.airline_logo),
    stops: legs.length - 1,
    durationMin: typeof o.total_duration === 'number' ? o.total_duration : null,
    depart: shortAirport(first.departure_airport),
    arrive: shortAirport(last.arrival_airport),
    legs: legs.map((l: any) => ({
      from: shortAirport(l.departure_airport), to: shortAirport(l.arrival_airport),
      airline: l.airline ?? null, flightNumber: l.flight_number ?? null, airplane: l.airplane ?? null,
      durationMin: typeof l.duration === 'number' ? l.duration : null, legroom: l.legroom ?? null,
      overnight: !!l.overnight, delayed: !!l.often_delayed_by_over_30_min,
    })),
    layovers: (Array.isArray(o.layovers) ? o.layovers : []).map((l: any) => ({ id: l.id ?? null, name: l.name ?? null, durationMin: l.duration ?? null, overnight: !!l.overnight })),
    emissionsDiff: typeof o.carbon_emissions?.difference_percent === 'number' ? o.carbon_emissions.difference_percent : null,
  };
}

function flightList(json: any, f: FlightSearch) {
  if (json?.__empty) return null;
  const best = (json.best_flights ?? []).filter(validOption).map((o: any) => flightOption(o, true));
  const other = (json.other_flights ?? []).filter(validOption).map((o: any) => flightOption(o, false));
  const options = [...best, ...other].slice(0, 40);
  if (!options.length) return null;
  const airports = json.airports?.[0] ?? {};
  const q = `Flights from ${f.from} to ${f.to} on ${f.depart}${f.ret ? ` through ${f.ret}` : ' one way'}`;
  return {
    options,
    insights: insightsOf(json),
    fromCity: airports.departure?.[0]?.city ?? null,
    toCity: airports.arrival?.[0]?.city ?? null,
    link: /[?&]tfs=/.test(json.search_metadata?.google_flights_url ?? '') ? json.search_metadata.google_flights_url
      : `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${f.currency}&hl=en&gl=${f.gl}`,
  };
}

// ---------- Instant hotels (liteAPI): bookable rooms the app can book and charge itself ----------
// Off until the LITEAPI_KEY secret exists. Prices include the markup set in the liteAPI dashboard.
const LITEAPI = 'https://api.liteapi.travel/v3.0';
const NATIONALITY: Record<string, string> = { PKR: 'PK', GBP: 'GB', USD: 'US' };
const firstAmount = (list: any) => (Array.isArray(list) && typeof list[0]?.amount === 'number' ? list[0].amount : null);
function parseInstantHotels(input: Record<string, unknown>) {
  const dates = stayDates(input);
  const adults = intIn(input.adults ?? 2, 1, 8, 'Choose between 1 and 8 guests per room.');
  const currency = currencyOf(input);
  const lat = Number(input.lat), lng = Number(input.lng);
  const near = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const city = cleanText(input.city, 60), countryCode = String(input.countryCode ?? '').toUpperCase();
  if (!near && (city.length < 2 || !/^[A-Z]{2}$/.test(countryCode))) throw new Invalid('Choose a city from the list.');
  const radius = Math.min(Math.max(Number(input.radius) || 2000, 300), 30000);
  const stars = Array.isArray(input.stars) ? [...new Set(input.stars.map(Number).filter((n) => [1, 2, 3, 4, 5].includes(n)))] : [];
  return { ...dates, adults, currency, near, lat, lng, radius, city, countryCode, stars };
}
function instantHotel(rate: any, info: any, nights: number) {
  const offers = (Array.isArray(rate.roomTypes) ? rate.roomTypes : []).map((rt: any) => {
    const r0 = Array.isArray(rt.rates) ? rt.rates[0] : null;
    const total = firstAmount(rt.offerRetailRate) ?? firstAmount(r0?.retailRate?.total);
    const cancel = r0?.cancellationPolicies;
    return {
      offerId: typeof rt.offerId === 'string' ? rt.offerId : null,
      name: String(rt.name || r0?.name || 'Room').slice(0, 90),
      board: r0?.boardName ? String(r0.boardName).slice(0, 40) : null,
      total, currency: rt.offerRetailRate?.[0]?.currency ?? r0?.retailRate?.total?.[0]?.currency ?? null,
      refundable: cancel?.refundableTag === 'RFN',
      freeCancelUntil: cancel?.refundableTag === 'RFN' && cancel?.cancelPolicyInfos?.[0]?.cancelTime ? String(cancel.cancelPolicyInfos[0].cancelTime).slice(0, 25) : null,
      maxOccupancy: Number.isInteger(r0?.maxOccupancy) ? r0.maxOccupancy : null,
    };
  }).filter((o: any) => o.offerId && typeof o.total === 'number' && o.total > 0).sort((a: any, b: any) => a.total - b.total);
  if (!offers.length) return null;
  const rating = typeof info?.rating === 'number' ? (info.rating > 5 ? info.rating / 2 : info.rating) : null;
  const photo = info?.main_photo || info?.thumbnail || null;
  return {
    token: 'lite:' + rate.hotelId, hotelId: String(rate.hotelId), instant: true,
    name: String(info?.name || 'Hotel').slice(0, 150), type: 'hotel',
    images: photo ? [{ thumb: info?.thumbnail || photo, large: photo }] : [],
    rating: rating ? Math.round(rating * 10) / 10 : null,
    reviews: Number.isInteger(info?.review_count) ? info.review_count : Number.isInteger(info?.reviewCount) ? info.reviewCount : null,
    stars: typeof info?.stars === 'number' && info.stars > 0 ? Math.round(info.stars) : null,
    address: typeof info?.address === 'string' ? info.address.slice(0, 160) : null,
    gps: typeof info?.latitude === 'number' ? { latitude: info.latitude, longitude: info.longitude } : null,
    total: offers[0].total, pricePerNight: Math.round(offers[0].total / Math.max(nights, 1)),
    offers: offers.slice(0, 6), amenities: [], nearby: [], essentialInfo: [],
  };
}
async function instantHotels(input: Record<string, unknown>, origin: string | null) {
  const key = Deno.env.get('LITEAPI_KEY') ?? '';
  if (!key) return reply({ ok: false, kind: 'instant-hotels', notice: 'off', data: null }, 200, origin);
  let s;
  try { s = parseInstantHotels(input); } catch (e) {
    return reply({ ok: false, reason: 'invalid', message: e instanceof Invalid ? e.message : 'Invalid request.' }, 400, origin);
  }
  const body: Record<string, unknown> = {
    checkin: s.checkIn, checkout: s.checkOut, currency: s.currency, guestNationality: NATIONALITY[s.currency] || 'US',
    occupancies: [{ adults: s.adults }], limit: 40, timeout: 12, maxRatesPerHotel: 6,
    ...(s.near ? { latitude: s.lat, longitude: s.lng, radius: s.radius } : { cityName: s.city, countryCode: s.countryCode }),
    ...(s.stars.length ? { starRating: s.stars } : {}),
  };
  try {
    const res = await fetch(`${LITEAPI}/hotels/rates`, { method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) {
      console.error('liteapi rates', res.status, JSON.stringify(json?.error ?? json ?? '').slice(0, 200));
      return reply({ ok: false, kind: 'instant-hotels', notice: res.status === 401 || res.status === 403 ? 'setup' : 'unavailable', data: null }, 200, origin);
    }
    const info = new Map((Array.isArray(json.hotels) ? json.hotels : []).map((h: any) => [String(h.id), h]));
    const hotels = (Array.isArray(json.data) ? json.data : []).map((r: any) => instantHotel(r, info.get(String(r.hotelId)), s.nights)).filter(Boolean);
    return reply({ ok: hotels.length > 0, kind: 'instant-hotels', currency: s.currency, sandbox: !!json.sandbox, search: { checkIn: s.checkIn, checkOut: s.checkOut, nights: s.nights, adults: s.adults }, data: hotels.length ? { hotels } : null, notice: hotels.length ? null : 'empty', fetchedAt: new Date().toISOString() }, 200, origin);
  } catch (e) {
    console.error('liteapi rates', String((e as Error)?.message ?? e).slice(0, 200));
    return reply({ ok: false, kind: 'instant-hotels', notice: 'unavailable', data: null }, 200, origin);
  }
}

// ---------- Shared cache + monthly cap for one SerpApi search ----------
async function cachedSearch(db: any, apiKey: string, key: string, ttlHours: number, run: () => Promise<any>) {
  const { data: row } = await db.from('uniworld_rate_cache').select('payload,fetched_at,expires_at').eq('key', key).maybeSingle();
  if (row && Date.parse(row.expires_at) > Date.now()) return { payload: row.payload?.none ? null : row.payload, fetchedAt: row.fetched_at, stale: false, notice: row.payload?.none ? 'empty' : null };
  const stale = row && !row.payload?.none ? { payload: row.payload, fetchedAt: row.fetched_at, stale: true } : null;
  if (!apiKey) return { ...(stale ?? { payload: null, fetchedAt: null, stale: false }), notice: 'setup' };
  const { data: allowed, error } = await db.rpc('uniworld_take_serpapi_calls', { n: 1, cap: MONTHLY_CAP });
  if (error || !allowed) return { ...(stale ?? { payload: null, fetchedAt: null, stale: false }), notice: 'limit' };
  try {
    const payload = await run();
    const fetchedAt = new Date().toISOString();
    const life = (payload ? ttlHours : Math.min(ttlHours, 3)) * 3600 * 1000;
    await db.from('uniworld_rate_cache').upsert({ key, payload: payload ?? { none: true }, fetched_at: fetchedAt, expires_at: new Date(Date.now() + life).toISOString() });
    return { payload, fetchedAt, stale: false, notice: payload ? null : 'empty' };
  } catch (e) {
    console.error('serpapi', key.slice(0, 40), String((e as Error)?.message ?? e).slice(0, 200));
    return { ...(stale ?? { payload: null, fetchedAt: null, stale: false }), notice: stale ? 'partial' : 'unavailable' };
  }
}

async function listingReply(kind: string, input: Record<string, unknown>, db: any, apiKey: string, origin: string | null) {
  try {
    if (kind === 'hotels') {
      const s = parseHotelSearch(input);
      const key = 'hl|' + JSON.stringify([s.q.toLowerCase(), s.checkIn, s.checkOut, s.adults, s.currency, s.sort, s.minPrice, s.maxPrice, s.stars, s.rating, s.freeCancellation, s.page]);
      const r = await cachedSearch(db, apiKey, key, TTL_HOURS.list, async () => {
        const params: Record<string, string> = { engine: 'google_hotels', q: s.q, check_in_date: s.checkIn, check_out_date: s.checkOut, adults: String(s.adults), currency: s.currency, gl: s.gl, hl: 'en' };
        if (s.sort) params.sort_by = HOTEL_SORTS[s.sort];
        if (s.minPrice !== null) params.min_price = String(s.minPrice);
        if (s.maxPrice !== null) params.max_price = String(s.maxPrice);
        if (s.stars.length) params.hotel_class = s.stars.join(',');
        if (s.rating) params.rating = s.rating;
        if (s.freeCancellation) params.free_cancellation = 'true';
        if (s.page) params.next_page_token = s.page;
        return hotelList(await serp(params, apiKey), s);
      });
      return reply({ ok: !!r.payload, kind, currency: s.currency, search: { q: s.q, checkIn: s.checkIn, checkOut: s.checkOut, nights: s.nights, adults: s.adults, sort: s.sort }, data: r.payload, fetchedAt: r.fetchedAt, stale: r.stale, notice: r.notice, setup: !apiKey }, 200, origin);
    }
    if (kind === 'hotel') {
      const d = parseHotelDetail(input);
      const key = 'hd|' + JSON.stringify([d.token, d.checkIn, d.checkOut, d.adults, d.currency]);
      const r = await cachedSearch(db, apiKey, key, TTL_HOURS.list, async () => hotelDetail(await serp({ engine: 'google_hotels', property_token: d.token, check_in_date: d.checkIn, check_out_date: d.checkOut, adults: String(d.adults), currency: d.currency, gl: d.gl, hl: 'en' }, apiKey), d));
      return reply({ ok: !!r.payload, kind, currency: d.currency, search: { checkIn: d.checkIn, checkOut: d.checkOut, nights: d.nights, adults: d.adults }, data: r.payload, fetchedAt: r.fetchedAt, stale: r.stale, notice: r.notice, setup: !apiKey }, 200, origin);
    }
    const f = parseFlights(input);
    const key = 'fl|' + JSON.stringify([f.from, f.to, f.depart, f.ret, f.adults, f.cabin, f.currency]);
    const r = await cachedSearch(db, apiKey, key, TTL_HOURS.list, async () => flightList(await serp({
      engine: 'google_flights', departure_id: f.from, arrival_id: f.to, outbound_date: f.depart,
      ...(f.ret ? { return_date: f.ret, type: '1' } : { type: '2' }),
      adults: String(f.adults), travel_class: f.cabin, currency: f.currency, gl: f.gl, hl: 'en',
    }, apiKey), f));
    return reply({ ok: !!r.payload, kind, currency: f.currency, search: { from: f.from, to: f.to, depart: f.depart, return: f.ret, adults: f.adults, cabin: f.cabin }, data: r.payload, fetchedAt: r.fetchedAt, stale: r.stale, notice: r.notice, setup: !apiKey }, 200, origin);
  } catch (e) {
    if (e instanceof Invalid) return reply({ ok: false, reason: 'invalid', message: e.message }, 400, origin);
    console.error('listing', kind, String((e as Error)?.message ?? e).slice(0, 200));
    return reply({ ok: false, kind, notice: 'unavailable', data: null }, 200, origin);
  }
}

// Lets a deploy be checked against the source it came from.
const BUILD = '2026-10-24.2';
async function sourceHash() {
  try {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await Deno.readFile(new URL(import.meta.url))));
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  // Browsers always send Origin on cross-site requests; "null" covers privacy-sandboxed contexts.
  if (origin && origin !== 'null' && !ALLOWED_ORIGINS.has(origin)) return reply({ ok: false, reason: 'forbidden', message: 'This price service is for the Uniworld app.' }, 403, origin);

  const apiKey = Deno.env.get('SERPAPI_KEY') ?? Deno.env.get('SERPAPI_API_KEY') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let input: Record<string, unknown> = {};
  try {
    if (req.method === 'POST') input = await req.json();
    else input = Object.fromEntries(new URL(req.url).searchParams);
  } catch {
    return reply({ ok: false, reason: 'invalid', message: 'Invalid request.' }, 400, origin);
  }

  if (input.ping) {
    const month = new Date().toISOString().slice(0, 7);
    const { data } = await db.from('uniworld_serpapi_usage').select('calls').eq('month', month).maybeSingle();
    return reply({ ok: true, build: BUILD, source: await sourceHash(), configured: !!apiKey, instant: { hotels: !!Deno.env.get('LITEAPI_KEY') }, usage: { month, calls: data?.calls ?? 0, cap: MONTHLY_CAP }, ttlHours: TTL_HOURS }, 200, origin);
  }

  if (input.kind === 'instant-hotels') return instantHotels(input, origin);
  if (input.kind === 'hotels' || input.kind === 'hotel' || input.kind === 'flights') return listingReply(String(input.kind), input, db, apiKey, origin);

  let t: Trip;
  try { t = parseTrip(input); } catch (e) {
    return reply({ ok: false, reason: 'invalid', message: e instanceof Invalid ? e.message : 'Invalid request.' }, 400, origin);
  }

  const links = fallbackLinks(t);
  const tripOut = { from: t.from, to: t.to, depart: t.depart, return: t.ret, adults: t.adults, currency: t.currency, checkIn: t.checkIn, checkOut: t.checkOut, nights: t.nights, hotelCity: t.hotelLabel, hotelQuery: t.hotelQuery };
  const keys = { flight: t.parts.flight ? flightKey(t) : null, hotel: t.parts.hotel ? hotelKey(t) : null };
  const wanted = [keys.flight, keys.hotel].filter(Boolean) as string[];

  const { data: rows } = await db.from('uniworld_rate_cache').select('key,payload,fetched_at,expires_at').in('key', wanted.length ? wanted : ['-']);
  const cached = new Map((rows ?? []).map((r: any) => [r.key, r]));
  const now = Date.now();
  const fresh = (k: string | null) => { const r = k ? cached.get(k) : null; return r && Date.parse(r.expires_at) > now ? r : null; };

  const result: any = { ok: true, currency: t.currency, trip: tripOut, links, flight: null, hotel: null, empty: [], notice: null, setup: !apiKey };
  // A cached payload of {none:true} means the last search found nothing for this trip.
  const apply = (part: 'flight' | 'hotel', payload: any, fetchedAt: string, stale: boolean) => {
    if (payload?.none) { result[part] = null; if (!result.empty.includes(part)) result.empty.push(part); }
    else result[part] = { ...payload, fetchedAt, stale };
  };
  const needs: Array<'flight' | 'hotel'> = [];
  for (const part of ['flight', 'hotel'] as const) {
    const k = keys[part];
    if (!k) continue;
    const r = fresh(k);
    if (r) apply(part, r.payload, r.fetched_at, false);
    else needs.push(part);
  }

  const useStale = (part: 'flight' | 'hotel') => {
    const r = keys[part] ? cached.get(keys[part]!) : null;
    if (r && !r.payload?.none) apply(part, r.payload, r.fetched_at, true);
  };

  if (needs.length && !apiKey) {
    needs.forEach(useStale);
    result.notice = 'setup';
  } else if (needs.length) {
    const { data: allowed, error } = await db.rpc('uniworld_take_serpapi_calls', { n: needs.length, cap: MONTHLY_CAP });
    if (error || !allowed) {
      needs.forEach(useStale);
      result.notice = 'limit';
    } else {
      const ttl = TTL_HOURS[t.kind] * 3600 * 1000;
      const jobs = needs.map(async (part) => {
        try {
          let payload: any = null;
          if (part === 'flight') {
            const json = await serp({
              engine: 'google_flights', departure_id: t.from, arrival_id: t.to, outbound_date: t.depart,
              ...(t.ret ? { return_date: t.ret, type: '1' } : { type: '2' }),
              adults: String(t.adults), currency: t.currency, gl: t.gl, hl: 'en', sort_by: '2',
            }, apiKey);
            payload = json.__empty ? null : cheapestFlight(json, t);
          } else {
            const json = await serp({
              engine: 'google_hotels', q: t.hotelQuery!, check_in_date: t.checkIn, check_out_date: t.checkOut,
              adults: String(t.hotelAdults), currency: t.currency, gl: t.gl, hl: 'en', sort_by: '3',
            }, apiKey);
            payload = json.__empty ? null : cheapestHotels(json, t);
          }
          const fetchedAt = new Date().toISOString();
          // Remember empty searches too (for a shorter time) so they don't keep using the plan.
          const stored = payload ?? { none: true };
          const life = payload ? ttl : Math.min(ttl, 3 * 3600 * 1000);
          await db.from('uniworld_rate_cache').upsert({ key: keys[part]!, payload: stored, fetched_at: fetchedAt, expires_at: new Date(Date.now() + life).toISOString() });
          apply(part, stored, fetchedAt, false);
        } catch (e) {
          console.error('serpapi', part, String((e as Error)?.message ?? e).slice(0, 200));
          useStale(part);
          result.notice = result.notice ?? 'partial';
        }
      });
      await Promise.all(jobs);
    }
  }

  result.ok = !!(result.flight || result.hotel);
  if (!result.ok && !result.notice) result.notice = result.empty.length ? 'empty' : 'unavailable';
  return reply(result, 200, origin);
});
