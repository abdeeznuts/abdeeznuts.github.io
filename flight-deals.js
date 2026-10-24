// Cheaper ways to fly (the tricks sites like Skiplagged use), for one-way trips:
// - Split tickets: two separate one-way tickets through a big hub (Dubai, Doha, Istanbul…) with
//   at least 3 hours to change. A Uniworld advisor can book both tickets.
// - Hidden city: a ticket to a city past yours that changes planes at yours; you leave the airport
//   there. Legal, but against airline ticket rules, so the app shows these with clear warnings and a
//   link to book them yourself. Uniworld never issues them.
// Each search runs only when the traveler asks for it (it uses live searches).
import { fetchLive, money } from './live-rates.js';
import { beyondAirports, hubAirports, airportByCode, labelOf } from './places.js';

let d = null; // esc, icon, state, openRequest, toast
export function initDeals(deps) { d = deps; }

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clock = (s) => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
const dur = (min) => (min ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : '');
const cityOf = (code) => { const w = airportByCode(code); return w ? (w.metro ? w.city : w.city || w.name) : code; };
const labelFor = (code) => { const w = airportByCode(code); return w ? labelOf(w) : code; };
const nextDay = (a, b) => a && b && b.slice(0, 10) > a.slice(0, 10);

// The cheapest normal one-way fare already on screen, to show what each trick saves.
function normalCheapest(fs, nonstopOnly = false) {
  const list = (fs.data?.options || []).filter((o) => !nonstopOnly || o.stops === 0);
  return list.length ? Math.min(...list.map((o) => o.price)) : null;
}

export function dealsHtml(fs) {
  const e = d.esc;
  if (fs.end) {
    return `<section class="lf-deals"><span class="eyebrow">CHEAPER WAYS TO FLY</span><p>Split tickets and hidden-city fares work on one-way trips. Two one-way tickets are sometimes cheaper than a return, too.</p><button class="outline-button compact" data-lf="one-way">Search one way</button></section>`;
  }
  const deals = fs.deals || (fs.deals = { split: null, hidden: null, ok: false });
  return `<section class="lf-deals" aria-labelledby="lfDealsTitle"><span class="eyebrow">CHEAPER WAYS TO FLY</span><h3 id="lfDealsTitle">Tricks that can cut the fare</h3>
    <div class="lf-tricks">
      <article class="lf-trick"><h4>Split tickets</h4><p>Two separate tickets that change planes in a big hub like ${e(hubSample(fs))}. Often cheaper, and your Uniworld advisor can book both.</p>${trickBody(fs, 'split', deals.split)}</article>
      <article class="lf-trick"><h4>Hidden-city fares</h4><p>A ticket to a city past ${e(cityOf(fs.b.code))} that stops there on the way. You get off and skip the last flight. Cheaper, but risky, and you book it yourself.</p>${trickBody(fs, 'hidden', deals.hidden)}</article>
    </div></section>`;
}
function hubSample(fs) {
  const hubs = hubAirports(fs.a.code, fs.b.code, 2).map(cityOf);
  return hubs.length ? hubs.join(' or ') : 'Dubai or Doha';
}

function trickBody(fs, kind, st) {
  const label = kind === 'split' ? 'Find split tickets' : 'Find hidden-city fares';
  if (!st) return `<button class="outline-button compact" data-lf="deal" data-v="${kind}">${label}</button>`;
  if (st.status === 'loading') return `<p class="ls-wait" role="status">${kind === 'split' ? 'Checking flights through the hubs on your way…' : 'Checking tickets to cities past yours…'}</p>`;
  if (st.status === 'none') return `<p class="lf-deal-none">${kind === 'split' ? 'There’s no big hub on the way for this route.' : 'There are no cities past yours that tickets usually continue to.'}</p>`;
  if (st.status === 'error') return `<p class="lf-deal-none">${d.esc(st.message || 'Couldn’t check right now.')}</p><button class="text-button" data-lf="deal" data-v="${kind}">Try again</button>`;
  return kind === 'split' ? splitList(fs, st.res) : hiddenList(fs, st.res);
}

