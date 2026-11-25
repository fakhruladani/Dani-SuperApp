// Database logic shared by the desktop app (Electron main process) and the Android app (WebView):
// SQLite through sql.js, kept in memory. Persistence and encryption are done by the platform
// (electron/db.js, src/android/db.js) through init({ persist }) and exportBytes().
// Every synced table carries `rev` (a local change counter, set by triggers) and deletions leave a
// tombstone in sync_deleted, so a peer can ask "what changed since rev N" (see shared/sync.js).
import { t as T } from './i18n.js';
import { assetKey, latestByAsset } from './wealth.js';

export const SCHEMA = {
  calendars: { id: 'text', name: 'text', color: 'text', visible: 'int', sort: 'int' },
  events: { id: 'text', title: 'text', description: 'text', location: 'text', start: 'text', end: 'text', all_day: 'int', calendar_id: 'text', repeat: 'text', repeat_until: 'text', reminder_min: 'int', color: 'text' }, // color: own color, empty = calendar's
  day_notes: { id: 'text', text: 'text' },
  reminder_log: { id: 'text', status: 'text', fired_at: 'text', snooze_until: 'text' },
  tasks: { id: 'text', title: 'text', notes: 'text', due_date: 'text', due_time: 'text', tag: 'text', priority: 'int', done: 'int', done_at: 'text', reminder_min: 'int', sort: 'int' },
  notes: { id: 'text', title: 'text', content: 'text', plain: 'text', ink: 'text', tag: 'text', pinned: 'int', page_h: 'int', sticky: 'int', sticky_color: 'text', sticky_top: 'int', sticky_bounds: 'text' },
  note_templates: { id: 'text', name: 'text', content: 'text' },
  fin_categories: { id: 'text', name: 'text', kind: 'text', budget: 'int', sort: 'int', archived: 'int' },
  fin_tx: { id: 'text', date: 'text', description: 'text', category_id: 'text', kind: 'text', amount: 'int', note: 'text', src: 'text' }, // src: 'gs:<hash>' = imported from Google Sheets
  fin_budgets: { id: 'text', year: 'int', month: 'int', category_id: 'text', amount: 'int' },
  wealth: { id: 'text', date: 'text', category: 'text', name: 'text', value: 'int', note: 'text' },
  habits: { id: 'text', name: 'text', color: 'text', sort: 'int', archived: 'int' },
  habit_logs: { id: 'text', habit_id: 'text', date: 'text' },
  focus_sessions: { id: 'text', start: 'text', minutes: 'int', label: 'text', kind: 'text' },
  watchlist: { id: 'text', symbol: 'text', name: 'text', sort: 'int' },
  price_alerts: { id: 'text', symbol: 'text', op: 'text', price: 'real', active: 'int', triggered_at: 'text' },
  news_saved: { id: 'text', title: 'text', link: 'text', source: 'text', pub_date: 'text' },
  clipboard: { id: 'text', text: 'text', pinned: 'int' },
  // project = metadata for a task tag (tasks.tag); tasks stay linked by tag only
  projects: { id: 'text', tag: 'text', name: 'text', deadline: 'text', color: 'text', note: 'text', archived: 'int', sort: 'int' },
  // images pasted into notes, referenced from note content as dsa-img://img/<id>
  note_images: { id: 'text', note_id: 'text', mime: 'text', data: 'blob' },
  settings: { id: 'text', value: 'text' }
};

const SQL_TYPE = { text: 'TEXT', int: 'INTEGER', real: 'REAL', blob: 'BLOB' };

let SQL = null;
let db = null;
let saveTimer = null;
let persist = () => {}; // set by the platform: writes exportBytes() somewhere durable
let changeListener = () => {};

export const uid = () => globalThis.crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/** SQLlib: initialised sql.js; bytes: plain database or null; persist(): called (debounced) after writes. */
export function init(SQLlib, bytes, opts = {}) {
  SQL = SQLlib;
  persist = opts.persist || persist;
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  migrate();
  return db;
}
export function onChange(fn) { changeListener = fn; }
export function exportBytes() { return db.export(); }
export function isOpen() { return !!db; }
/** Replaces the whole database (backup restore). */
export function replaceWith(bytes) {
  const next = new SQL.Database(bytes);
  db.close();
  db = next;
  migrate();
  flush();
  changeListener(Object.keys(SCHEMA));
}
export function close() { if (db) { flush(); db.close(); db = null; } }

