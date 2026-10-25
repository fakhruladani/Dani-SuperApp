// Encrypted local database: SQLite (sql.js / WASM, no native modules) kept in memory,
// persisted as one AES-256-GCM encrypted file. The data key is wrapped with Windows
// DPAPI through Electron safeStorage, so the app can start (and fire reminders)
// without a password, while the file on disk is unreadable without this Windows account
// or the recovery key.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const MAGIC = Buffer.from('DSA1');

export const SCHEMA = {
  calendars: { id: 'text', name: 'text', color: 'text', visible: 'int', sort: 'int' },
  events: { id: 'text', title: 'text', description: 'text', location: 'text', start: 'text', end: 'text', all_day: 'int', calendar_id: 'text', repeat: 'text', repeat_until: 'text', reminder_min: 'int' },
  day_notes: { id: 'text', text: 'text' },
  reminder_log: { id: 'text', status: 'text', fired_at: 'text', snooze_until: 'text' },
  tasks: { id: 'text', title: 'text', notes: 'text', due_date: 'text', due_time: 'text', tag: 'text', priority: 'int', done: 'int', done_at: 'text', reminder_min: 'int', sort: 'int' },
  notes: { id: 'text', title: 'text', content: 'text', plain: 'text', ink: 'text', tag: 'text', pinned: 'int', page_h: 'int', sticky: 'int', sticky_color: 'text', sticky_top: 'int', sticky_bounds: 'text' },
  note_templates: { id: 'text', name: 'text', content: 'text' },
  fin_categories: { id: 'text', name: 'text', kind: 'text', budget: 'int', sort: 'int', archived: 'int' },
  fin_tx: { id: 'text', date: 'text', description: 'text', category_id: 'text', kind: 'text', amount: 'int', note: 'text' },
  fin_budgets: { id: 'text', year: 'int', month: 'int', category_id: 'text', amount: 'int' },
  wealth: { id: 'text', date: 'text', category: 'text', name: 'text', value: 'int', note: 'text' },
  habits: { id: 'text', name: 'text', color: 'text', sort: 'int', archived: 'int' },
  habit_logs: { id: 'text', habit_id: 'text', date: 'text' },
  focus_sessions: { id: 'text', start: 'text', minutes: 'int', label: 'text', kind: 'text' },
  watchlist: { id: 'text', symbol: 'text', name: 'text', sort: 'int' },
  price_alerts: { id: 'text', symbol: 'text', op: 'text', price: 'real', active: 'int', triggered_at: 'text' },
  news_saved: { id: 'text', title: 'text', link: 'text', source: 'text', pub_date: 'text' },
  clipboard: { id: 'text', text: 'text', pinned: 'int' },
  settings: { id: 'text', value: 'text' }
};

const SQL_TYPE = { text: 'TEXT', int: 'INTEGER', real: 'REAL' };

let SQL = null;
let db = null;
let key = null;
let file = null;
let saveTimer = null;
let changeListener = () => {};

export const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function encrypt(buf, k = key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}

export function decrypt(buf, k = key) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('Bukan file data Dani SuperApp');
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), data = buf.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

/** keyStore: { load(): Buffer|null, save(Buffer) } — wraps DPAPI in production, plain in tests. */
export async function openDb({ dir, keyStore, wasmPath }) {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'data.db.enc');
  key = keyStore.load();
  if (!key) { key = crypto.randomBytes(32); keyStore.save(key); }
  if (fs.existsSync(file)) {
    db = new SQL.Database(decrypt(fs.readFileSync(file)));
  } else {
    db = new SQL.Database();
  }
  migrate();
  return db;
}

export function onChange(fn) { changeListener = fn; }
export function getKeyHex() { return key.toString('hex'); }
export function dataFile() { return file; }

function migrate() {
  for (const [t, cols] of Object.entries(SCHEMA)) {
    const defs = Object.entries(cols).map(([c, ty]) => (c === 'id' ? 'id TEXT PRIMARY KEY' : `"${c}" ${SQL_TYPE[ty]}`));
    db.run(`CREATE TABLE IF NOT EXISTS ${t} (${defs.join(', ')}, created_at TEXT, updated_at TEXT)`);
    const have = new Set(all(`PRAGMA table_info(${t})`).map((r) => r.name));
    for (const [c, ty] of Object.entries(cols)) if (!have.has(c)) db.run(`ALTER TABLE ${t} ADD COLUMN "${c}" ${SQL_TYPE[ty]}`);
  }
  db.run('CREATE INDEX IF NOT EXISTS ix_tx_date ON fin_tx(date)');
  db.run('CREATE INDEX IF NOT EXISTS ix_hlog ON habit_logs(habit_id, date)');
  seed();
}

