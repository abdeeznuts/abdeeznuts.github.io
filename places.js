// Every airport in the world with scheduled flights (OurAirports data, public domain),
// loaded the first time someone searches. Cities with several airports can be searched
// together ("London · all airports"). The same list suggests cities for hotel searches.
let world = null;
let loading = null;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loadWorld() {
  if (world) return Promise.resolve(world);
  if (!loading) {
    loading = fetch('/airports.json')
      .then((r) => { if (!r.ok) throw new Error('airports'); return r.json(); })
      .then((j) => (world = build(j)))
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

function build(j) {
  const countries = j.c || {};
  const list = [], byCode = new Map(), cities = new Map();
  for (const [code, city, cc, ids] of j.m || []) {
    const e = { code, ids, metro: true, city, name: 'All airports', country: countries[cc] || cc, cc, rank: -1 };
    e.key = fold(`${code} ${city} ${e.country} all airports`);
    list.push(e); byCode.set(code, e);
  }
  for (const [code, name, city, cc, rank] of j.a || []) {
    const e = { code, ids: code, metro: false, city: city || name, name, country: countries[cc] || cc, cc, rank };
    e.key = fold(`${code} ${e.city} ${name} ${e.country}`);
    list.push(e); byCode.set(code, e);
    // Cities for hotel searches: one entry per city, from its biggest airport.
    const cityKey = fold(e.city) + '|' + cc;
    if (e.city && rank < 2 && !cities.has(cityKey)) cities.set(cityKey, { city: e.city.replace(/\s*\(.*\)$/, ''), country: e.country, rank, key: fold(`${e.city} ${e.country}`) });
  }
  return { list, byCode, cities: [...cities.values()] };
}

export const worldReady = () => !!world;
export const airportByCode = (code) => world?.byCode.get(String(code || '').trim().toUpperCase()) || null;

// "London Heathrow (LHR)", "New York John F. Kennedy (JFK)", "London · all airports (LON)"
export function labelOf(e) {
  if (e.metro) return `${e.city} · all airports (${e.code})`;
  const name = !e.city || fold(e.name).includes(fold(e.city).split(',')[0]) ? e.name : `${e.city} ${e.name}`;
  return `${name} (${e.code})`;
}

export function searchAirports(text, limit = 8) {
  if (!world) return [];
  const q = fold(text).replace(/\(([a-z]{3})\)\s*$/, '$1').trim();
  if (!q) return [];
  const words = q.split(/[\s,()·.-]+/).filter(Boolean);
  const scored = [];
  for (const e of world.list) {
    let score;
    if (e.code.toLowerCase() === q) score = 100;
    else if (fold(e.city).startsWith(q)) score = 80;
    else if (fold(e.name).startsWith(q)) score = 70;
    else if (words.every((w) => e.key.includes(w))) score = e.key.split(' ').some((t) => t.startsWith(words[0])) ? 50 : 30;
    else continue;
    scored.push([score + (e.metro ? 6 : (2 - e.rank) * 2), e]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].rank - b[1].rank || a[1].code.localeCompare(b[1].code));
  return scored.slice(0, limit).map((x) => x[1]);
}

export function searchCities(text, extra = [], limit = 8) {
  const q = fold(text).trim();
  if (!q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  const own = extra.filter((p) => fold(p.label).startsWith(q) || fold(p.sub || '').includes(q)).map((p) => ({ value: p.label, title: p.label, sub: p.sub || '', score: 120 }));
  const found = [];
  for (const c of world?.cities || []) {
    let score;
    if (fold(c.city).startsWith(q)) score = 80;
    else if (words.every((w) => c.key.includes(w))) score = 40;
    else continue;
    found.push({ value: `${c.city}, ${c.country}`, title: c.city, sub: c.country, score: score + (1 - c.rank) * 5 });
  }
  found.sort((a, b) => b.score - a.score);
  const seen = new Set(own.map((o) => fold(o.value)));
  return [...own, ...found.filter((f) => !seen.has(fold(f.title)) && !seen.has(fold(f.value)))].slice(0, limit);
}

// ---------- Suggestions under a text box ----------
function attach(input, find, render, valueOf) {
  if (!input || input.dataset.picker) return;
  input.dataset.picker = '1';
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const box = document.createElement('ul');
  box.className = 'ap-list';
  box.hidden = true;
  box.setAttribute('role', 'listbox');
  box.id = (input.id || input.name || 'place') + '-suggestions-' + Math.random().toString(36).slice(2, 7);
  input.setAttribute('aria-controls', box.id);
  input.insertAdjacentElement('afterend', box);
  input.parentElement.classList.add('ap-host');
  let items = [], active = -1, seq = 0;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = () => {
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((it, i) => `<li role="option" id="${box.id}-${i}" data-i="${i}" class="${i === active ? 'is-active' : ''}" aria-selected="${i === active}">${render(it)}</li>`).join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${box.id}-${active}`);
  };
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    input.value = valueOf(it);
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  input.addEventListener('focus', () => { loadWorld(); });
  input.addEventListener('input', async () => {
    const mine = ++seq;
    await loadWorld();
    if (mine !== seq) return;
    items = find(input.value);
    active = items.length ? 0 : -1;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 180));
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) choose(Number(li.dataset.i)); });
}

export function attachAirportPicker(input) {
  attach(input, (v) => searchAirports(v, 8),
    (e) => `<span class="ap-main"><b>${esc(e.metro ? e.city : e.city || e.name)}</b><small>${esc(e.metro ? 'All airports' : e.name)} · ${esc(e.country)}</small></span><code>${esc(e.code)}</code>`,
    labelOf);
}

// Hotel destinations: the app's own places first (Makkah near the Haram…), then any city in the world.
export function attachCityPicker(input, places = []) {
  attach(input, (v) => searchCities(v, places, 8),
    (c) => `<span class="ap-main"><b>${esc(c.title)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>`,
    (c) => c.value);
}