function migrate() {
  for (const [t, cols] of Object.entries(SCHEMA)) {
    const defs = Object.entries(cols).map(([c, ty]) => (c === 'id' ? 'id TEXT PRIMARY KEY' : `"${c}" ${SQL_TYPE[ty]}`));
    db.run(`CREATE TABLE IF NOT EXISTS ${t} (${defs.join(', ')}, created_at TEXT, updated_at TEXT)`);
    const have = new Set(all(`PRAGMA table_info(${t})`).map((r) => r.name));
    for (const [c, ty] of Object.entries(cols)) if (!have.has(c)) db.run(`ALTER TABLE ${t} ADD COLUMN "${c}" ${SQL_TYPE[ty]}`);
  }
  db.run('CREATE INDEX IF NOT EXISTS ix_tx_date ON fin_tx(date)');
  db.run('CREATE INDEX IF NOT EXISTS ix_hlog ON habit_logs(habit_id, date)');
  db.run("DELETE FROM reminder_log WHERE status != 'snoozed' AND fired_at < ?", [new Date(Date.now() - 90 * 86400000).toISOString()]);
  migrateSync();
  seed();
}

// Seeded rows get fixed ids, so two fresh installs that sync do not end up with every calendar/category twice.
function seed() {
  const has = (t) => all(`SELECT COUNT(*) AS n FROM ${t}`)[0].n > 0;
  if (!has('calendars')) {
    [['Pribadi', 'c1'], ['Belajar', 'c2'], ['Olahraga', 'c3'], ['Tagihan', 'c4'], ['Kerja', 'c6']].forEach(([name, color], i) =>
      upsert('calendars', { id: 'seed-cal-' + i, name, color, visible: 1, sort: i }, true));
  }
  if (!has('fin_categories')) {
    const cats = [
      ['Gaji', 'in', 0], ['Sampingan', 'in', 0], ['Lainnya (masuk)', 'in', 0],
      ['Makan', 'out', 0], ['Transport', 'out', 0], ['Tempat tinggal', 'out', 0], ['Tagihan', 'out', 0],
      ['Belanja', 'out', 0], ['Olahraga', 'out', 0], ['Hiburan', 'out', 0], ['Kesehatan', 'out', 0],
      ['Pendidikan', 'out', 0], ['Tabungan/Investasi', 'out', 0], ['Lainnya (keluar)', 'out', 0]
    ];
    cats.forEach(([name, kind, budget], i) => upsert('fin_categories', { id: 'seed-cat-' + i, name, kind, budget, sort: i, archived: 0 }, true));
  }
  if (!has('watchlist')) {
    [['^JKSE', 'IHSG'], ['^JKLQ45', 'LQ45'], ['IDR=X', 'USD/IDR'], ['GC=F', 'Emas (USD/oz)'], ['BBCA.JK', 'Bank Central Asia'], ['BBRI.JK', 'Bank Rakyat Indonesia'], ['BMRI.JK', 'Bank Mandiri'], ['^GSPC', 'S&P 500'], ['BTC-USD', 'Bitcoin']]
      .forEach(([symbol, name], i) => upsert('watchlist', { id: symbol, symbol, name, sort: i }, true));
  }
  if (!has('habits')) {
    ['Olahraga', 'Baca 20 menit', 'Minum air 2 liter'].forEach((name, i) => upsert('habits', { id: 'seed-habit-' + i, name, color: 'c' + (i + 1), sort: i, archived: 0 }, true));
  }
  if (!has('note_templates')) {
    const p = (txt) => ({ type: 'paragraph', content: txt ? [{ type: 'text', text: txt }] : [] });
    const h = (txt) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: txt }] });
    const task = (txt) => ({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(txt)] }] });
    const T = {
      'Bimbingan / konsultasi': [h('Bimbingan / konsultasi'), p('Tanggal: '), p('Dengan: '), h('Masukan'), p(''), h('Yang harus dikerjakan'), task(''), h('Pertemuan berikutnya'), p('')],
      'Rapat': [h('Rapat'), p('Peserta: '), h('Agenda'), p(''), h('Keputusan'), p(''), h('Tindak lanjut'), task('')],
      'Jurnal harian': [h('Jurnal harian'), h('3 hal yang disyukuri'), p(''), h('Fokus hari ini'), task(''), h('Refleksi'), p('')]
    };
    Object.entries(T).forEach(([name, content], i) => upsert('note_templates', { id: 'seed-tpl-' + i, name, content: JSON.stringify({ type: 'doc', content }) }, true));
  }
  if (!has('settings')) {
    const defaults = {
      theme: 'system', location: null, // null = approximate from the IP address until the user picks a place
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
  saveTimer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(saveTimer);
  if (db) persist();
}

function changed(table) { scheduleSave(); changeListener([table]); }

// ---------- generic, whitelisted CRUD ----------
function checkTable(t) { if (!SCHEMA[t]) throw new Error('Tabel tidak dikenal: ' + t); return SCHEMA[t]; }
function checkCol(cols, c) { if (!(c in cols) && c !== 'created_at' && c !== 'updated_at' && c !== 'rev') throw new Error('Kolom tidak dikenal: ' + c); }

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
  for (const [c, v] of Object.entries(row)) { if (c === 'id' || c === 'created_at' || c === 'updated_at' || c === 'rev') continue; checkCol(cols, c); data[c] = coerce(cols[c], v); }
  const ts = nowIso();
  if (existing) {
    const keys = Object.keys(data);
    // window position of a sticky note etc. is not an edit: keep updated_at so it cannot win over a real edit made on another device
    const localOnly = keys.length && keys.every((k) => LOCAL_COLS[table]?.includes(k));
    if (keys.length) run(`UPDATE ${table} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}${localOnly ? '' : ', updated_at = ?'} WHERE id = ?`, [...keys.map((k) => data[k]), ...(localOnly ? [] : [ts]), id]);
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
    res.push({ type: 'note', id: r.id, title: r.title || T('Tanpa judul'), sub: (r.plain || '').slice(0, 80) });
  for (const r of all(`SELECT id, title, start FROM events WHERE title LIKE ? OR description LIKE ? ORDER BY start DESC LIMIT 8`, [like, like]))
    res.push({ type: 'event', id: r.id, title: r.title, sub: String(r.start).replace('T', ' ' + T('pukul') + ' '), date: r.start });
  for (const r of all(`SELECT id, title, due_date FROM tasks WHERE title LIKE ? OR notes LIKE ? ORDER BY done, due_date LIMIT 8`, [like, like]))
    res.push({ type: 'task', id: r.id, title: r.title, sub: r.due_date || T('Tanpa tenggat') });
  for (const r of all(`SELECT id, description, date, amount, kind FROM fin_tx WHERE description LIKE ? OR note LIKE ? ORDER BY date DESC LIMIT 8`, [like, like]))
    res.push({ type: 'tx', id: r.id, title: r.description, sub: `${r.date} · ${r.kind === 'in' ? '+' : '−'}Rp ${Number(r.amount).toLocaleString('id-ID')}`, date: r.date });
  return res;
}

// ---------- Total Wealth sheet (bulk edits, one change event each) ----------
const wkey = (date, c) => date + '|' + assetKey(c);
function wealthIndex() {
  const m = new Map();
  for (const r of all('SELECT * FROM wealth ORDER BY date, updated_at')) m.set(wkey(r.date, r), r);
  return m;
}
/** cells: [{ date, name, category, value }]; an existing cell on that date for that account is updated. */
export function wealthImport(cells) {
  const idx = wealthIndex();
  let n = 0;
  for (const c of cells) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !String(c.name || '').trim()) continue;
    const ex = idx.get(wkey(c.date, c));
    const row = upsert('wealth', { ...(ex ? { id: ex.id } : {}), date: c.date, category: String(c.category || '').trim(), name: String(c.name).trim(), value: Math.round(Number(c.value) || 0), note: ex?.note || '' }, true);
    idx.set(wkey(c.date, c), row);
    n++;
  }
  changed('wealth');
  return n;
}
/** New dated row: copies every account's value known at that date (existing cells on that date are kept). */
export function wealthSnapshot(date) {
  const idx = wealthIndex();
  const latest = latestByAsset(all('SELECT * FROM wealth'), date);
  let n = 0;
  for (const r of latest.values()) {
    if (idx.has(wkey(date, r))) continue;
    upsert('wealth', { date, category: r.category || '', name: r.name, value: r.value, note: '' }, true);
    n++;
  }
  changed('wealth');
  return n;
}
export function wealthMoveDate(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || from === to) return 0;
  const idx = wealthIndex();
  const rows = all('SELECT * FROM wealth WHERE date = ?', [from]);
  for (const r of rows) {
    const clash = idx.get(wkey(to, r));
    if (clash) run('DELETE FROM wealth WHERE id = ?', [clash.id]); // the moved row wins
    run('UPDATE wealth SET date = ?, updated_at = ? WHERE id = ?', [to, nowIso(), r.id]);
  }
  changed('wealth');
  return rows.length;
}
export function wealthDeleteDate(date) {
  run('DELETE FROM wealth WHERE date = ?', [date]);
  changed('wealth');
  return true;
}
/** Renames an account (column) everywhere; merges into an existing account on the same date if needed. */
export function wealthRenameCol(from, to) {
  const fk = assetKey(from), tk = assetKey(to);
  const rows = all('SELECT * FROM wealth').filter((r) => assetKey(r) === fk);
  if (fk !== tk) {
    const idx = wealthIndex();
    for (const r of rows) { const clash = idx.get(wkey(r.date, to)); if (clash) run('DELETE FROM wealth WHERE id = ?', [clash.id]); }
  }
  for (const r of rows) run('UPDATE wealth SET name = ?, category = ?, updated_at = ? WHERE id = ?', [String(to.name).trim(), String(to.category || '').trim(), nowIso(), r.id]);
  changed('wealth');
  return rows.length;
}
export function wealthDeleteCol(col) {
  const k = assetKey(col);
  for (const r of all('SELECT id, category, name FROM wealth')) if (assetKey(r) === k) run('DELETE FROM wealth WHERE id = ?', [r.id]);
  changed('wealth');
  return true;
}

