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
