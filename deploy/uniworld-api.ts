// Uniworld app API: booking requests, the team inbox, payments, wish list and saved itineraries.
// Customers don't need an account: each phone or browser keeps a private device id
// (a random UUID) that owns its own requests. A customer can bring a request to a new
// phone with its reference and their phone number or email ("Find my booking").
// The Uniworld team reads and answers every request with the staff key (the
// UNIWORLD_STAFF_KEY secret in Supabase), asks for payment with a link or bank details,
// marks it paid and shares travel documents.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Websites allowed to use this API. Extra ones (for example a new host for the app) can be
// added without code changes in the UNIWORLD_ALLOWED_ORIGINS secret, separated by commas.
const ORIGINS = new Set([
  'https://abdeeznuts.github.io', 'https://app.uniworldinc.com', 'https://uniworldinc.com', 'https://www.uniworldinc.com',
  'http://127.0.0.1:5173', 'http://localhost:5173',
  ...(Deno.env.get('UNIWORLD_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s)),
]);
const APP_URL = Deno.env.get('UNIWORLD_APP_URL') || 'https://abdeeznuts.github.io/';
// Uniworld's collection (copied from the app's data.js). Prices are guide prices in USD.
const CATALOGUE = {"stays": [{"id": "caldera-house", "name": "Caldera House", "destination": "Santorini", "image": "/assets/santorini.webp", "price": 310, "room": "Caldera-view suite"}, {"id": "forest-observatory", "name": "The Forest Observatory", "destination": "Rosenberg", "image": "/assets/treehouse.webp", "price": 175, "room": "Canopy suite"}, {"id": "makkah-residence", "name": "Makkah Serenity Residence", "destination": "Makkah", "image": "/assets/makkah.webp", "price": 145, "room": "Family comfort room"}, {"id": "madinah-garden", "name": "Madinah Garden Suites", "destination": "Madinah", "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85", "price": 130, "room": "Comfort suite"}, {"id": "lagoon-house", "name": "The Lagoon House", "destination": "Maldives", "image": "/assets/maldives.webp", "price": 285, "room": "Ocean-view villa"}, {"id": "bali-retreat", "name": "Ubud Garden Retreat", "destination": "Bali", "image": "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=85", "price": 125, "room": "Garden-view suite"}, {"id": "hunza-lodge", "name": "Karakoram Mountain Lodge", "destination": "Hunza", "image": "assets/hunza.webp", "price": 95, "room": "Valley-view room"}, {"id": "dubai-palm", "name": "Palm & Sea Dubai", "destination": "Dubai", "image": "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=85", "price": 195, "room": "Deluxe sea-view room"}, {"id": "istanbul-house", "name": "The Bosphorus House", "destination": "Istanbul", "image": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1200&q=85", "price": 110, "room": "Heritage double room"}, {"id": "london-townhouse", "name": "The London Townhouse", "destination": "London", "image": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85", "price": 220, "room": "Classic king room"}, {"id": "nyc-loft", "name": "The Manhattan Loft", "destination": "New York", "image": "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=85", "price": 245, "room": "City-view king room"}, {"id": "bali-hideaway", "name": "Seminyak Beach Hideaway", "destination": "Bali", "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85", "price": 165, "room": "Poolside suite"}], "packages": [{"id": "umrah-essentials", "name": "The meaningful escape", "destination": "Makkah", "image": "/assets/makkah.webp", "price": 890, "days": 7}, {"id": "umrah-family", "name": "Together, with purpose", "destination": "Makkah", "image": "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=85", "price": 1290, "days": 10}, {"id": "umrah-signature", "name": "The signature journey", "destination": "Makkah", "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85", "price": 1890, "days": 14}, {"id": "northern-notes", "name": "Northern notes", "destination": "Hunza", "image": "assets/hunza.webp", "price": 680, "days": 7}, {"id": "island-time", "name": "A little island time", "destination": "Maldives", "image": "/assets/maldives.webp", "price": 1490, "days": 5}, {"id": "istanbul-story", "name": "The Istanbul story", "destination": "Istanbul", "image": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1200&q=85", "price": 990, "days": 6}]};
const stays: any[] = CATALOGUE.stays;
const packages: any[] = CATALOGUE.packages;
const experiences: Record<string, [string, string, number, string]> = {
  'hunza-walk': ['Hunza heritage walk', 'Hunza', 35, 'assets/hunza.webp'],
  'london-walk': ['London riverside discovery', 'London', 65, 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85'],
  'nyc-walk': ['New York neighborhood stories', 'New York', 75, 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=85'],
};

const STATUSES = ['new', 'in_progress', 'confirmed', 'cancelled'];
const MARKETS = ['PKR', 'GBP', 'USD'];
const PAY_STATUSES = ['none', 'due', 'paid'];
const PAY_CURRENCIES = ['PKR', 'GBP', 'USD', 'SAR', 'AED', 'EUR'];
const UMRAH_AIRPORTS = ['Jeddah (JED)', 'Madinah (MED)'];
const CABINS = ['Economy', 'Premium economy', 'Business', 'First class'];
const CONTACT_BY = ['whatsapp', 'call', 'email'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && (ORIGINS.has(origin) || origin === 'null') ? origin : 'https://abdeeznuts.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-uniworld-device, x-uniworld-staff',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (value: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(value), { status, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const safe = (v: unknown, n = 150) => String(v ?? '').trim().slice(0, n);
const int = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError('Please check traveler counts.');
  return n;
};
function date(v: unknown) {
  const s = safe(v, 10), parsed = new Date(s + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) throw new HttpError('Please choose valid dates.');
  return s;
}
function startDate(v: unknown) {
  const s = date(v);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s < yesterday || Date.parse(s) - Date.now() > 732 * 86400000) throw new HttpError('Choose a date within the next two years.');
  return s;
}
const amount = (n: number) => Math.round(n * 100) / 100;
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function uuidParam(v: string) {
  if (!UUID.test(v)) throw new HttpError('Request not found.', 404);
  return v.toLowerCase();
}

// ---------- Old demo pricing (kept so older app versions keep working) ----------
function quote(input: any) {
  const kind = input.kind, start = startDate(input.start), travelers = int(input.travelers ?? 2, 1, 20);
  let title = '', destination = '', image = '', end = start, base = 0, details = '';
  if (kind === 'stay') {
    const item = stays.find((s) => s.id === input.productId);
    if (!item) throw new HttpError('Stay not found.');
    end = date(input.end);
    const nights = nightsBetween(start, end);
    if (nights < 1 || nights > 60) throw new HttpError('Choose a stay between 1 and 60 nights.');
    const rooms = int(input.rooms, 1, 5), room = int(input.room, 0, 1);
    if (travelers > rooms * (room ? 4 : 2)) throw new HttpError('Please select more rooms or a suite for your party.');
    title = item.name; destination = item.destination; image = item.image;
    base = amount(item.price * (room ? 1.35 : 1) * rooms * nights);
    details = `${room ? 'Signature suite' : item.room} · ${rooms} room${rooms > 1 ? 's' : ''} · ${nights} nights`;
  } else if (kind === 'holiday') {
    const item = packages.find((p) => p.id === input.productId);
    if (!item) throw new HttpError('Holiday not found.');
    title = item.name; destination = item.destination; image = item.image; base = item.price * travelers;
    end = new Date(Date.parse(start) + (item.days - 1) * 86400000).toISOString().slice(0, 10);
    details = `${item.days} days · accommodation & sample guided itinerary · flights excluded`;
  } else if (kind === 'flight') {
    const from = safe(input.from, 80), to = safe(input.to, 80);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) throw new HttpError('Choose different departure and destination airports.');
    const option = int(input.option, 0, 2), cabin = safe(input.cabin, 30);
    const mult = ({ 'Economy': 1, 'Premium economy': 1.6, 'Business': 2.8, 'First class': 4.2 } as Record<string, number>)[cabin];
    if (!mult) throw new HttpError('Choose a cabin.');
    if (input.end) { end = date(input.end); if (end < start) throw new HttpError('Return must be after departure.'); }
    const round = !!input.end;
    title = `${from} → ${to}`; destination = to;
    base = amount((420 + option * 115) * mult * travelers * (round ? 1.8 : 1));
    details = `${['Value connection', 'Flexible connection', 'Premium connection'][option]} · ${cabin} · ${round ? 'return' : 'one way'} · 23 kg checked bag per person`;
  } else if (kind === 'experience') {
    const item = experiences[input.productId];
    if (!item) throw new HttpError('Experience not found.');
    [title, destination] = item; base = item[2] * travelers;
    details = '3-hour guided experience · private demo group';
  } else throw new HttpError('Choose a valid travel product.');
  const fee = amount(base * 0.04), total = amount(base + fee);
  return { kind, title, destination, image, start, end, travelers, details, base, fee, total, currency: 'USD', demo: true };
}

// ---------- Booking requests ----------
// Only Google image hosts are accepted for live hotel photos.
function imageUrl(v: unknown) {
  try {
    const u = new URL(safe(v, 500));
    return u.protocol === 'https:' && /(^|\.)(googleusercontent|gstatic|ggpht)\.com$/.test(u.hostname) ? u.toString() : '';
  } catch { return ''; }
}

// The live price the customer saw in the app (Google Flights or Google Hotels).
function seenPrice(v: any) {
  if (!v || typeof v !== 'object') return null;
  const value = Number(v.amount), total = Number(v.total);
  const currency = MARKETS.includes(v.currency) ? v.currency : null;
  const source = ['Google Flights', 'Google Hotels', 'Google Flights + Google Hotels'].includes(v.source) ? v.source : null;
  if (!(value > 0 && value < 1e9) || !currency || !source) return null;
  const checked = Date.parse(String(v.checkedAt ?? ''));
  return {
    amount: Math.round(value), currency, source,
    total: total > 0 && total < 1e10 ? Math.round(total) : null,
    per: ['person', 'night', 'trip'].includes(v.per) ? v.per : null,
    checkedAt: Number.isFinite(checked) ? new Date(checked).toISOString() : null,
    airline: safe(v.airline, 60) || null,
    stops: Number.isInteger(v.stops) && v.stops >= 0 && v.stops < 6 ? v.stops : null,
  };
}

// The parts of a live Umrah package (flight, Makkah hotel, Madinah hotel) as the customer saw them.
function breakdownOf(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 5).map((x: any) => {
    const n = Number(x?.amount);
    return {
      label: safe(x?.label, 40).replace(/[\u0000-\u001f]+/g, ' '),
      text: safe(x?.text, 220).replace(/[\u0000-\u001f]+/g, ' '),
      amount: n > 0 && n < 1e10 ? Math.round(n) : null,
      currency: MARKETS.includes(x?.currency) ? x.currency : null,
    };
  }).filter((x) => x.label && x.text);
}

function tripFor(input: any) {
  const kind = safe(input.kind, 20);
  const start = startDate(input.start), travelers = int(input.travelers ?? 1, 1, 20);
  let title = '', destination = '', image = '', end = '', details = '', estimateUsd: number | null = null;
  const extra: Record<string, unknown> = {};
  if (kind === 'stay') {
    const item = stays.find((s) => s.id === input.productId);
    if (!item) throw new HttpError('That stay is no longer available.');
    end = date(input.end);
    const nights = nightsBetween(start, end);
    if (nights < 1 || nights > 60) throw new HttpError('Choose a stay between 1 and 60 nights.');
    const rooms = int(input.rooms ?? 1, 1, 5), room = int(input.room ?? 0, 0, 1);
    if (travelers > rooms * (room ? 4 : 2)) throw new HttpError('Please select more rooms or a suite for your party.');
    title = item.name; destination = item.destination; image = item.image;
    details = `${room ? 'Signature suite' : item.room} · ${rooms} room${rooms > 1 ? 's' : ''} · ${nights} night${nights > 1 ? 's' : ''}`;
    estimateUsd = amount(item.price * (room ? 1.35 : 1) * rooms * nights);
    Object.assign(extra, { productId: item.id, rooms, room, nights });
  } else if (kind === 'holiday') {
    const item = packages.find((p) => p.id === input.productId);
    if (!item) throw new HttpError('That journey is no longer available.');
    title = item.name; destination = item.destination; image = item.image;
    end = new Date(Date.parse(start) + (item.days - 1) * 86400000).toISOString().slice(0, 10);
    details = `${item.days}-day journey · flights quoted separately`;
    estimateUsd = amount(item.price * travelers);
    Object.assign(extra, { productId: item.id, days: item.days });
  } else if (kind === 'experience') {
    const item = experiences[input.productId];
    if (!item) throw new HttpError('That experience is no longer available.');
    [title, destination] = item; image = item[3]; end = start;
    details = '3-hour private experience';
    estimateUsd = amount(item[2] * travelers);
    Object.assign(extra, { productId: input.productId });
  } else if (kind === 'flight') {
    const from = safe(input.from, 80), to = safe(input.to, 80);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) throw new HttpError('Choose different departure and destination airports.');
    const cabin = CABINS.includes(input.cabin) ? input.cabin : 'Economy';
    if (input.end) { end = date(input.end); if (end < start) throw new HttpError('Your return date is before departure.'); }
    title = `${from} → ${to}`; destination = to;
    details = `${cabin} · ${end ? 'return' : 'one way'}`;
    Object.assign(extra, { from, to, cabin, oneWay: !end });
  } else if (kind === 'hotel') {
    const hotelName = safe(input.hotelName, 150), city = safe(input.city, 80);
    if (!hotelName) throw new HttpError('Choose a hotel first.');
    end = date(input.end);
    const nights = nightsBetween(start, end);
    if (nights < 1 || nights > 60) throw new HttpError('Choose a stay between 1 and 60 nights.');
    title = hotelName; destination = city; image = imageUrl(input.image);
    details = `${nights} night${nights > 1 ? 's' : ''}${city ? ' · ' + city : ''}`;
    Object.assign(extra, { hotelName, city, nights });
  } else if (kind === 'umrah') {
    // A live Umrah package: return flight + Makkah hotel + Madinah hotel.
    const from = safe(input.from, 80), to = UMRAH_AIRPORTS.includes(input.to) ? input.to : 'Jeddah (JED)';
    if (from.length < 3) throw new HttpError('Choose where you are flying from.');
    end = date(input.end);
    const makkahNights = int(input.makkahNights ?? 0, 0, 30), madinahNights = int(input.madinahNights ?? 0, 0, 30);
    const nights = makkahNights + madinahNights;
    if (nights < 1) throw new HttpError('Add at least one night in Makkah or Madinah.');
    if (nightsBetween(start, end) < nights || nightsBetween(start, end) > nights + 3) throw new HttpError('Please check your Umrah dates.');
    const order = input.order === 'madinah-first' ? 'madinah-first' : 'makkah-first';
    const cabin = CABINS.includes(input.cabin) ? input.cabin : 'Economy';
    const makkahHotel = safe(input.makkahHotel, 150), madinahHotel = safe(input.madinahHotel, 150);
    title = `Umrah package · ${nights} night${nights > 1 ? 's' : ''}`;
    destination = 'Makkah & Madinah'; image = '/assets/makkah.webp';
    const cities = order === 'madinah-first'
      ? [madinahNights ? `${madinahNights} in Madinah` : '', makkahNights ? `${makkahNights} in Makkah` : '']
      : [makkahNights ? `${makkahNights} in Makkah` : '', madinahNights ? `${madinahNights} in Madinah` : ''];
    details = `From ${from} · nights: ${cities.filter(Boolean).join(', then ')}`;
    Object.assign(extra, { from, to, cabin, makkahNights, madinahNights, nights, order, makkahHotel, madinahHotel, breakdown: breakdownOf(input.breakdown) });
  } else throw new HttpError('Choose something to request.');
  // The exact option the customer picked (flight numbers and times, hotel and room), as plain text for the team.
  const chosen = safe(input.chosen, kind === 'umrah' ? 600 : 300).replace(/[\u0000-\u001f]+/g, ' ');
  return { kind, title, destination, image, start, end: end || start, travelers, details, estimateUsd, seen: seenPrice(input.seen), chosen, ...extra };
}

function contactFor(input: any) {
  const name = safe(input.name, 100);
  if (name.length < 2) throw new HttpError('Please enter your full name.');
  const phone = safe(input.phone, 40), digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) throw new HttpError('Please enter a phone or WhatsApp number with your country code.');
  const email = safe(input.email, 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError('Please check your email address.');
  const contactBy = CONTACT_BY.includes(input.contactBy) ? input.contactBy : 'whatsapp';
  if (contactBy === 'email' && !email) throw new HttpError('Add your email address, or choose WhatsApp or a call.');
  if (input.consent !== true) throw new HttpError('Please agree to be contacted about this request.');
  return { name, phone, email, contactBy, note: safe(input.note, 800) };
}

// A short, readable reference (no 0/O or 1/I) that is the same every time for one request.
async function referenceFor(requestId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestId)));
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'UW-' + Array.from(bytes.slice(0, 6), (b) => letters[b % 32]).join('');
}

// Customers never see the team's internal notes.
const forCustomer = (b: any) => { const { staff: _staff, ...rest } = b ?? {}; return rest; };

// ---------- Payments and travel documents (set by the team) ----------
function httpsLink(v: unknown, field: string) {
  const s = safe(v, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error('bad');
    return u.toString();
  } catch { throw new HttpError(`${field} must be a full https:// link.`); }
}

// payment = { status: none|due|paid, amount, currency, link, note, dueAt, paidAt, customerSent }
function paymentFor(input: any, current: any, now: number) {
  const prev = current && typeof current === 'object' ? current : { status: 'none' };
  if (!input || typeof input !== 'object') return prev;
  const status = PAY_STATUSES.includes(input.status) ? input.status : prev.status ?? 'none';
  if (status === 'none') return { status: 'none' };
  const value = Number(input.amount ?? prev.amount);
  if (!(value > 0 && value < 1e9)) throw new HttpError('Enter the amount the customer should pay.');
  const currency = PAY_CURRENCIES.includes(input.currency) ? input.currency : PAY_CURRENCIES.includes(prev.currency) ? prev.currency : null;
  if (!currency) throw new HttpError('Choose the payment currency.');
  const link = input.link === undefined ? prev.link ?? '' : httpsLink(input.link, 'The payment link');
  const note = input.note === undefined ? prev.note ?? '' : safe(input.note, 600);
  if (status === 'due' && !link && !note) throw new HttpError('Add a payment link or bank transfer details so the customer knows how to pay.');
  return {
    status, amount: Math.round(value * 100) / 100, currency, link, note,
    dueAt: prev.status === 'due' || prev.status === 'paid' ? prev.dueAt ?? now : now,
    paidAt: status === 'paid' ? (prev.status === 'paid' ? prev.paidAt ?? now : now) : null,
    customerSent: status === 'due' ? prev.customerSent ?? null : status === 'paid' ? prev.customerSent ?? null : null,
  };
}

// Up to 8 links the customer can open (e-tickets, hotel vouchers, visas): [{ label, url }]
function documentsFor(v: unknown, current: any) {
  if (v === undefined) return Array.isArray(current) ? current : [];
  if (!Array.isArray(v)) throw new HttpError('Documents must be a list.');
  return v.slice(0, 8).map((d: any, i: number) => ({
    label: safe(d?.label, 60).replace(/[\u0000-\u001f]+/g, ' ') || `Document ${i + 1}`,
    url: httpsLink(d?.url, `Document ${i + 1}`),
  })).filter((d) => d.url);
}

// "Find my booking": the phone number or email used on the request.
const lastDigits = (s: string) => String(s ?? '').replace(/\D/g, '').slice(-9);
function contactMatches(r: any, given: string) {
  const g = safe(given, 150);
  if (g.includes('@')) return !!r.email && r.email.trim().toLowerCase() === g.toLowerCase();
  const a = lastDigits(g), b = lastDigits(r.phone);
  return a.length >= 7 && b.length >= 7 && a.slice(-Math.min(a.length, b.length)) === b.slice(-Math.min(a.length, b.length));
}

// A customer may open a request from more than one phone: the request stays with the phone that
// sent it, and other phones keep a small link to it.
async function requestFor(records: () => any, owner: string, requestId: string) {
  const key = owner + ':request:' + requestId;
  const own = await records().select('id,body').eq('id', key).eq('owner', owner).maybeSingle();
  if (own.error) throw own.error;
  if (own.data) return own.data;
  const link = await records().select('body').eq('id', owner + ':link:' + requestId).eq('owner', owner).maybeSingle();
  const target = link.data?.body?.key;
  if (typeof target !== 'string' || !target.endsWith(':request:' + requestId)) return null;
  const linked = await records().select('id,body').eq('id', target).eq('kind', 'request').maybeSingle();
  return linked.data ?? null;
}

// Slows down guessing references: at most 20 lookups an hour from one network.
async function lookupAllowed(req: Request, records: () => any) {
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const hour = Math.floor(Date.now() / 3600000);
  const hash = Array.from(await digest('lookup|' + ip + '|' + hour), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const id = 'system:lookup:' + hash;
  const row = await records().select('body').eq('id', id).maybeSingle();
  const count = Number(row.data?.body?.count ?? 0);
  if (count >= 20) return false;
  await records().upsert({ id, owner: 'system', kind: 'ratelimit', body: { count: count + 1, hour }, created: Date.now() }, { onConflict: 'id' });
  return true;
}

// ---------- Instant hotel booking (liteAPI): the app books and the guest pays in the app ----------
// Off until the LITEAPI_KEY secret exists. The guest pays on liteAPI's secure payment form;
// the booking is then confirmed automatically. The team is alerted only if something fails.
const LITEAPI_BOOK = 'https://book.liteapi.travel/v3.0';
async function lite(path: string, payload?: unknown) {
  const key = Deno.env.get('LITEAPI_KEY');
  if (!key) throw new HttpError('Instant booking isn’t switched on yet. Send a request instead.', 503);
  const res = await fetch(LITEAPI_BOOK + path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(45000),
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok && !!json?.data, json };
}
const liteError = (json: any) => String(json?.error?.message ?? json?.error?.description ?? json?.message ?? '').slice(0, 160);
function instantTripFrom(v: any) {
  const checkIn = date(v?.checkIn), checkOut = date(v?.checkOut), nights = nightsBetween(checkIn, checkOut);
  if (nights < 1 || nights > 30) throw new HttpError('Choose a stay between 1 and 30 nights.');
  const hotelName = safe(v?.hotelName, 150);
  if (!hotelName) throw new HttpError('Choose a hotel first.');
  return {
    hotelId: safe(v?.hotelId, 40), hotelName, city: safe(v?.city, 80), image: /^https:\/\//.test(safe(v?.image, 500)) ? safe(v.image, 500) : '',
    checkIn, checkOut, nights, adults: int(v?.adults ?? 2, 1, 8), roomName: safe(v?.roomName, 90), board: safe(v?.board, 40),
    sandbox: v?.sandbox === true,
  };
}
function holderFrom(v: any) {
  const firstName = safe(v?.firstName, 60), lastName = safe(v?.lastName, 60), email = safe(v?.email, 150), phone = safe(v?.phone, 40);
  if (firstName.length < 1 || lastName.length < 1) throw new HttpError('Enter the guest’s first and last name as on their passport.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError('Enter an email address for the hotel confirmation.');
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) throw new HttpError('Please enter a phone or WhatsApp number with your country code.');
  return { firstName, lastName, email, phone };
}

// ---------- Team settings (WhatsApp number, default payment instructions) ----------
const SETTINGS_ID = 'system:settings';
async function readSettings(records: () => any) {
  const { data } = await records().select('body').eq('id', SETTINGS_ID).maybeSingle();
  const b = data?.body ?? {};
  return { whatsapp: typeof b.whatsapp === 'string' ? b.whatsapp : '', paymentNote: typeof b.paymentNote === 'string' ? b.paymentNote : '' };
}
function settingsFrom(input: any, current: any) {
  let whatsapp = current.whatsapp;
  if (input.whatsapp !== undefined) {
    const digits = safe(input.whatsapp, 30).replace(/\D/g, '').replace(/^00/, '');
    if (digits && (digits.length < 8 || digits.length > 15)) throw new HttpError('Enter the WhatsApp number with its country code, like +92 300 1234567.');
    whatsapp = digits;
  }
  const paymentNote = input.paymentNote === undefined ? current.paymentNote : safe(input.paymentNote, 600);
  return { whatsapp, paymentNote };
}

// Live hotels a customer saved to their wish list (a snapshot to find them again).
function savedHotelsFrom(v: unknown) {
  if (!Array.isArray(v)) throw new HttpError('Choose hotels to save.');
  const seen = new Set<string>();
  return v.slice(0, 60).map((h: any) => {
    const token = typeof h?.token === 'string' && h.token.length >= 8 && h.token.length <= 600 && /^[\x21-\x7e]+$/.test(h.token) ? h.token : '';
    const price = Number(h?.price), rating = Number(h?.rating), stars = Number(h?.stars);
    return {
      token, name: safe(h?.name, 150), city: safe(h?.city, 80), q: safe(h?.q, 80), image: imageUrl(h?.image),
      stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
      rating: rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
      price: price > 0 && price < 1e9 ? Math.round(price) : null,
      currency: MARKETS.includes(h?.currency) ? h.currency : null,
      savedAt: Number.isFinite(Number(h?.savedAt)) ? Number(h.savedAt) : Date.now(),
    };
  }).filter((h) => h.token && h.name && !seen.has(h.token) && seen.add(h.token)).slice(0, 50);
}

// ---------- Phone alerts (Web Push: no third-party account needed) ----------
// The app's own VAPID key pair is created on first use and kept in the database (service role only).
// Alerts go to the team's phones when a request or a payment arrives, and to the customer's
// phones when the team updates their booking.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const te = new TextEncoder();
const b64u = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s: string) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const concatBytes = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
function subscriptionFrom(v: any) {
  const endpoint = safe(v?.endpoint, 800), p256dh = safe(v?.keys?.p256dh, 200), auth = safe(v?.keys?.auth, 100);
  let host = '';
  try { const u = new URL(endpoint); if (u.protocol === 'https:') host = u.hostname; } catch { /* checked below */ }
  let keysOk = false;
  try { keysOk = unb64u(p256dh).length === 65 && unb64u(auth).length === 16; } catch { keysOk = false; }
  if (!host || !PUSH_HOSTS.test(host) || !keysOk) throw new HttpError('Alerts aren’t supported in this browser yet.');
  return { endpoint, keys: { p256dh, auth }, created: Date.now() };
}
const subId = async (endpoint: string) => Array.from(await digest('push|' + endpoint), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

async function vapidKeys(records: () => any) {
  const found = await records().select('body').eq('id', 'system:vapid').maybeSingle();
  if (found.data?.body?.publicKey) return found.data.body;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const created = { publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), created: Date.now() };
  await records().upsert({ id: 'system:vapid', owner: 'system', kind: 'config', body: created, created: Date.now() }, { onConflict: 'id', ignoreDuplicates: true });
  const again = await records().select('body').eq('id', 'system:vapid').maybeSingle(); // keep the stored pair if two requests raced
  return again.data?.body ?? created;
}
async function vapidHeader(endpoint: string, keys: any) {
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o: unknown) => b64u(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:contact@uniworldinc.com' })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${keys.publicKey}`;
}
// RFC 8291 message encryption (aes128gcm), so alerts can carry their text.
async function encryptPush(sub: any, payload: Uint8Array) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = (await hmac(await hmac(authSecret, shared), concatBytes(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, te.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, te.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concatBytes(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concatBytes(header, cipher);
}
// One alert to each phone; forgets phones the push service says are gone.
async function pushTo(records: () => any, rows: any[], message: { title: string; body: string; url: string; tag?: string }) {
  if (!rows.length) return;
  const keys = await vapidKeys(records);
  const payload = te.encode(JSON.stringify(message));
  await Promise.all(rows.map(async (row: any) => {
    try {
      const sub = row.body;
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidHeader(sub.endpoint, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
        body: await encryptPush(sub, payload),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404 || res.status === 410) await records().delete().eq('id', row.id);
      else if (!res.ok) console.error('Push failed', res.status);
    } catch (e) { console.error('Push failed', String(e).slice(0, 120)); }
  }));
}
async function pushTeam(records: () => any, message: any) {
  const { data } = await records().select('id,body').eq('kind', 'push-staff').limit(50);
  await pushTo(records, data ?? [], message);
}
// The phone that sent the request, and any phone that found it with "Find my booking".
async function pushCustomer(records: () => any, recordKey: string, message: any) {
  const links = await records().select('owner').eq('kind', 'request-link').eq('body->>key', recordKey).limit(10);
  const owners = [recordKey.split(':request:')[0], ...(links.data ?? []).map((l: any) => l.owner)];
  const { data } = await records().select('id,body').eq('kind', 'push').in('owner', owners).limit(30);
  await pushTo(records, data ?? [], message);
}
// What changed, in one line for the customer's alert.
function updateAlert(before: any, after: any) {
  const ref = after.id, money = (p: any) => `${p.currency} ${Number(p.amount).toLocaleString('en-US')}`;
  if (after.payment?.status === 'paid' && before.payment?.status !== 'paid') return { title: `Payment received · ${ref}`, body: `Thank you! ${money(after.payment)} is confirmed for ${after.title}.` };
  if (after.payment?.status === 'due' && before.payment?.status !== 'due') return { title: `Ready to pay · ${ref}`, body: `${after.title}: ${money(after.payment)} is due. Tap to pay in the app.` };
  if ((after.documents?.length ?? 0) > (before.documents?.length ?? 0)) return { title: `Travel documents ready · ${ref}`, body: `Your documents for ${after.title} are in the app.` };
  if (after.status !== before.status) return { title: `${after.status === 'confirmed' ? 'Confirmed' : after.status === 'cancelled' ? 'Cancelled' : 'Update'} · ${ref}`, body: after.status === 'confirmed' ? `${after.title} is confirmed by Uniworld.` : after.status === 'in_progress' ? `An advisor is working on ${after.title}.` : `${after.title} was cancelled.` };
  if (after.customerMessage && after.customerMessage !== before.customerMessage) return { title: `Message from Uniworld · ${ref}`, body: String(after.customerMessage).slice(0, 140) };
  return null;
}

// ---------- Team access ----------
async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
async function requireStaff(req: Request) {
  const expected = (Deno.env.get('UNIWORLD_STAFF_KEY') ?? '').trim();
  if (expected.length < 8) throw new HttpError('Team access is not set up yet. Add a UNIWORLD_STAFF_KEY secret (8+ characters) in Supabase.', 503);
  const given = (req.headers.get('x-uniworld-staff') ?? '').trim();
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (!given || diff) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    throw new HttpError('That team key is not right.', 401);
  }
}

// Optional email alert for each new request, and when a customer says they paid
// (only when RESEND_API_KEY is set).
async function notifyTeam(r: any, event: 'new' | 'paid' = 'new') {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return;
  const lines = event === 'paid'
    ? [`${r.name} says they paid for ${r.id}.`, '', `Amount due: ${r.payment?.currency} ${r.payment?.amount}`, r.payment?.customerSent?.note ? `Their note: ${r.payment.customerSent.note}` : 'No note added.', 'Check the payment, then mark it paid in the team inbox.', '']
    : [`New request ${r.id}`, ''];
  lines.push(`${r.title} (${r.kind})`, r.details, `Dates: ${r.start}${r.end && r.end !== r.start ? ' to ' + r.end : ''}`, `Travelers: ${r.travelers}`);
  if (r.chosen) lines.push(`Picked: ${r.chosen}`);
  for (const b of r.breakdown ?? []) lines.push(`${b.label}: ${b.text}${b.amount ? ` (${b.currency} ${b.amount})` : ''}`);
  lines.push('', `Name: ${r.name}`, `Phone / WhatsApp: ${r.phone}`);
  if (r.email) lines.push(`Email: ${r.email}`);
  lines.push(`Prefers: ${r.contactBy}`);
  if (r.note) lines.push(`Note: ${r.note}`);
  lines.push('', `Team inbox: ${APP_URL}#staff`);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('UNIWORLD_NOTIFY_FROM') || 'Uniworld App <onboarding@resend.dev>',
        to: [Deno.env.get('UNIWORLD_NOTIFY_EMAIL') || 'contact@uniworldinc.com'],
        subject: event === 'paid' ? `Payment sent for ${r.id}: ${r.title}` : `New Uniworld request ${r.id}: ${r.title}`,
        text: lines.join('\n'),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('Email alert failed', res.status);
  } catch (e) { console.error('Email alert failed', String(e).slice(0, 120)); }
}
function inBackground(task: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else task.catch(() => {});
}

async function body(req: Request) {
  const text = await req.text();
  if (text.length > 64000) throw new HttpError('Request is too large.', 413);
  try { return JSON.parse(text); } catch { throw new HttpError('Invalid request.'); }
}

// Lets a deploy be checked against the source it came from.
const BUILD = '2026-10-24.3';
async function sourceHash() {
  try {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await Deno.readFile(new URL(import.meta.url))));
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  try {
    if (origin && origin !== 'null' && !ORIGINS.has(origin)) throw new HttpError('This service is for the Uniworld app.', 403);
    const path = new URL(req.url).pathname.replace(/^.*?\/uniworld-api\/?/, '').split('/').filter(Boolean);
    const method = req.method;
    if (path[0] === 'health') return json({ ok: true, build: BUILD, source: await sourceHash() }, 200, origin);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const records = () => db.from('uniworld_records');
    if (path[0] === 'push' && path[1] === 'key' && method === 'GET') return json({ publicKey: (await vapidKeys(records)).publicKey }, 200, origin);

    // ----- Team inbox (staff key) -----
    if (path[0] === 'staff') {
      await requireStaff(req);
      if (path[1] === 'check' && method === 'GET') return json({ ok: true }, 200, origin);
      if (path[1] === 'settings' && method === 'GET') return json(await readSettings(records), 200, origin);
      if (path[1] === 'push' && method === 'POST') {
        const input = await body(req), sub = subscriptionFrom(input.subscription), id = 'system:push-staff:' + await subId(sub.endpoint);
        const { error } = input.off ? await records().delete().eq('id', id) : await records().upsert({ id, owner: 'system', kind: 'push-staff', body: sub, created: Date.now() }, { onConflict: 'id' });
        if (error) throw error;
        return json({ alerts: !input.off }, 200, origin);
      }
      if (path[1] === 'settings' && method === 'PUT') {
        const next = settingsFrom(await body(req), await readSettings(records));
        const { error } = await records().upsert({ id: SETTINGS_ID, owner: 'system', kind: 'settings', body: { ...next, updated: Date.now() }, created: Date.now() }, { onConflict: 'id' });
        if (error) throw error;
        return json(next, 200, origin);
      }
      if (path[1] === 'requests' && !path[2] && method === 'GET') {
        const { data, error } = await records().select('body').eq('kind', 'request').order('created', { ascending: false }).limit(500);
        if (error) throw error;
        return json({ requests: (data ?? []).map((r: any) => r.body), now: Date.now() }, 200, origin);
      }
      if (path[1] === 'requests' && path[2] && method === 'PATCH') {
        const id = uuidParam(path[2]);
        const row = await records().select('id,body').eq('kind', 'request').like('id', '%:request:' + id).maybeSingle();
        if (row.error) throw row.error;
        if (!row.data) throw new HttpError('Request not found.', 404);
        const input = await body(req), current = row.data.body, now = Date.now();
        const status = input.status === undefined ? current.status : safe(input.status, 20);
        if (!STATUSES.includes(status)) throw new HttpError('Choose a valid status.');
        const payment = paymentFor(input.payment, current.payment, now);
        const history = [...(current.history ?? [])];
        if (status !== current.status) history.push({ at: now, status, by: 'team' });
        if ((payment.status ?? 'none') !== (current.payment?.status ?? 'none')) history.push({ at: now, status: 'payment_' + payment.status, by: 'team' });
        const record = {
          ...current,
          status,
          customerMessage: input.customerMessage === undefined ? current.customerMessage ?? '' : safe(input.customerMessage, 600),
          payment,
          documents: documentsFor(input.documents, current.documents),
          staff: { ...(current.staff ?? {}), note: input.staffNote === undefined ? current.staff?.note ?? '' : safe(input.staffNote, 1000) },
          updated: now,
          history: history.slice(-40),
        };
        const { error } = await records().update({ body: record }).eq('id', row.data.id);
        if (error) throw error;
        const alert = updateAlert(current, record);
        if (alert) inBackground(pushCustomer(records, row.data.id, { ...alert, url: '/#trips', tag: record.id }));
        return json(record, 200, origin);
      }
      throw new HttpError('Not found.', 404);
    }

    // ----- Customer (private device id) -----
    const device = req.headers.get('x-uniworld-device') ?? '';
    if (!UUID.test(device)) throw new HttpError('Open Uniworld again to continue.', 401);
    const owner = 'device:' + device.toLowerCase();

    if (path[0] === 'state' && method === 'GET') {
      const { data, error } = await records().select('kind,body').eq('owner', owner).order('created', { ascending: false }).limit(300);
      if (error) throw error;
      const rows = data ?? [];
      // Requests found with "Find my booking" on this phone live with the phone that sent them.
      const linkKeys = rows.filter((r: any) => r.kind === 'request-link' && typeof r.body?.key === 'string').map((r: any) => r.body.key).slice(0, 50);
      let linked: any[] = [];
      if (linkKeys.length) {
        const found = await records().select('body').in('id', linkKeys).eq('kind', 'request');
        if (found.error) throw found.error;
        linked = (found.data ?? []).map((r: any) => r.body);
      }
      const requests = [...rows.filter((r: any) => r.kind === 'request').map((r: any) => r.body), ...linked]
        .filter((r, i, all) => r && all.findIndex((x) => x.recordId === r.recordId) === i)
        .sort((a, b) => b.created - a.created);
      return json({
        requests: requests.map(forCustomer),
        bookings: [],
        itineraries: rows.filter((r: any) => r.kind === 'itinerary').map((r: any) => r.body),
        favorites: (rows.find((r: any) => r.kind === 'favorites') as any)?.body ?? [],
        savedHotels: (rows.find((r: any) => r.kind === 'saved-hotels') as any)?.body ?? [],
        contact: { whatsapp: (await readSettings(records)).whatsapp },
        instant: { hotels: !!Deno.env.get('LITEAPI_KEY') },
        aiMode: 'on-device',
        displayName: 'This device',
      }, 200, origin);
    }
    if (path[0] === 'requests' && !path[1] && method === 'POST') {
      const input = await body(req);
      if (!UUID.test(input.requestId || '')) throw new HttpError('Please start your request again.');
      const requestId = String(input.requestId).toLowerCase();
      const key = owner + ':request:' + requestId;
      const previous = await records().select('body').eq('id', key).eq('owner', owner).maybeSingle();
      if (previous.data) return json(forCustomer(previous.data.body), 200, origin);
      const trip = tripFor(input), contact = contactFor(input);
      const recent = await records().select('created').eq('owner', owner).eq('kind', 'request').order('created', { ascending: false }).limit(15);
      if (recent.error) throw recent.error;
      if ((recent.data ?? []).filter((r: any) => r.created > Date.now() - 86400000).length >= 15) throw new HttpError('You have sent a lot of requests today. Please call or email Uniworld instead.', 429);
      const now = Date.now();
      const record = {
        id: await referenceFor(requestId), recordId: requestId, ...trip, ...contact,
        market: MARKETS.includes(input.market) ? input.market : 'USD',
        status: 'new', customerMessage: '', created: now, updated: now,
        history: [{ at: now, status: 'new', by: 'customer' }], staff: { note: '' },
      };
      const { error } = await records().upsert({ id: key, owner, kind: 'request', body: record, created: now }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      const saved = await records().select('body').eq('id', key).maybeSingle();
      const result = saved.data?.body ?? record;
      if (!saved.data || saved.data.body.created === now) inBackground(Promise.all([notifyTeam(result), pushTeam(records, { title: `New ${result.kind === 'umrah' ? 'Umrah ' : ''}request · ${result.id}`, body: `${result.name} · ${result.title}`, url: '/#staff', tag: result.id })]));
      return json(forCustomer(result), 201, origin);
    }
    // ----- Instant hotel booking (liteAPI) -----
    if (path[0] === 'instant' && path[1] === 'hotel' && path[2] === 'prebook' && method === 'POST') {
      const input = await body(req);
      if (!UUID.test(input.requestId || '')) throw new HttpError('Please start again.');
      const requestId = String(input.requestId).toLowerCase(), offerId = safe(input.offerId, 4000);
      if (offerId.length < 8) throw new HttpError('Choose a room first.');
      const trip = instantTripFrom(input.trip);
      const r = await lite('/rates/prebook', { offerId, usePaymentSdk: true });
      if (!r.ok) {
        console.error('liteapi prebook', r.status, liteError(r.json));
        throw new HttpError(r.status === 410 || r.status === 409 ? 'This room was just booked by someone else. Please choose another room.' : 'We couldn’t hold this room just now. Please try again or choose another room.', 409);
      }
      const x = r.json.data, rate = x.roomTypes?.[0]?.rates?.[0], cancel = rate?.cancellationPolicies;
      const hold = {
        requestId, prebookId: String(x.prebookId), transactionId: String(x.transactionId ?? ''), price: Number(x.price), currency: String(x.currency),
        trip: { ...trip, refundable: cancel?.refundableTag === 'RFN', freeCancelUntil: cancel?.refundableTag === 'RFN' ? String(cancel?.cancelPolicyInfos?.[0]?.cancelTime ?? '').slice(0, 25) || null : null, board: rate?.boardName ? String(rate.boardName).slice(0, 40) : trip.board },
        created: Date.now(), done: null,
      };
      if (!hold.transactionId || !x.secretKey || !(hold.price > 0)) throw new HttpError('Payment isn’t available for this room. Please choose another room.', 409);
      const { error } = await records().upsert({ id: owner + ':instant:' + requestId, owner, kind: 'instant-hold', body: hold, created: hold.created }, { onConflict: 'id' });
      if (error) throw error;
      return json({ prebookId: hold.prebookId, transactionId: hold.transactionId, secretKey: String(x.secretKey), price: hold.price, currency: hold.currency, priceChanged: Number(x.priceDifferencePercent) !== 0, cancellationChanged: !!x.cancellationChanged, refundable: hold.trip.refundable, freeCancelUntil: hold.trip.freeCancelUntil, board: hold.trip.board, sandbox: trip.sandbox }, 200, origin);
    }
    if (path[0] === 'instant' && path[1] === 'hotel' && path[2] === 'book' && method === 'POST') {
      const input = await body(req);
      if (!UUID.test(input.requestId || '')) throw new HttpError('Please start again.');
      const requestId = String(input.requestId).toLowerCase(), holdKey = owner + ':instant:' + requestId, key = owner + ':request:' + requestId;
      const held = await records().select('body').eq('id', holdKey).eq('owner', owner).maybeSingle();
      if (!held.data) throw new HttpError('This booking has expired. Please choose the room again.', 404);
      const hold = held.data.body;
      if (hold.done) { const done = await records().select('body').eq('id', key).maybeSingle(); if (done.data) return json(forCustomer(done.data.body), 200, origin); }
      const holder = holderFrom(input.holder);
      if (input.consent !== true) throw new HttpError('Please agree to be contacted about this booking.');
      if (Date.now() - hold.created > 60 * 60000) throw new HttpError('This room hold has expired. Please choose the room again.', 410);
      const recent = await records().select('created').eq('owner', owner).eq('kind', 'request').order('created', { ascending: false }).limit(15);
      if ((recent.data ?? []).filter((x: any) => x.created > Date.now() - 86400000).length >= 15) throw new HttpError('You have made a lot of bookings today. Please call or email Uniworld instead.', 429);
      const r = await lite('/rates/book', {
        prebookId: hold.prebookId, clientReference: requestId,
        holder, guests: [{ occupancyNumber: 1, firstName: holder.firstName, lastName: holder.lastName, email: holder.email, phone: holder.phone }],
        payment: { method: 'TRANSACTION_ID', transactionId: hold.transactionId },
        metadata: { platform: 'web', language: 'en' },
      });
      const now = Date.now(), t = hold.trip, booked = r.ok && r.json.data;
      const b = booked ? r.json.data : null;
      const record: any = {
        id: await referenceFor(requestId), recordId: requestId, kind: 'hotel', title: b?.hotel?.name || t.hotelName, destination: t.city, image: t.image,
        start: t.checkIn, end: t.checkOut, travelers: t.adults, nights: t.nights, hotelName: t.hotelName, city: t.city,
        details: `${t.nights} night${t.nights > 1 ? 's' : ''}${t.city ? ' · ' + t.city : ''}${t.roomName ? ' · ' + t.roomName : ''}${t.board ? ' · ' + t.board : ''}`,
        estimateUsd: null, seen: null, chosen: `${t.roomName || 'Room'}${t.board ? ' · ' + t.board : ''}${t.refundable ? ` · free cancellation${t.freeCancelUntil ? ' until ' + t.freeCancelUntil : ''}` : ' · non-refundable'}`,
        name: `${holder.firstName} ${holder.lastName}`, phone: holder.phone, email: holder.email, contactBy: 'whatsapp', note: safe(input.note, 800),
        market: MARKETS.includes(input.market) ? input.market : 'USD', created: now, updated: now,
        instant: { provider: 'liteapi', prebookId: hold.prebookId, bookingId: b?.bookingId ? String(b.bookingId) : null, status: b?.status ? String(b.status) : 'FAILED', confirmation: b?.hotelConfirmationCode ? String(b.hotelConfirmationCode) : null, refundable: !!t.refundable, freeCancelUntil: t.freeCancelUntil, sandbox: !!t.sandbox, error: booked ? null : liteError(r.json) || `HTTP ${r.status}` },
        staff: { note: '' },
      };
      if (booked) {
        Object.assign(record, {
          status: 'confirmed', customerMessage: 'Booked and paid in the app. Your hotel is confirmed. Show your Uniworld reference at check-in; the hotel’s own confirmation number appears here when the hotel sends it.',
          payment: { status: 'paid', amount: Number(b.price ?? hold.price), currency: String(b.currency ?? hold.currency), link: '', note: 'Paid by card in the app', dueAt: now, paidAt: now, customerSent: null },
          history: [{ at: now, status: 'new', by: 'customer' }, { at: now, status: 'confirmed', by: 'app' }, { at: now, status: 'payment_paid', by: 'app' }],
        });
      } else {
        console.error('liteapi book', r.status, record.instant.error);
        Object.assign(record, {
          status: 'new', customerMessage: 'The hotel couldn’t confirm this room automatically. You have not been charged: any hold on your card is released by your bank, usually within 1–2 business days. A Uniworld advisor will contact you with the best alternative.',
          payment: { status: 'none' }, history: [{ at: now, status: 'new', by: 'customer' }, { at: now, status: 'instant_failed', by: 'app' }],
          staff: { note: `Instant booking failed (${record.instant.error}). Check the liteAPI dashboard for prebook ${hold.prebookId} before offering an alternative.` },
        });
      }
      const { error } = await records().upsert({ id: key, owner, kind: 'request', body: record, created: now }, { onConflict: 'id' });
      if (error) throw error;
      await records().update({ body: { ...hold, done: now } }).eq('id', holdKey);
      inBackground(Promise.all([notifyTeam(record), pushTeam(records, booked
        ? { title: `Booked automatically · ${record.id}`, body: `${record.name} · ${record.title} · ${record.payment.currency} ${Number(record.payment.amount).toLocaleString('en-US')} paid`, url: '/#staff', tag: record.id }
        : { title: `Needs help · ${record.id}`, body: `Instant hotel booking failed for ${record.name} (${record.title}). Contact them with an alternative.`, url: '/#staff', tag: record.id })]));
      return json(forCustomer(record), booked ? 201 : 202, origin);
    }
    if (path[0] === 'instant' && path[1] === 'hotel' && path[2] === 'status' && path[3] && method === 'GET') {
      const row = await requestFor(records, owner, uuidParam(path[3]));
      if (!row?.body?.instant?.bookingId) throw new HttpError('Booking not found.', 404);
      const r = await lite('/bookings/' + encodeURIComponent(row.body.instant.bookingId));
      if (!r.ok) return json(forCustomer(row.body), 200, origin);
      const x = r.json.data, record = { ...row.body, instant: { ...row.body.instant, status: String(x.status ?? row.body.instant.status), confirmation: x.hotelConfirmationCode ? String(x.hotelConfirmationCode) : row.body.instant.confirmation } };
      if (/CANCEL/i.test(record.instant.status) && record.status !== 'cancelled') { record.status = 'cancelled'; record.history = [...(record.history ?? []), { at: Date.now(), status: 'cancelled', by: 'hotel' }]; }
      if (JSON.stringify(record.instant) !== JSON.stringify(row.body.instant)) { record.updated = Date.now(); await records().update({ body: record }).eq('id', row.id); }
      return json(forCustomer(record), 200, origin);
    }
    // Find my booking: the reference plus the phone number or email used on the request.
    if (path[0] === 'requests' && path[1] === 'find' && method === 'POST') {
      const input = await body(req);
      const ref = safe(input.ref, 20).toUpperCase().replace(/[\s_]+/g, '').replace(/^UW(?!-)/, 'UW-');
      if (!/^UW-[A-Z0-9]{6}$/.test(ref)) throw new HttpError('Enter your reference, like UW-7KQ2PX.');
      if (safe(input.contact, 150).length < 5) throw new HttpError('Enter the phone number or email you used on the request.');
      if (!(await lookupAllowed(req, records))) throw new HttpError('Too many tries. Please wait an hour, or call Uniworld.', 429);
      const { data, error } = await records().select('id,owner,body').eq('kind', 'request').eq('body->>id', ref).limit(5);
      if (error) throw error;
      const match = (data ?? []).find((r: any) => contactMatches(r.body, input.contact));
      if (!match) {
        await new Promise((r) => setTimeout(r, 500));
        throw new HttpError('We couldn’t find a request with that reference and phone number or email.', 404);
      }
      if (match.owner !== owner) {
        const { error: linkError } = await records().upsert({ id: owner + ':link:' + match.body.recordId, owner, kind: 'request-link', body: { key: match.id }, created: Date.now() }, { onConflict: 'id' });
        if (linkError) throw linkError;
      }
      return json(forCustomer(match.body), 200, origin);
    }
    if (path[0] === 'requests' && path[1] && method === 'PATCH') {
      const row = await requestFor(records, owner, uuidParam(path[1]));
      if (!row) throw new HttpError('Request not found.', 404);
      const input = await body(req), current = row.body, now = Date.now();
      let record: any;
      if (input.action === 'cancel') {
        if (!['new', 'in_progress'].includes(current.status)) throw new HttpError(current.status === 'cancelled' ? 'This request is already cancelled.' : 'This trip is confirmed. Please contact Uniworld to change or cancel it.', 409);
        if (current.payment?.status === 'paid') throw new HttpError('This trip is paid. Please contact Uniworld to change or cancel it.', 409);
        record = { ...current, status: 'cancelled', updated: now, history: [...(current.history ?? []), { at: now, status: 'cancelled', by: 'customer' }] };
      } else if (input.action === 'payment-sent') {
        // The customer tells the team they paid (for example by bank transfer). The team checks and marks it paid.
        if (current.payment?.status !== 'due') throw new HttpError(current.payment?.status === 'paid' ? 'This payment is already confirmed.' : 'There is no payment due on this request.', 409);
        if (current.payment.customerSent && now - current.payment.customerSent.at < 60000) return json(forCustomer(current), 200, origin);
        record = {
          ...current, updated: now,
          payment: { ...current.payment, customerSent: { at: now, note: safe(input.note, 200).replace(/[\u0000-\u001f]+/g, ' ') } },
          history: [...(current.history ?? []), { at: now, status: 'payment_sent', by: 'customer' }].slice(-40),
        };
        inBackground(Promise.all([notifyTeam(record, 'paid'), pushTeam(records, { title: `Payment sent · ${record.id}`, body: `${record.name} says they paid ${record.payment.currency} ${Number(record.payment.amount).toLocaleString('en-US')}${record.payment.customerSent.note ? ` · “${record.payment.customerSent.note}”` : ''}`, url: '/#staff', tag: record.id + '-paid' })]));
      } else throw new HttpError('Choose what to change.');
      const { error } = await records().update({ body: record }).eq('id', row.id);
      if (error) throw error;
      return json(forCustomer(record), 200, origin);
    }
    if (path[0] === 'quote' && method === 'POST') return json(quote(await body(req)), 200, origin);
    if (path[0] === 'bookings' && !path[1] && method === 'POST') {
      const input = await body(req);
      if (!/^[a-f0-9-]{36}$/.test(input.requestId || '')) throw new HttpError('Please restart checkout.');
      const key = owner + ':booking:' + input.requestId;
      const previous = await records().select('body').eq('id', key).eq('owner', owner).maybeSingle();
      if (previous.data) return json(previous.data.body, 200, origin);
      const q = quote(input), name = safe(input.name, 100), email = safe(input.email, 150);
      if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError('Enter your name and a valid email.');
      if (input.demoConsent !== true) throw new HttpError('Please acknowledge this is a demonstration.');
      const record = { ...q, id: 'UW-DEMO-' + input.requestId.slice(0, 8).toUpperCase(), recordId: input.requestId, name, email, note: safe(input.note, 600), status: 'confirmed', created: Date.now(), payment: 'Demo wallet · no charge', policy: 'Free demo cancellation at any time. No actual supplier reservation or ticket exists.' };
      const { error } = await records().upsert({ id: key, owner, kind: 'booking', body: record, created: record.created }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      const saved = await records().select('body').eq('id', key).maybeSingle();
      return json(saved.data?.body ?? record, 201, origin);
    }
    if (path[0] === 'bookings' && path[1] && method === 'PATCH') {
      const key = owner + ':booking:' + safe(path[1], 40);
      const row = await records().select('body').eq('id', key).eq('owner', owner).maybeSingle();
      if (!row.data) throw new HttpError('Booking not found.', 404);
      const record = { ...row.data.body, status: 'cancelled', cancelled: Date.now(), payment: 'Demo refund complete · no money moved' };
      const { error } = await records().update({ body: record }).eq('id', key).eq('owner', owner);
      if (error) throw error;
      return json(record, 200, origin);
    }
    if (path[0] === 'push' && !path[1] && method === 'POST') {
      const input = await body(req), sub = subscriptionFrom(input.subscription), id = owner + ':push:' + await subId(sub.endpoint);
      const { error } = input.off ? await records().delete().eq('id', id).eq('owner', owner) : await records().upsert({ id, owner, kind: 'push', body: sub, created: Date.now() }, { onConflict: 'id' });
      if (error) throw error;
      return json({ alerts: !input.off }, 200, origin);
    }
    if (path[0] === 'saved-hotels' && method === 'PUT') {
      const hotels = savedHotelsFrom((await body(req)).hotels);
      const { error } = await records().upsert({ id: owner + ':saved-hotels', owner, kind: 'saved-hotels', body: hotels, created: Date.now() }, { onConflict: 'id' });
      if (error) throw error;
      return json({ saved: true, hotels }, 200, origin);
    }
    if (path[0] === 'favorites' && method === 'PUT') {
      const input = await body(req);
      const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter((id: unknown) => stays.some((s) => s.id === id)))] : [];
      const { error } = await records().upsert({ id: owner + ':favorites', owner, kind: 'favorites', body: ids, created: Date.now() }, { onConflict: 'id' });
      if (error) throw error;
      return json({ saved: true }, 200, origin);
    }
    if (path[0] === 'itineraries' && !path[1] && method === 'POST') {
      const input = await body(req), text = safe(input.text, 12000), title = safe(input.title, 150);
      if (!text || !title) throw new HttpError('Create an itinerary first.');
      const record = { id: crypto.randomUUID(), title, text, source: safe(input.source, 30), created: Date.now() };
      const { error } = await records().insert({ id: owner + ':itinerary:' + record.id, owner, kind: 'itinerary', body: record, created: record.created });
      if (error) throw error;
      return json(record, 201, origin);
    }
    if (path[0] === 'itineraries' && path[1] && method === 'DELETE') {
      const { error } = await records().delete().eq('id', owner + ':itinerary:' + safe(path[1], 40)).eq('owner', owner).eq('kind', 'itinerary');
      if (error) throw error;
      return json({ deleted: true }, 200, origin);
    }
    throw new HttpError('Not found.', 404);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('API failure', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ error: status === 500 ? 'We could not complete that request. Please retry.' : (e as Error).message }, status, origin);
  }
});