// ---------- note images ----------
const IMG_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif']);
export function imagePut(noteId, mime, bytes) {
  if (!IMG_MIME.has(mime)) throw new Error(T('Format gambar tidak didukung'));
  const buf = toBytes(bytes);
  if (!buf.length || buf.length > 8 * 1024 * 1024) throw new Error(T('Gambar terlalu besar (maks. 8 MB)'));
  const id = uid(), ts = nowIso();
  run('INSERT INTO note_images (id, note_id, mime, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, String(noteId || ''), mime, buf, ts, ts]);
  scheduleSave();
  return id;
}
export function imageGet(id) {
  const r = all('SELECT mime, data FROM note_images WHERE id = ?', [String(id)])[0];
  return r ? { mime: r.mime, data: r.data } : null;
}
/** Deletes images no note or template references any more (run at startup, so undo within a session still works). */
export function pruneImages() {
  const ids = all('SELECT id FROM note_images').map((r) => r.id);
  if (!ids.length) return 0;
  const text = all('SELECT content FROM notes').concat(all('SELECT content FROM note_templates')).map((r) => r.content || '').join('\n');
  const dead = ids.filter((id) => !text.includes(id));
  for (const id of dead) run('DELETE FROM note_images WHERE id = ?', [id]);
  if (dead.length) scheduleSave();
  return dead.length;
}


// ---------- sync metadata ----------
// Device-local tables: reminder state (each device notifies on its own) and clipboard history (desktop only).
const LOCAL_TABLES = new Set(['reminder_log', 'clipboard']);
export const SYNC_TABLES = Object.keys(SCHEMA).filter((t) => !LOCAL_TABLES.has(t));
// Settings that are the user's data rather than this device's setup (theme, location, PIN, window layout stay per device).
export const SYNC_SETTINGS = new Set(['gsheet', 'gsheetLinked', 'wealthCols', 'reminderDefault', 'focusMin', 'shortMin', 'longMin', 'feeds', 'showHolidays', 'showObservances', 'showTasksInCalendar', 'briefTime', 'briefEnabled']);
// Columns that describe this device's windows, not the data: never synced, and changing only them is not an edit.
export const LOCAL_COLS = { notes: ['sticky', 'sticky_top', 'sticky_bounds'] };
// Tables a user actually fills in (used to tell a fresh install from one with data)
const USER_TABLES = ['events', 'day_notes', 'tasks', 'notes', 'fin_tx', 'fin_budgets', 'wealth', 'habit_logs', 'focus_sessions', 'price_alerts', 'news_saved', 'projects'];

const toBytes = (b) => (b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || []));
const syncedSetting = (id) => SYNC_SETTINGS.has(id);

