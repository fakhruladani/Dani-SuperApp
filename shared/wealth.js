// Total Wealth: each row is a dated value of one asset (category + name).
// Only the newest row per asset counts; older rows are history. Debts are negative values.
import { MONTH_SHORT, toLocalDate } from './recur.js';

export const assetKey = (r) => `${String(r.category || '').trim().toLowerCase()}|${String(r.name || '').trim().toLowerCase()}`;
const newer = (a, b) => a.date > b.date || (a.date === b.date && (a.updated_at || '') > (b.updated_at || ''));

export function latestByAsset(rows, asOf = null) {
  const m = new Map();
  for (const r of rows) {
    if (!r.date || (asOf && r.date > asOf)) continue;
    const k = assetKey(r);
    const cur = m.get(k);
    if (!cur || newer(r, cur)) m.set(k, r);
  }
  return m;
}

const netOf = (latest) => [...latest.values()].reduce((s, r) => s + (Number(r.value) || 0), 0);

export function wealthSummary(rows, today = new Date()) {
  const latest = latestByAsset(rows);
  const currentIds = new Set([...latest.values()].map((r) => r.id));
  const cats = new Map();
  let assets = 0, debts = 0;
  for (const r of latest.values()) {
    const v = Number(r.value) || 0;
    const name = String(r.category || '').trim() || 'Lainnya';
    const k = name.toLowerCase();
    const c = cats.get(k) || { name, total: 0, n: 0, newest: '' };
    if (r.date >= c.newest) { c.name = name; c.newest = r.date; }
    c.total += v; c.n += 1;
    cats.set(k, c);
    if (v >= 0) assets += v; else debts += v;
  }
  const categories = [...cats.values()].sort((a, b) => b.total - a.total);

  // net worth at the end of each of the last 12 months (current month = today)
  const trend = [];
  const first = rows.reduce((m, r) => (r.date && (!m || r.date < m) ? r.date : m), null);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0); // last day of month
    const end = i === 0 ? toLocalDate(today) : toLocalDate(d);
    if (!first || end < first) continue;
    trend.push({ ym: end.slice(0, 7), label: MONTH_SHORT[d.getMonth()], end, net: netOf(latestByAsset(rows, end)) });
  }
  const prevEnd = toLocalDate(new Date(today.getFullYear(), today.getMonth(), 0));
  const prev = first && prevEnd >= first ? { date: prevEnd, net: netOf(latestByAsset(rows, prevEnd)) } : null;
  return { net: assets + debts, assets, debts, categories, currentIds, trend, prev };
}

export const fmtDateID = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

// ---------- spreadsheet view: one row per date, one column per account ----------
// Each cell is a wealth row { date, category, name, value }. A cell left empty on a date
// carries the account's previous value forward (shown as "carried"), so a snapshot only
// needs the accounts that changed. A row's total = sum of every account's value at that date.

/** cols: saved column order [{ name, category }]; accounts found only in the data are appended. */
export function wealthMatrix(rows, cols = []) {
  const columns = [];
  const byKey = new Map();
  const addCol = (name, category) => {
    const c = { name: String(name || '').trim(), category: String(category || '').trim() };
    if (!c.name) return null;
    const key = assetKey(c);
    if (!byKey.has(key)) { const col = { ...c, key }; byKey.set(key, col); columns.push(col); }
    return byKey.get(key);
  };
  for (const c of cols || []) addCol(c.name, c.category);
  const sorted = rows.filter((r) => r.date && String(r.name || '').trim())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.updated_at || '').localeCompare(b.updated_at || ''));
  for (const r of sorted) addCol(r.name, r.category);
  const own = new Map(); // date|key -> newest row
  for (const r of sorted) own.set(r.date + '|' + assetKey(r), r);
  const dates = [...new Set(sorted.map((r) => r.date))];
  const last = new Map();
  const snaps = dates.map((date) => {
    const cells = {};
    let total = 0, assets = 0, debts = 0;
    for (const c of columns) {
      const r = own.get(date + '|' + c.key);
      if (r) last.set(c.key, Number(r.value) || 0);
      const v = last.has(c.key) ? last.get(c.key) : null;
      cells[c.key] = { value: v, row: r || null, carried: !r && v != null };
      if (v != null) { total += v; if (v >= 0) assets += v; else debts += v; }
    }
    return { date, cells, total, assets, debts };
  });
  snaps.forEach((s, i) => {
    const p = snaps[i - 1];
    s.delta = p ? s.total - p.total : null;
    s.pct = p && p.total ? ((s.total - p.total) / Math.abs(p.total)) * 100 : null;
  });
  return { columns, snaps };
}