function seed() {
  const has = (t) => all(`SELECT COUNT(*) AS n FROM ${t}`)[0].n > 0;
  if (!has('calendars')) {
    [['Pribadi', 'c1'], ['Kuliah & TA', 'c2'], ['Olahraga', 'c3'], ['Tagihan', 'c4'], ['Kerja', 'c6']].forEach(([name, color], i) =>
      upsert('calendars', { name, color, visible: 1, sort: i }, true));
  }
  if (!has('fin_categories')) {
    const cats = [
      ['Gaji', 'in', 0], ['Sampingan', 'in', 0], ['Lainnya (masuk)', 'in', 0],
      ['Makan', 'out', 1800000], ['Transport', 'out', 600000], ['Tempat tinggal', 'out', 0], ['Tagihan', 'out', 500000],
      ['Belanja', 'out', 500000], ['Olahraga', 'out', 300000], ['Hiburan', 'out', 400000], ['Kesehatan', 'out', 0],
      ['Pendidikan', 'out', 0], ['Tabungan/Investasi', 'out', 0], ['Lainnya (keluar)', 'out', 0]
    ];
    cats.forEach(([name, kind, budget], i) => upsert('fin_categories', { name, kind, budget, sort: i, archived: 0 }, true));
  }
  if (!has('watchlist')) {
    [['^JKSE', 'IHSG'], ['^JKLQ45', 'LQ45'], ['IDR=X', 'USD/IDR'], ['GC=F', 'Emas (USD/oz)'], ['BBCA.JK', 'Bank Central Asia'], ['BBRI.JK', 'Bank Rakyat Indonesia'], ['BMRI.JK', 'Bank Mandiri'], ['^GSPC', 'S&P 500'], ['BTC-USD', 'Bitcoin']]
      .forEach(([symbol, name], i) => upsert('watchlist', { id: symbol, symbol, name, sort: i }, true));
  }
  if (!has('habits')) {
    ['Lari', 'Gym', 'Nulis TA', 'Baca 20 menit'].forEach((name, i) => upsert('habits', { name, color: 'c' + (i + 1), sort: i, archived: 0 }, true));
  }
  if (!has('note_templates')) {
    const p = (txt) => ({ type: 'paragraph', content: txt ? [{ type: 'text', text: txt }] : [] });
    const h = (txt) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: txt }] });
    const task = (txt) => ({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(txt)] }] });
    const T = {
      'Bimbingan TA': [h('Bimbingan TA'), p('Tanggal: '), p('Dosen: '), h('Masukan'), p(''), h('Revisi yang harus dikerjakan'), task(''), h('Pertemuan berikutnya'), p('')],
      'Rapat': [h('Rapat'), p('Peserta: '), h('Agenda'), p(''), h('Keputusan'), p(''), h('Tindak lanjut'), task('')],
      'Jurnal harian': [h('Jurnal harian'), h('3 hal yang disyukuri'), p(''), h('Fokus hari ini'), task(''), h('Refleksi'), p('')]
    };
    Object.entries(T).forEach(([name, content]) => upsert('note_templates', { name, content: JSON.stringify({ type: 'doc', content }) }, true));
  }
  if (!has('settings')) {
    const defaults = {
      theme: 'system', location: { name: 'Sawangan, Depok', lat: -6.4006, lon: 106.7542, manual: true },
      autostart: true, closeToTray: true, reminderDefault: 30, briefTime: '07:00', briefEnabled: true,
      marketRefreshSec: 120, clipboardEnabled: false, quickShortcut: 'CommandOrControl+Shift+Space',
      backupDir: '', backupKeep: 14, pinHash: '', lockAfterMin: 0, focusMin: 25, shortMin: 5, longMin: 15,
      feeds: null
    };
    Object.entries(defaults).forEach(([k, v]) => setSetting(k, v, true));
  }
}

// ---------- low level ----------
export function all(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}
export function run(sql, params = []) { db.run(sql, params); }

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