// ---------- Split tickets ----------
function splitList(fs, res) {
  const e = d.esc, cur = res.currency || d.state.currency, n = Number(fs.travelers) || 1, cheapest = normalCheapest(fs);
  let combos = res.data?.combos || [];
  if (cheapest) combos = combos.filter((c) => c.total < cheapest);
  fs.deals.splitShown = combos;
  if (!combos.length) return `<p class="lf-deal-none">${res.data?.combos?.length ? 'None of the split tickets beats the normal fare right now.' : res.notice === 'limit' ? 'Live checks are paused for this month. Ask an advisor instead.' : 'No split tickets with a safe connection for this day.'}</p>`;
  return `<div class="lf-warn" role="note"><b>Good to know</b><ul>
      <li>These are two separate tickets. If the first flight is late and you miss the second, the second airline doesn’t have to rebook you. We only show connections with at least 3 hours.</li>
      <li>You may need to collect your bags and check in again at the stopover, so check whether you need a transit visa there.</li>
      <li>A Uniworld advisor books both tickets and confirms the final price with you.</li></ul></div>
    <div class="lf-list">${combos.map((c, i) => `<article class="lf-card lf-split">
      <div class="lf-top"><span>${e([...new Set([...c.first.airlines, ...c.second.airlines])].join(' + ') || 'Airlines')}</span>${cheapest ? `<span class="lf-badge lf-save">Save ${money(cheapest - c.total, cur)}</span>` : ''}<span class="lf-badge">via ${e(cityOf(c.hub))}</span></div>
      ${ticketRow('Ticket 1', c.first)}
      <p class="lf-connect">${e(dur(c.connectMin))} in ${e(labelFor(c.hub))} to change planes</p>
      ${ticketRow('Ticket 2', c.second)}
      <div class="lf-bottom"><div><strong>${money(c.total, cur)}</strong><small>2 tickets · one way · ${n > 1 ? `total for ${n} travelers` : 'per person'}</small></div><button class="dark-button compact" data-lf="split-book" data-i="${i}">Book both with Uniworld</button></div>
    </article>`).join('')}</div>`;
}
function ticketRow(label, o) {
  const e = d.esc, nums = o.legs.map((l) => l.flightNumber).filter(Boolean).join(' + ');
  return `<div class="lf-ticket"><small>${label}${nums ? ` · ${e(nums)}` : ''}</small><div class="lf-route">
    <div><b>${e(clock(o.depart?.time))}</b><small>${e(o.depart?.id || '')}</small></div>
    <div class="lf-mid"><small>${e(dur(o.durationMin))}</small><i aria-hidden="true"></i><small>${o.stops === 0 ? 'Nonstop' : plural(o.stops, 'stop')}</small></div>
    <div><b>${e(clock(o.arrive?.time))}${nextDay(o.depart?.time, o.arrive?.time) ? '<sup>+1</sup>' : ''}</b><small>${e(o.arrive?.id || '')}</small></div></div></div>`;
}
function bookSplit(fs, c) {
  const from = labelFor(fs.a.code), to = labelFor(fs.b.code), n = Number(fs.travelers) || 1, cur = fs.deals.split?.res?.currency || d.state.currency;
  const t = (o) => `${o.legs.map((l) => l.flightNumber).filter(Boolean).join('+') || o.airlines.join('+')} ${o.depart?.id} ${clock(o.depart?.time)} → ${o.arrive?.id} ${clock(o.arrive?.time)}`;
  d.openRequest({
    kind: 'flight', from, to, start: fs.start, end: '', travelers: n, cabin: fs.cabin, oneWay: true,
    title: `${from} → ${to}`, details: `Split ticket via ${cityOf(c.hub)} · ${fs.cabin}`,
    seen: { amount: c.total, currency: cur, source: 'Google Flights', checkedAt: fs.deals.split?.res?.fetchedAt, per: n > 1 ? 'trip' : 'person', airline: [...new Set([...c.first.airlines, ...c.second.airlines])].join(' + ').slice(0, 60), stops: c.first.stops + c.second.stops + 1 },
    chosen: `SPLIT TICKET via ${c.hub} (2 separate tickets) · Ticket 1: ${t(c.first)} · ${dur(c.connectMin)} to connect · Ticket 2: ${t(c.second)}`.slice(0, 300),
  });
}

