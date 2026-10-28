// Online data: weather, location, market quotes/charts, news (RSS), public holidays.
// All requests run in the main process (no CORS, no remote code in the renderer).
import { XMLParser } from 'fast-xml-parser';
import { createRequire } from 'node:module';
import * as db from './db.js';
import * as state from './state.js';

const require = createRequire(import.meta.url);
const iconv = require('iconv-lite');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DaniSuperApp/1.0';

async function fetchRaw(url, { timeout = 15000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally { clearTimeout(t); }
}
const fetchJson = async (url, o) => (await fetchRaw(url, o)).json();

const mem = new Map();
function cached(key, ttlMs, fn, { persist = false } = {}) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return Promise.resolve(hit.v);
  return fn().then((v) => {
    mem.set(key, { t: Date.now(), v });
    if (persist) state.set('cache.' + key, { t: Date.now(), v });
    return v;
  }).catch((e) => {
    // offline fallback: last good value
    if (hit) return { ...hit.v, stale: true };
    const p = persist ? state.get('cache.' + key) : null;
    if (p) return { ...p.v, stale: true, staleAt: p.t };
    throw e;
  });
}
export function clearCache(prefix) { for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k); }

// ---------------- weather (Open-Meteo) ----------------
export { WMO } from '../shared/weather.js';
import { WMO } from '../shared/weather.js';

export function weather(force = false) {
  const loc = db.getSetting('location') || { name: 'Sawangan, Depok', lat: -6.4006, lon: 106.7542 };
  const key = `weather:${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
  if (force) mem.delete(key);
  return cached(key, 15 * 60000, async () => {
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.search = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: '7',
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max'
    }).toString();
    const j = await fetchJson(u.toString());
    const nowH = j.current.time.slice(0, 13);
    let idx = j.hourly.time.findIndex((t) => t.slice(0, 13) >= nowH);
    if (idx < 0) idx = 0;
    const hourly = [];
    for (let i = idx; i < Math.min(j.hourly.time.length, idx + 24); i += 3) {
      hourly.push({ time: j.hourly.time[i], temp: j.hourly.temperature_2m[i], code: j.hourly.weather_code[i], pop: j.hourly.precipitation_probability?.[i] ?? null });
    }
    const daily = j.daily.time.map((t, i) => ({ date: t, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], pop: j.daily.precipitation_probability_max?.[i], sunrise: j.daily.sunrise[i], sunset: j.daily.sunset[i], uv: j.daily.uv_index_max?.[i] }));
    return {
      location: loc, fetchedAt: Date.now(),
      current: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, humidity: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m, code: j.current.weather_code, isDay: j.current.is_day, precip: j.current.precipitation },
      hourly, daily
    };
  }, { persist: true });
}

export async function searchPlace(q) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=id&format=json`;
  const j = await fetchJson(u);
  return (j.results || []).map((r) => ({ name: [r.name, r.admin2 || r.admin1].filter(Boolean).join(', '), detail: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}

export async function reverseGeocode(lat, lon) {
  try {
    const j = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=id`, { headers: { 'User-Agent': 'DaniSuperApp/1.0 (personal desktop app)' } });
    const a = j.address || {};
    const local = a.village || a.suburb || a.neighbourhood || a.town || a.city_district || a.city || a.county;
    const city = a.city || a.town || a.county || a.state;
    return [local, city !== local ? city : null].filter(Boolean).join(', ') || j.display_name;
  } catch { return `${lat.toFixed(3)}, ${lon.toFixed(3)}`; }
}

export async function ipLocation() {
  const j = await fetchJson('https://ipwho.is/');
  if (j.success === false) throw new Error(j.message || 'Gagal mendeteksi lokasi');
  return { name: [j.city, j.region].filter(Boolean).join(', '), lat: j.latitude, lon: j.longitude, approx: true };
}

// ---------------- market (Yahoo Finance chart endpoint, unofficial) ----------------
const RANGE_INTERVAL = { '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk' };

async function yahooChart(symbol, range = '1d') {
  const interval = RANGE_INTERVAL[range] || '1d';
  let lastErr;
  for (const host of ['query1', 'query2']) {
    try {
      const j = await fetchJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
      const r = j.chart?.result?.[0];
      if (!r) throw new Error(j.chart?.error?.description || 'Simbol tidak ditemukan');
      return r;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export function quote(symbol) {
  return cached('q:' + symbol, 60000, async () => {
    const r = await yahooChart(symbol, '1d');
    const m = r.meta;
    const closes = (r.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
    const prev = m.chartPreviousClose ?? m.previousClose;
    const price = m.regularMarketPrice ?? closes[closes.length - 1];
    return {
      symbol: m.symbol, name: m.shortName || m.longName || m.symbol, currency: m.currency, price, prev,
      change: price - prev, changePct: prev ? ((price - prev) / prev) * 100 : 0,
      time: (m.regularMarketTime || 0) * 1000, exchange: m.exchangeName, tz: m.exchangeTimezoneName,
      spark: closes.length > 60 ? closes.filter((_, i) => i % Math.ceil(closes.length / 60) === 0) : closes,
      dayHigh: m.regularMarketDayHigh, dayLow: m.regularMarketDayLow
    };
  }, { persist: true });
}

export async function quotes(symbols) {
  const out = await Promise.all(symbols.map((s) => quote(s).catch((e) => ({ symbol: s, error: e.message }))));
  return out;
}

export function chart(symbol, range = '1mo') {
  return cached(`c:${symbol}:${range}`, range === '1d' ? 60000 : 10 * 60000, async () => {
    const r = await yahooChart(symbol, range);
    const q = r.indicators?.quote?.[0] || {};
    const bars = [];
    (r.timestamp || []).forEach((t, i) => {
      if (q.close?.[i] == null || q.open?.[i] == null) return;
      bars.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] || 0 });
    });
    return { symbol, range, meta: { currency: r.meta.currency, name: r.meta.shortName || r.meta.longName, tz: r.meta.exchangeTimezoneName, gmtoffset: r.meta.gmtoffset }, bars };
  });
}

export async function searchSymbol(q) {
  const j = await fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&lang=id-ID&region=ID`);
  return (j.quotes || []).filter((x) => x.symbol).map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchDisp || x.exchange, type: x.quoteType }));
}