export function saveNow() {
  clearTimeout(saveTimer);
  if (!db) return;
  const buf = encrypt(Buffer.from(db.export()));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

function changed(table) { scheduleSave(); changeListener([table]); }

// ---------- generic, whitelisted CRUD ----------
function checkTable(t) { if (!SCHEMA[t]) throw new Error('Tabel tidak dikenal: ' + t); return SCHEMA[t]; }
function checkCol(cols, c) { if (!(c in cols) && c !== 'created_at' && c !== 'updated_at') throw new Error('Kolom tidak dikenal: ' + c); }

function coerce(ty, v) {
  if (v === null || v === undefined) return null;
  if (ty === 'int') return typeof v === 'boolean' ? (v ? 1 : 0) : Math.round(Number(v)) || 0;
  if (ty === 'real') return Number(v) || 0;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** where: { col: value | {prefix} | {gte} | {lte} | {in: []} | {like} } */
export function list(table, { where = {}, order = null, limit = null } = {}) {
  const cols = checkTable(table);
  const clauses = [], params = [];
  for (const [c, v] of Object.entries(where)) {
    checkCol(cols, c);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('prefix' in v) { clauses.push(`"${c}" LIKE ?`); params.push(String(v.prefix) + '%'); }
      if ('like' in v) { clauses.push(`"${c}" LIKE ?`); params.push('%' + String(v.like) + '%'); }
      if ('gte' in v) { clauses.push(`"${c}" >= ?`); params.push(v.gte); }
      if ('lte' in v) { clauses.push(`"${c}" <= ?`); params.push(v.lte); }
      if ('in' in v) { clauses.push(`"${c}" IN (${v.in.map(() => '?').join(',') || 'NULL'})`); params.push(...v.in); }
      if ('ne' in v) { clauses.push(`("${c}" IS NULL OR "${c}" != ?)`); params.push(v.ne); }
    } else if (v === null) {
      clauses.push(`"${c}" IS NULL`);
    } else { clauses.push(`"${c}" = ?`); params.push(v); }
  }
  let sql = `SELECT * FROM ${table}`;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  if (order) {
    const parts = String(order).split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
      const [c, dir] = p.split(/\s+/);
      checkCol(cols, c);
      return `"${c}" ${dir && dir.toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
    });
    sql += ' ORDER BY ' + parts.join(', ');
  }
  if (limit) sql += ' LIMIT ' + Math.max(1, Math.min(10000, Number(limit) | 0));
  return all(sql, params);
}

export function get(table, id) {
  checkTable(table);
  return all(`SELECT * FROM ${table} WHERE id = ?`, [id])[0] || null;
}

export function upsert(table, row, silent = false) {
  const cols = checkTable(table);
  const id = row.id || uid();
  const existing = get(table, id);
  const data = {};
  for (const [c, v] of Object.entries(row)) { if (c === 'id' || c === 'created_at' || c === 'updated_at') continue; checkCol(cols, c); data[c] = coerce(cols[c], v); }
  const ts = nowIso();
  if (existing) {
    const keys = Object.keys(data);
    if (keys.length) run(`UPDATE ${table} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => data[k]), ts, id]);
  } else {
    const keys = Object.keys(data);
    run(`INSERT INTO ${table} (id, ${keys.map((k) => `"${k}"`).join(', ')}${keys.length ? ', ' : ''}created_at, updated_at) VALUES (?, ${keys.map(() => '?').join(', ')}${keys.length ? ', ' : ''}?, ?)`, [id, ...keys.map((k) => data[k]), ts, ts]);
  }
  if (!silent) changed(table); else scheduleSave();
  return get(table, id);
}

export function remove(table, id) {
  checkTable(table);
  run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  if (table === 'events') run('DELETE FROM reminder_log WHERE id LIKE ?', [id + '|%']);
  if (table === 'habits') run('DELETE FROM habit_logs WHERE habit_id = ?', [id]);
  changed(table);
  return true;
}

export function removeWhere(table, where) {
  const rows = list(table, { where });
  for (const r of rows) run(`DELETE FROM ${table} WHERE id = ?`, [r.id]);
  changed(table);
  return rows.length;
}