function migrateSync() {
  db.run('CREATE TABLE IF NOT EXISTS sync_clock (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL)');
  db.run('INSERT OR IGNORE INTO sync_clock (id, v) VALUES (1, 0)');
  db.run('CREATE TABLE IF NOT EXISTS sync_deleted (tbl TEXT NOT NULL, id TEXT NOT NULL, deleted_at TEXT, rev INTEGER, PRIMARY KEY (tbl, id))');
  // paired devices and their sync progress; never exposed through the generic CRUD (holds the pairing keys)
  db.run('CREATE TABLE IF NOT EXISTS sync_peers (id TEXT PRIMARY KEY, name TEXT, key TEXT, addr TEXT, last_pulled INTEGER DEFAULT 0, last_pushed INTEGER DEFAULT 0, last_sync TEXT, created_at TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS sync_meta (k TEXT PRIMARY KEY, v TEXT)');
  if (!all("SELECT v FROM sync_meta WHERE k = 'device'")[0]) db.run("INSERT INTO sync_meta (k, v) VALUES ('device', ?)", [uid()]);
  const bump = "UPDATE sync_clock SET v = v + 1 WHERE id = 1";
  const cur = '(SELECT v FROM sync_clock WHERE id = 1)';
  for (const t of SYNC_TABLES) {
    const have = new Set(all(`PRAGMA table_info(${t})`).map((r) => r.name));
    if (!have.has('rev')) db.run(`ALTER TABLE ${t} ADD COLUMN rev INTEGER`);
    db.run(`CREATE INDEX IF NOT EXISTS ix_${t}_rev ON ${t}(rev)`);
    db.run(`CREATE TRIGGER IF NOT EXISTS sx_${t}_i AFTER INSERT ON ${t} BEGIN ${bump}; UPDATE ${t} SET rev = ${cur} WHERE id = NEW.id; DELETE FROM sync_deleted WHERE tbl = '${t}' AND id = NEW.id; END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS sx_${t}_u AFTER UPDATE ON ${t} WHEN NEW.rev IS OLD.rev BEGIN ${bump}; UPDATE ${t} SET rev = ${cur} WHERE id = NEW.id; END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS sx_${t}_d AFTER DELETE ON ${t} BEGIN ${bump}; INSERT OR REPLACE INTO sync_deleted (tbl, id, deleted_at, rev) VALUES ('${t}', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${cur}); END`);
    // rows from before sync existed: give them a revision so the first sync sends them
    if (all(`SELECT 1 FROM ${t} WHERE rev IS NULL LIMIT 1`).length) { db.run(bump); db.run(`UPDATE ${t} SET rev = ${cur} WHERE rev IS NULL`); }
  }
}