// ---------- import from a spreadsheet (CSV / TSV / text copied from Google Sheets or Excel) ----------
function splitRows(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** "Rp1.430.807", "-Rp 2.500", "(1.200.000)", "1,430,807.50", "1.430.807,50" -> integer rupiah; '' -> null */
export function parseMoney(s) {
  let t = String(s ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  const neg = /^[-−(]|^rp\s*[-−]/i.test(t);
  t = t.replace(/rp|idr|\s|[()−-]/gi, '');
  if (!/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  let intPart = t;
  if (lastDot >= 0 && lastComma >= 0) intPart = t.slice(0, Math.max(lastDot, lastComma)); // the later one is the decimal mark
  else if (lastComma >= 0 && !/^\d{1,3}(,\d{3})+$/.test(t)) intPart = t.slice(0, lastComma); // "1250,5"
  else if (lastDot >= 0 && !/^\d{1,3}(\.\d{3})+$/.test(t)) intPart = t.slice(0, lastDot); // "1250.5"
  const n = Number(intPart.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const pad2 = (n) => String(n).padStart(2, '0');
function dateParts(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return { ymd: [+m[1], +m[2], +m[3]] };
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t);
  if (m) return { a: +m[1], b: +m[2], y: +m[3] < 100 ? 2000 + +m[3] : +m[3] };
  return null;
}
const validDate = (y, mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(y, mo, 0).getDate();

/**
 * Reads a table whose first column is a date and whose other columns are accounts.
 * Total/Jumlah columns are skipped (totals are computed). order: 'auto' | 'dmy' | 'mdy'.
 * Returns { columns, rows: [{ date, values: { name: value } }], order, skipped }.
 */
export function parseWealthTable(text, order = 'auto') {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const table = splitRows(src, delim).filter((r) => r.some((c) => c));
  if (!table.length) return { columns: [], rows: [], order: 'dmy', skipped: 0 };
  const isHeader = (r) => !dateParts(r[0]) && r.slice(1).some((c) => c && parseMoney(c) == null);
  const head = isHeader(table[0]) ? table[0] : null;
  const body = head ? table.slice(1) : table;
  const width = Math.max(...table.map((r) => r.length));
  const names = Array.from({ length: width }, (_, i) => (head?.[i] || '').trim() || (i ? `Kolom ${i + 1}` : ''));
  const keep = names.map((n, i) => i > 0 && !/^(total|jumlah|grand total|total wealth|net)$/i.test(n) && body.some((r) => (r[i] || '').trim()));
  const parts = body.map((r) => dateParts(r[0]));
  let ord = order;
  if (ord === 'auto') {
    const dm = parts.filter((p) => p && !p.ymd);
    ord = dm.some((p) => p.b > 12) ? 'mdy' : dm.some((p) => p.a > 12) ? 'dmy' : 'dmy';
  }
  const rows = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const p = parts[i];
    let y, mo, d;
    if (p?.ymd) [y, mo, d] = p.ymd;
    else if (p) { y = p.y; [mo, d] = ord === 'mdy' ? [p.a, p.b] : [p.b, p.a]; }
    if (!p || !validDate(y, mo, d)) { if (r.some((c) => c)) skipped++; return; }
    const values = {};
    names.forEach((n, j) => { if (keep[j]) { const v = parseMoney(r[j]); if (v != null) values[n] = v; } });
    if (Object.keys(values).length) rows.push({ date: `${y}-${pad2(mo)}-${pad2(d)}`, values });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { columns: names.filter((_, j) => keep[j]), rows, order: ord, skipped };
}