// ---------- Hidden city ----------
function hiddenList(fs, res) {
  const e = d.esc, cur = res.currency || d.state.currency, n = Number(fs.travelers) || 1, ok = fs.deals.ok;
  const cheapest = normalCheapest(fs), nonstop = normalCheapest(fs, true);
  // A ticket that flies nonstop to your stop is compared with the cheapest nonstop ticket.
  let deals = (res.data?.deals || []).map((x) => (x.getOff.index === 0 && nonstop ? { ...x, ref: nonstop, refText: 'the cheapest nonstop ticket' } : { ...x, ref: cheapest, refText: 'the cheapest ticket' }));
  if (cheapest) deals = deals.filter((x) => !x.ref || x.price < x.ref);
  if (!deals.length) return `<p class="lf-deal-none">${res.data?.deals?.length ? 'None of them beats the normal fare right now.' : res.notice === 'limit' ? 'Live checks are paused for this month. Ask an advisor instead.' : 'No hidden-city fares for this day.'}</p>`;
  const link = res.data?.link;
  return `<div class="lf-warn lf-warn-strong" role="note"><b>Read this before you book</b><ul>
      <li><b>Carry-on bag only.</b> Checked bags travel to the ticket’s final city.</li>
      <li><b>One way only.</b> When you skip a flight, the airline cancels the rest of the ticket, including any return.</li>
      <li>Airlines forbid this in their ticket rules. They can cancel the booking, charge you the fare difference or close your frequent-flyer account. Don’t add a frequent-flyer number.</li>
      <li>If the airline changes the route or the stop, you may be flown to the final city.</li>
      <li>Uniworld can’t issue these tickets. You book directly with the airline, at your own risk.</li></ul>
      <label class="lf-ok"><input type="checkbox" data-lf="deal-ok" ${ok ? 'checked' : ''}/> I understand the risks</label></div>
    <div class="lf-list">${deals.map((x) => hiddenCard(x, fs, cur, n, ok, link)).join('')}</div>`;
}
function hiddenCard(x, fs, cur, n, ok, link) {
  const e = d.esc, k = x.getOff.index;
  const toStop = x.legs.slice(0, k + 1).reduce((s, l) => s + (l.durationMin || 0), 0) + x.layovers.slice(0, k).reduce((s, l) => s + (l.durationMin || 0), 0);
  const nums = x.legs.map((l) => l.flightNumber).filter(Boolean).join(' + ');
  return `<article class="lf-card lf-hidden">
    <div class="lf-top"><span>${e(x.airlines.join(' + ') || 'Airline')}</span>${x.ref ? `<span class="lf-badge lf-save">Save ${money(x.ref - x.price, cur)}</span>` : ''}</div>
    <div class="lf-route">
      <div><b>${e(clock(x.depart?.time))}</b><small>${e(x.depart?.id || '')}</small></div>
      <div class="lf-mid"><small>${e(dur(toStop))}</small><i aria-hidden="true"></i><small>${k === 0 ? 'Nonstop to your stop' : plural(k, 'stop')} · ticket ends in ${e(cityOf(x.finalStop))}</small></div>
      <div><b>${e(clock(x.getOff.time))}${nextDay(x.depart?.time, x.getOff.time) ? '<sup>+1</sup>' : ''}</b><small>${e(x.getOff.at)} · get off</small></div>
    </div>
    <div class="lf-bottom"><div><strong>${money(x.price, cur)}</strong><small>one way · ${n > 1 ? `total for ${n} travelers` : 'per person'} · ticket to ${e(x.finalStop)}</small>${x.ref ? `<small>${money(x.ref - x.price, cur)} less than ${x.refText}</small>` : ''}</div>
      ${ok && link ? `<a class="dark-button compact" href="${e(link)}" target="_blank" rel="noopener noreferrer">Book it yourself ↗</a>` : '<span class="lf-deal-lock">Tick “I understand” first</span>'}</div>
    <details class="lf-details"><summary>Flights on this ticket</summary><ol>${x.legs.map((l, i) => `<li class="${i > k ? 'lf-skip' : ''}"><b>${e(clock(l.from?.time))} ${e(l.from?.id || '')} → ${e(clock(l.to?.time))} ${e(l.to?.id || '')}</b><small>${[l.airline, l.flightNumber, dur(l.durationMin)].filter(Boolean).map(e).join(' · ')}${i === k ? ' · <b>get off here</b>' : i > k ? ' · you skip this flight' : ''}</small></li>`).join('')}</ol>
      <p class="small-print">On Google Flights, choose the ${e(x.airlines.join(' + '))} flight${nums ? ` ${e(nums)}` : ''} to ${e(labelFor(x.finalStop))} leaving at ${e(clock(x.depart?.time))}.</p></details>
  </article>`;
}

// ---------- Running the searches ----------
export async function runDeal(el, fs, kind, paint) {
  fs.deals = fs.deals || { split: null, hidden: null, ok: false };
  const base = { from: fs.fromIds, depart: fs.start, adults: Number(fs.travelers) || 1, cabin: fs.cabin, currency: d.state.currency };
  let body;
  if (kind === 'split') {
    const hubs = hubAirports(fs.a.code, fs.b.code);
    if (!hubs.length) { fs.deals.split = { status: 'none' }; paint(); return; }
    body = { kind: 'split-ticket', ...base, to: fs.toIds, hubs: hubs.join(',') };
  } else {
    const beyond = beyondAirports(fs.a.code, fs.b.code);
    if (!beyond.length) { fs.deals.hidden = { status: 'none' }; paint(); return; }
    body = { kind: 'hidden-city', ...base, to: beyond.join(','), target: fs.toIds };
  }
  fs.deals[kind] = { status: 'loading' };
  paint();
  try {
    const res = await fetchLive(body);
    if (el._flights !== fs) return;
    fs.deals[kind] = res.notice === 'unavailable' && !res.data ? { status: 'error', message: 'Live prices didn’t respond. Please try again.' } : { status: 'ready', res };
  } catch (ex) {
    if (el._flights !== fs) return;
    fs.deals[kind] = { status: 'error', message: ex.message };
  }
  paint();
}

// Clicks inside the panel. Returns true when it handled the click.
export function dealAction(b, el, fs, paint) {
  const a = b.dataset.lf;
  if (a === 'deal') { runDeal(el, fs, b.dataset.v, paint); return true; }
  if (a === 'deal-ok') { fs.deals.ok = b.checked; paint(); return true; }
  if (a === 'split-book') { const c = fs.deals?.splitShown?.[Number(b.dataset.i)]; if (c) bookSplit(fs, c); return true; }
  return false;
}