export const clock = () => all('SELECT v FROM sync_clock WHERE id = 1')[0].v;
export const deviceId = () => all("SELECT v FROM sync_meta WHERE k = 'device'")[0].v;
function nextRev() { db.run('UPDATE sync_clock SET v = v + 1 WHERE id = 1'); return clock(); }

/** True when nothing but the seeded defaults is in the database (a new install). */
export function isPristine() {
  return USER_TABLES.every((t) => !all(`SELECT 1 FROM ${t} LIMIT 1`).length) && !all('SELECT 1 FROM note_templates WHERE id NOT LIKE \'seed-%\' LIMIT 1').length;
}
/** Empties the synced data before the very first sync of a new install, so it takes the other device's data instead of adding its own defaults next to it. */
export function resetForInitialSync() {
  for (const t of SYNC_TABLES) t === 'settings' ? db.run(`DELETE FROM settings WHERE id IN (${[...SYNC_SETTINGS].map(() => '?').join(',')})`, [...SYNC_SETTINGS]) : db.run(`DELETE FROM ${t}`);
  db.run('DELETE FROM sync_deleted'); // not deletions the other device should repeat
  scheduleSave();
}

const stripLocal = (t, r) => { const o = { ...r }; delete o.rev; for (const c of LOCAL_COLS[t] || []) delete o[c]; return o; };