// ---------------- news (RSS) ----------------
export const DEFAULT_FEEDS = [
  { id: 'cnbc-market', cat: 'fin', name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss', on: true },
  { id: 'detik-fin', cat: 'fin', name: 'detikFinance', url: 'https://finance.detik.com/rss', on: true },
  { id: 'antara-eko', cat: 'fin', name: 'Antara Ekonomi', url: 'https://www.antaranews.com/rss/ekonomi.xml', on: true },
  { id: 'cnn-eko', cat: 'fin', name: 'CNN Indonesia Ekonomi', url: 'https://www.cnnindonesia.com/ekonomi/rss', on: true },
  { id: 'tempo-bisnis', cat: 'fin', name: 'Tempo Bisnis', url: 'https://rss.tempo.co/bisnis', on: false },
  { id: 'republika-eko', cat: 'fin', name: 'Republika Ekonomi', url: 'https://www.republika.co.id/rss/ekonomi', on: false },
  { id: 'okezone-eko', cat: 'fin', name: 'Okezone Ekonomi', url: 'https://sindikasi.okezone.com/index.php/rss/11/RSS2.0', on: false },
  { id: 'cnbc-news', cat: 'id', name: 'CNBC Indonesia News', url: 'https://www.cnbcindonesia.com/news/rss', on: true },
  { id: 'antara-terkini', cat: 'id', name: 'Antara', url: 'https://www.antaranews.com/rss/terkini.xml', on: true },
  { id: 'detik-news', cat: 'id', name: 'detikNews', url: 'https://news.detik.com/rss', on: true },
  { id: 'cnn-nasional', cat: 'id', name: 'CNN Indonesia Nasional', url: 'https://www.cnnindonesia.com/nasional/rss', on: true },
  { id: 'tempo-nasional', cat: 'id', name: 'Tempo Nasional', url: 'https://rss.tempo.co/nasional', on: false }
];

export function feeds() { return db.getSetting('feeds') || DEFAULT_FEEDS; }

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: false, textNodeName: '#text' });
const txt = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v));
const stripHtml = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function fetchFeed(f) {
  const r = await fetchRaw(f.url, { timeout: 12000 });
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.subarray(0, 200).toString('latin1');
  const enc = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || head.match(/encoding="([\w-]+)"/i)?.[1] || 'utf-8';
  const body = iconv.encodingExists(enc) ? iconv.decode(buf, enc) : buf.toString('utf8');
  const j = xml.parse(body);
  let items = j?.rss?.channel?.item || j?.feed?.entry || [];
  if (!Array.isArray(items)) items = [items];
  return items.slice(0, 25).map((it) => {
    const link = typeof it.link === 'object' ? (it.link['@href'] || txt(it.link)) : txt(it.link);
    const img = it.enclosure?.['@url'] || it['media:content']?.['@url'] || it['media:thumbnail']?.['@url'] || (txt(it.description).match(/<img[^>]+src="([^"]+)"/i)?.[1]) || null;
    const date = new Date(txt(it.pubDate) || txt(it.published) || txt(it.updated) || Date.now());
    return { id: link, title: stripHtml(txt(it.title)), link, source: f.name, feed: f.id, cat: f.cat, img, date: isNaN(date) ? Date.now() : date.getTime(), summary: stripHtml(txt(it.description)).slice(0, 220) };
  }).filter((x) => x.title && /^https?:\/\//.test(x.link));
}

export function news(cat = 'fin', force = false) {
  const key = 'news:' + cat;
  if (force) mem.delete(key);
  return cached(key, 15 * 60000, async () => {
    const list = feeds().filter((f) => f.on && f.cat === cat);
    const results = await Promise.allSettled(list.map(fetchFeed));
    const items = [], errors = [];
    results.forEach((r, i) => (r.status === 'fulfilled' ? items.push(...r.value) : errors.push(list[i].name)));
    if (!items.length && errors.length) throw new Error('Semua sumber gagal');
    const seen = new Set();
    const dedup = items.sort((a, b) => b.date - a.date).filter((x) => {
      const k = x.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 80);
    return { items: dedup, errors, fetchedAt: Date.now() };
  }, { persist: true });
}

// ---------------- holidays (Google public calendar ICS, Bahasa Indonesia) ----------------
const HOLIDAY_ICS = 'https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics';

export function holidays() {
  return cached('holidays', 24 * 3600000, async () => {
    const r = await fetchRaw(HOLIDAY_ICS);
    const text = (await r.text()).replace(/\r?\n[ \t]/g, '');
    const out = [];
    for (const blk of text.split('BEGIN:VEVENT').slice(1)) {
      const g = (k) => blk.match(new RegExp('^' + k + '(?:;[^:]*)?:(.*)$', 'm'))?.[1]?.trim();
      const ds = g('DTSTART'); const de = g('DTEND');
      if (!ds) continue;
      const d = `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
      let endIncl = d;
      if (de) {
        const e = new Date(+de.slice(0, 4), +de.slice(4, 6) - 1, +de.slice(6, 8) - 1);
        endIncl = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      }
      const desc = (g('DESCRIPTION') || '').replace(/\\n/g, ' ');
      out.push({ id: 'hol-' + d + '-' + (g('UID') || '').slice(0, 8), title: (g('SUMMARY') || '').replace(/\\,/g, ','), start: d, end: endIncl, observance: /perayaan|peringatan|observance/i.test(desc), tentative: /tentatif/i.test(desc) });
    }
    return { items: out };
  }, { persist: true });
}