// ---------- settings ----------
export function getSetting(k, fallback = null) {
  const r = get('settings', k);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
export function setSetting(k, v, silent = false) {
  upsert('settings', { id: k, value: JSON.stringify(v) }, silent);
}
export function allSettings() {
  const o = {};
  for (const r of all('SELECT * FROM settings')) { try { o[r.id] = JSON.parse(r.value); } catch { /* skip */ } }
  delete o.pinHash;
  for (const k of Object.keys(o)) if (k.startsWith('cache.')) delete o[k];
  return o;
}

// ---------- finance ----------
export function finRecap(year) {
  const y = String(year);
  const rows = all(`SELECT substr(date,6,2) AS m, kind, category_id, SUM(amount) AS total, COUNT(*) AS n FROM fin_tx WHERE date LIKE ? GROUP BY m, kind, category_id`, [y + '-%']);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, in: 0, out: 0, n: 0 }));
  const byCat = {};
  for (const r of rows) {
    const mi = Number(r.m) - 1;
    if (mi < 0 || mi > 11) continue;
    months[mi][r.kind === 'in' ? 'in' : 'out'] += r.total;
    months[mi].n += r.n;
    const c = (byCat[r.category_id] ||= { category_id: r.category_id, kind: r.kind, months: Array(12).fill(0), total: 0 });
    c.months[mi] += r.total; c.total += r.total;
  }
  const years = all(`SELECT DISTINCT substr(date,1,4) AS y FROM fin_tx ORDER BY y`).map((r) => Number(r.y)).filter(Boolean);
  return { year: Number(year), months, categories: Object.values(byCat), years };
}

export function finBudgets(year, month) {
  const cats = list('fin_categories', { where: { kind: 'out' }, order: 'sort' });
  const overrides = list('fin_budgets', { where: { year, month } });
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const spent = all(`SELECT category_id, SUM(amount) AS total FROM fin_tx WHERE kind='out' AND date LIKE ? GROUP BY category_id`, [ym + '-%']);
  const spentMap = Object.fromEntries(spent.map((r) => [r.category_id, r.total]));
  return cats.filter((c) => !c.archived).map((c) => {
    const o = overrides.find((b) => b.category_id === c.id);
    return { category_id: c.id, name: c.name, budget: o ? o.amount : (c.budget || 0), overridden: !!o, override_id: o ? o.id : null, spent: spentMap[c.id] || 0 };
  });
}

// ---------- search (Ctrl+K) ----------
export function search(q) {
  if (!q || q.trim().length < 2) return [];
  const like = '%' + q.trim() + '%';
  const res = [];
  for (const r of all(`SELECT id, title, plain FROM notes WHERE title LIKE ? OR plain LIKE ? ORDER BY updated_at DESC LIMIT 8`, [like, like]))
    res.push({ type: 'note', id: r.id, title: r.title || 'Tanpa judul', sub: (r.plain || '').slice(0, 80) });
  for (const r of all(`SELECT id, title, start FROM events WHERE title LIKE ? OR description LIKE ? ORDER BY start DESC LIMIT 8`, [like, like]))
    res.push({ type: 'event', id: r.id, title: r.title, sub: String(r.start).replace('T', ' pukul '), date: r.start });
  for (const r of all(`SELECT id, title, due_date FROM tasks WHERE title LIKE ? OR notes LIKE ? ORDER BY done, due_date LIMIT 8`, [like, like]))
    res.push({ type: 'task', id: r.id, title: r.title, sub: r.due_date || 'Tanpa tenggat' });
  for (const r of all(`SELECT id, description, date, amount, kind FROM fin_tx WHERE description LIKE ? OR note LIKE ? ORDER BY date DESC LIMIT 8`, [like, like]))
    res.push({ type: 'tx', id: r.id, title: r.description, sub: `${r.date} · ${r.kind === 'in' ? '+' : '−'}Rp ${Number(r.amount).toLocaleString('id-ID')}`, date: r.date });
  return res;
}

// ---------- backup / restore ----------
export function exportEncrypted() { saveNow(); return fs.readFileSync(file); }

export function restoreFrom(buf, recoveryKeyHex = null) {
  let plain;
  try { plain = decrypt(buf); } catch (e) {
    if (!recoveryKeyHex) { const err = new Error('NEED_KEY'); err.code = 'NEED_KEY'; throw err; }
    plain = decrypt(buf, Buffer.from(recoveryKeyHex.replace(/[^0-9a-f]/gi, ''), 'hex'));
  }
  const next = new SQL.Database(plain);
  db.close();
  db = next;
  migrate();
  saveNow();
  changeListener(Object.keys(SCHEMA));
}

export function closeDb() { if (db) { saveNow(); db.close(); db = null; } }