/**
 * Everything changed after `since` (a value of clock()): rows per table, tombstones, and note images
 * as metadata only (their bytes are fetched separately with imagesData). skip: Set of "table|id" to leave out.
 */
export function changesSince(since = 0, skip = null) {
  const rows = {}, images = [];
  for (const t of SYNC_TABLES) {
    if (t === 'note_images') {
      for (const r of all('SELECT id, note_id, mime, created_at, updated_at FROM note_images WHERE rev > ?', [since])) if (!skip?.has('note_images|' + r.id)) images.push(r);
      continue;
    }
    let list = all(`SELECT * FROM ${t} WHERE rev > ?`, [since]);
    if (t === 'settings') list = list.filter((r) => syncedSetting(r.id));
    if (skip) list = list.filter((r) => !skip.has(t + '|' + r.id));
    if (list.length) rows[t] = list.map((r) => stripLocal(t, r));
  }
  const deleted = all('SELECT tbl, id, deleted_at FROM sync_deleted WHERE rev > ?', [since])
    .filter((d) => SYNC_TABLES.includes(d.tbl) && (d.tbl !== 'settings' || syncedSetting(d.id)) && !skip?.has(d.tbl + '|' + d.id));
  return { rev: clock(), rows, deleted, images };
}

/**
 * Applies another device's changes: newest updated_at wins per row; a deletion wins over an older edit.
 * Returns { applied: Set("table|id"), tables: [...changed tables], needImages: [ids of images we do not have] }.
 */
export function applyChanges({ rows = {}, deleted = [], images = [] } = {}) {
  const applied = new Set(), tables = new Set();
  for (const [t, list] of Object.entries(rows)) {
    if (!SYNC_TABLES.includes(t) || t === 'note_images' || !Array.isArray(list)) continue;
    const cols = SCHEMA[t];
    for (const r of list) {
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      if (t === 'settings' && !syncedSetting(r.id)) continue;
      const ru = String(r.updated_at || '');
      const local = all(`SELECT updated_at FROM ${t} WHERE id = ?`, [r.id])[0];
      if (local && !(ru > String(local.updated_at || ''))) continue;
      if (!local) { const tomb = all('SELECT deleted_at FROM sync_deleted WHERE tbl = ? AND id = ?', [t, r.id])[0]; if (tomb && String(tomb.deleted_at) >= ru) continue; }
      const keys = Object.keys(cols).filter((c) => c !== 'id' && c in r && !LOCAL_COLS[t]?.includes(c));
      const vals = keys.map((c) => coerce(cols[c], r[c]));
      if (local) run(`UPDATE ${t} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}${keys.length ? ', ' : ''}created_at = ?, updated_at = ? WHERE id = ?`, [...vals, r.created_at || ru, ru, r.id]);
      else run(`INSERT INTO ${t} (id, ${keys.map((k) => `"${k}"`).join(', ')}${keys.length ? ', ' : ''}created_at, updated_at) VALUES (?, ${keys.map(() => '?').join(', ')}${keys.length ? ', ' : ''}?, ?)`, [r.id, ...vals, r.created_at || ru, ru]);
      applied.add(t + '|' + r.id); tables.add(t);
    }
  }
  for (const d of Array.isArray(deleted) ? deleted : []) {
    const t = d?.tbl;
    if (!SYNC_TABLES.includes(t) || typeof d.id !== 'string' || (t === 'settings' && !syncedSetting(d.id))) continue;
    const at = String(d.deleted_at || '');
    const local = all(`SELECT updated_at FROM ${t} WHERE id = ?`, [d.id])[0];
    if (local) {
      if (String(local.updated_at || '') > at) continue; // edited here after it was deleted there: keep it
      run(`DELETE FROM ${t} WHERE id = ?`, [d.id]); // the trigger leaves a tombstone, so it travels on to other devices
      if (t === 'events') run('DELETE FROM reminder_log WHERE id LIKE ?', [d.id + '|%']);
      tables.add(t);
    } else if (!all('SELECT 1 FROM sync_deleted WHERE tbl = ? AND id = ?', [t, d.id]).length) {
      run('INSERT INTO sync_deleted (tbl, id, deleted_at, rev) VALUES (?, ?, ?, ?)', [t, d.id, at, nextRev()]);
    }
    run('UPDATE sync_deleted SET deleted_at = ? WHERE tbl = ? AND id = ?', [at, t, d.id]);
    applied.add(t + '|' + d.id);
  }
  const needImages = (Array.isArray(images) ? images : []).filter((m) => typeof m?.id === 'string' && !all('SELECT 1 FROM note_images WHERE id = ?', [m.id]).length && !all("SELECT 1 FROM sync_deleted WHERE tbl = 'note_images' AND id = ?", [m.id]).length).map((m) => m.id);
  if (tables.size) { scheduleSave(); changeListener([...tables]); }
  return { applied, tables: [...tables], needImages };
}

