// Google Sheets -> transactions. The sheet is filled by a chat assistant ("Jajan 10rb" on WhatsApp ->
// one row) and read through a small Apps Script web app that only answers with the secret key, so the
// sheet stays private (script: build-res/gsheet-apps-script.gs).
//
// Pure functions here (parsing, mapping, the import decision); fetching and the database live in
// electron/gsheet.js, which the desktop app and the Android app both run.
import { guessCategory, normText } from './categorize.js';

// header names (lower case) per field; the first column that matches wins
const HEADERS = {
  id: ['id'],
  time: ['waktu', 'tanggal', 'tgl', 'date', 'time', 'timestamp'],
  description: ['keterangan', 'deskripsi', 'transaksi', 'description', 'item'],
  amount: ['nominal', 'jumlah', 'amount', 'harga', 'nilai'],
  kind: ['jenis', 'tipe', 'type', 'kind'],
  category: ['kategori', 'category']
};

export function mapColumns(header) {
  const h = (header || []).map((x) => String(x || '').trim().toLowerCase());
  const map = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const i = h.findIndex((x) => names.includes(x));
    if (i >= 0) map[field] = i;
  }
  return map;
}

/** "10rb", "10k", "1,5jt", "1.5 juta", "Rp10.000", "10.000,50", 10000 -> integer rupiah (or NaN). */
export function parseAmount(v) {
  if (typeof v === 'number') return Math.round(Math.abs(v));
  let s = String(v ?? '').toLowerCase().replace(/rp\.?/g, '').replace(/\s+/g, '').replace(/^-/, '');
  if (!s) return NaN;
  const m = /^([\d.,]+)(rb|ribu|k|jt|juta|m|miliar|milyar)?$/.exec(s);
  if (!m) return NaN;
  let num = m[1];
  const mult = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9, milyar: 1e9 }[m[2]] || 1;
  if (mult > 1) num = num.replace(',', '.'); // 1,5jt
  else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, ''); // 10.000 / 10,000
  else if (/^\d+,\d{1,2}$/.test(num)) num = num.replace(',', '.'); // 10000,50
  else num = num.replace(/,/g, '');
  const n = Number(num) * mult;
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/** "2026-11-25 20:45:12", "2026-11-25", "25/11/2026 20:45", ISO -> "2026-11-25" (or null). */
export function parseDate(v) {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function parseKind(v) {
  const s = normText(v);
  if (/^(masuk|pemasukan|in|income|kredit)$/.test(s)) return 'in';
  if (/^(keluar|pengeluaran|out|expense|debit)$/.test(s)) return 'out';
  return 'out'; // a chat note like "Jajan 10rb" is spending unless it says otherwise
}

/** Small stable hash (FNV-1a) of the values a row brings into the app. */
export function rowHash(t) {
  const s = [t.date, t.description, t.amount, t.kind, t.category_id || ''].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const safeId = (s) => String(s).trim().replace(/[^\w.-]+/g, '_').slice(0, 80);

/**
 * payload: { header: [...], rows: [[...], ...] } from the Apps Script (or CSV-like arrays).
 * cats: fin_categories rows; history: fin_tx rows (for the category guess); since: "YYYY-MM-DD" or ''.
 * Returns { items: [{ id, date, description, amount, kind, category_id, hash, row }], skipped: [{ row, reason }] }.
 */
export function parseSheet(payload, { cats = [], history = [], since = '' } = {}) {
  const header = payload?.header || [];
  const col = mapColumns(header);
  const items = [], skipped = [];
  if (col.time == null || col.amount == null || col.description == null) {
    return { items, skipped, error: 'COLUMNS', missing: ['time', 'description', 'amount'].filter((k) => col[k] == null) };
  }
  const active = cats.filter((c) => !c.archived);
  const byName = (kind, name) => active.find((c) => c.kind === kind && normText(c.name) === normText(name));
  const seen = new Map(); // fallback ids: time + n-th row with that time
  (payload.rows || []).forEach((r, i) => {
    const rowNo = i + 2; // sheet row number (row 1 = header)
    const get = (k) => (col[k] == null ? '' : r[col[k]]);
    if (r.every((x) => String(x ?? '').trim() === '')) return;
    const date = parseDate(get('time'));
    const description = String(get('description') ?? '').trim();
    const amount = parseAmount(get('amount'));
    if (!date) { skipped.push({ row: rowNo, reason: 'DATE' }); return; }
    if (!description) { skipped.push({ row: rowNo, reason: 'DESCRIPTION' }); return; }
    if (!Number.isFinite(amount) || amount <= 0) { skipped.push({ row: rowNo, reason: 'AMOUNT' }); return; }
    if (since && date < since) return;
    const kind = parseKind(get('kind'));
    const cat = byName(kind, get('category')) || guessCategory(description, kind, active, history);
    let key = String(get('id') ?? '').trim();
    if (!key) { const t = String(get('time')).trim(); const n = (seen.get(t) || 0) + 1; seen.set(t, n); key = `${t}#${n}`; }
    const item = { id: 'gs-' + safeId(key), date, description: description.slice(0, 200), amount, kind, category_id: cat?.id || null, row: rowNo };
    item.hash = rowHash(item);
    items.push(item);
  });
  return { items, skipped };
}

/**
 * What to do with one sheet item, given the local transaction with that id (or null) and whether it was
 * deleted in the app: 'add', 'update' (sheet changed, app copy untouched since the last import), or 'keep'.
 */
export function decide(item, local, deletedHere) {
  if (!local) return deletedHere ? 'keep' : 'add';
  const imported = String(local.src || '').startsWith('gs:') ? local.src.slice(3) : null;
  if (!imported) return 'keep'; // same id but not from the sheet: leave it alone
  if (imported === item.hash) return 'keep'; // nothing changed in the sheet
  const untouched = rowHash(local) === imported; // the app copy still equals what was imported last time
  return untouched ? 'update' : 'keep';
}