/** Image rows with their bytes (for sending); missing ids are skipped. */
export function imagesData(ids) {
  const out = [];
  for (const id of ids || []) { const r = all('SELECT id, note_id, mime, data, created_at, updated_at FROM note_images WHERE id = ?', [String(id)])[0]; if (r) out.push(r); }
  return out;
}
/** Stores images received from another device (same ids; images never change after they are created). */
export function imagesStore(list) {
  let n = 0;
  for (const r of list || []) {
    if (typeof r?.id !== 'string' || !IMG_MIME.has(r.mime) || all('SELECT 1 FROM note_images WHERE id = ?', [r.id]).length) continue;
    const data = toBytes(r.data);
    if (!data.length || data.length > 8 * 1024 * 1024) continue;
    run('INSERT INTO note_images (id, note_id, mime, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [r.id, String(r.note_id || ''), r.mime, data, r.created_at || nowIso(), r.updated_at || nowIso()]);
    n++;
  }
  if (n) { scheduleSave(); changeListener(['note_images', 'notes']); }
  return n;
}

// ---------- paired devices ----------
export const peers = () => all('SELECT id, name, addr, last_pulled, last_pushed, last_sync, created_at FROM sync_peers ORDER BY created_at');
export const peer = (id) => all('SELECT * FROM sync_peers WHERE id = ?', [String(id)])[0] || null;
export function peerSave(p) {
  const ex = peer(p.id);
  if (ex) run('UPDATE sync_peers SET name = COALESCE(?, name), key = COALESCE(?, key), addr = COALESCE(?, addr), last_pulled = COALESCE(?, last_pulled), last_pushed = COALESCE(?, last_pushed), last_sync = COALESCE(?, last_sync) WHERE id = ?',
    [p.name ?? null, p.key ?? null, p.addr ?? null, p.last_pulled ?? null, p.last_pushed ?? null, p.last_sync ?? null, p.id]);
  else run('INSERT INTO sync_peers (id, name, key, addr, last_pulled, last_pushed, last_sync, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [p.id, p.name || '', p.key || '', p.addr || '', p.last_pulled || 0, p.last_pushed || 0, p.last_sync || null, nowIso()]);
  scheduleSave();
  return peer(p.id);
}
export function peerRemove(id) { run('DELETE FROM sync_peers WHERE id = ?', [String(id)]); scheduleSave(); }
export const metaGet = (k) => all('SELECT v FROM sync_meta WHERE k = ?', [k])[0]?.v ?? null;
export function metaSet(k, v) { run('INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', [k, v == null ? null : String(v)]); scheduleSave(); }
/** True when this row was deleted here (or the deletion arrived by sync). */
export const isDeleted = (tbl, id) => all('SELECT 1 FROM sync_deleted WHERE tbl = ? AND id = ?', [tbl, String(id)]).length > 0;
/** After a batch of silent writes: save and tell the windows once. */
export function touched(tables) { scheduleSave(); changeListener(tables); }
