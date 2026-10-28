import { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, shell, dialog, globalShortcut, powerMonitor, safeStorage, clipboard, nativeTheme, session, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as db from './db.js';
import * as svc from './services.js';
import * as sched from './scheduler.js';
import * as io from './io.js';
import * as state from './state.js';
import * as upd from './updater.js';
import { stickyColor } from '../shared/sticky.js';
import { t as T, setLang, lang } from '../shared/i18n.js';
import { toMarkdown, imageIds } from '../shared/md.js';

// Images in notes are served from the encrypted database: <img src="dsa-img://img/<id>">
protocol.registerSchemesAsPrivileged([{ scheme: 'dsa-img', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.join(__dirname, '..');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ID = 'id.dani.superapp';
const startHidden = process.argv.includes('--hidden');

if (process.env.DSA_USER_DATA) app.setPath('userData', process.env.DSA_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId(APP_ID);

let mainWin = null, quickWin = null, widgetWin = null, tray = null;
let quitting = false;
const liveNotifs = new Set();

const asset = (f) => path.join(ROOT, 'assets', f);

// ---------------- key storage (DPAPI via safeStorage) ----------------
const keyFile = () => path.join(app.getPath('userData'), 'key.bin');
const keyStore = {
  load() {
    if (!fs.existsSync(keyFile())) return null;
    const raw = fs.readFileSync(keyFile());
    if (raw.subarray(0, 5).toString() === 'PLAIN') return Buffer.from(raw.subarray(5).toString(), 'hex');
    return Buffer.from(safeStorage.decryptString(raw), 'hex');
  },
  save(k) {
    if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(keyFile(), safeStorage.encryptString(k.toString('hex')));
    else fs.writeFileSync(keyFile(), Buffer.concat([Buffer.from('PLAIN'), Buffer.from(k.toString('hex'))]));
  }
};

// ---------------- windows ----------------
function themeColors() {
  const dark = effectiveDark();
  return dark ? { bg: '#0D1015', surface: '#151920', text: '#E8EBF0' } : { bg: '#F4F5F7', surface: '#FFFFFF', text: '#14171C' };
}
function effectiveDark() {
  const t = db.getSetting('theme', 'system');
  return t === 'dark' || (t === 'system' && nativeTheme.shouldUseDarkColors);
}

// The UI language is fixed per page load (?lang=); changing it reloads every window.
function load(win, hash = '') {
  win.__hash = hash;
  if (DEV_URL) win.loadURL(`${DEV_URL}?lang=${lang()}${hash ? '#' + hash : ''}`);
  else win.loadFile(path.join(ROOT, 'dist', 'index.html'), { query: { lang: lang() }, ...(hash ? { hash } : {}) });
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://') && !(DEV_URL && url.startsWith(DEV_URL))) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}

const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false };

function createMain() {
  const c = themeColors();
  mainWin = new BrowserWindow({
    width: 1380, height: 880, minWidth: 980, minHeight: 640, show: false, backgroundColor: c.bg,
    title: 'Dani SuperApp', icon: asset('icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: c.surface, symbolColor: c.text, height: 44 },
    webPreferences
  });
  hardenWindow(mainWin);
  load(mainWin);
  mainWin.once('ready-to-show', () => mainWin?.show());
  mainWin.on('close', (e) => {
    if (!quitting && db.getSetting('closeToTray', true)) { e.preventDefault(); mainWin.hide(); }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

let pendingNav = null; // navigation for a window that is still starting up
function showMain(nav) {
  if (!mainWin) { createMain(); pendingNav = nav || null; return; } // shown on ready-to-show, avoids a blank flash
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
  if (nav) {
    const sendNav = () => mainWin.webContents.send('nav', nav);
    if (mainWin.webContents.isLoading()) mainWin.webContents.once('did-finish-load', sendNav); else sendNav();
  }
}

function toggleQuick() {
  if (quickWin && quickWin.isVisible()) { quickWin.hide(); return; }
  if (!quickWin) {
    quickWin = new BrowserWindow({ width: 560, height: 420, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: themeColors().surface, webPreferences });
    hardenWindow(quickWin);
    load(quickWin, '/quick');
    quickWin.on('blur', () => quickWin && quickWin.hide());
    quickWin.on('closed', () => { quickWin = null; });
    quickWin.once('ready-to-show', () => { quickWin.center(); quickWin.show(); quickWin.focus(); });
    return;
  }
  quickWin.center(); quickWin.show(); quickWin.focus();
  quickWin.webContents.send('quick:shown');
}

function toggleWidget() {
  if (widgetWin) { widgetWin.close(); return; }
  const pos = db.getSetting('widget.pos');
  widgetWin = new BrowserWindow({ width: 320, height: 460, x: pos?.x, y: pos?.y, frame: false, resizable: true, minWidth: 260, minHeight: 300, alwaysOnTop: true, skipTaskbar: true, backgroundColor: themeColors().surface, webPreferences });
  hardenWindow(widgetWin);
  load(widgetWin, '/widget');
  widgetWin.on('moved', () => { const [x, y] = widgetWin.getPosition(); db.setSetting('widget.pos', { x, y }, true); });
  widgetWin.on('closed', () => { widgetWin = null; db.setSetting('widget.open', false, true); });
  db.setSetting('widget.open', true, true);
}

function broadcast(channel, data) {
  for (const w of [mainWin, quickWin, widgetWin, ...stickyWins.values()]) if (w && !w.isDestroyed()) w.webContents.send(channel, data);
}

// ---------------- sticky notes (one floating window per note) ----------------
const stickyWins = new Map();
function openSticky(noteId) {
  const note = db.get('notes', noteId);
  if (!note) return false;
  const existing = stickyWins.get(noteId);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return true; }
  let b = null;
  try { b = JSON.parse(note.sticky_bounds || 'null'); } catch { b = null; }
  const c = stickyColor(note.sticky_color);
  const win = new BrowserWindow({
    width: b?.w || 340, height: b?.h || 340, x: b?.x, y: b?.y, minWidth: 240, minHeight: 180,
    frame: false, resizable: true, skipTaskbar: true, show: false, alwaysOnTop: !!note.sticky_top,
    backgroundColor: effectiveDark() ? c.dark : c.light, title: note.title || T('Sticky note'), icon: asset('icon.png'), webPreferences
  });
  if (note.sticky_top) win.setAlwaysOnTop(true, 'floating');
  hardenWindow(win);
  load(win, '/sticky/' + noteId);
  win.once('ready-to-show', () => win.show());
  let t = null;
  const saveBounds = () => { clearTimeout(t); t = setTimeout(() => { if (win.isDestroyed()) return; const r = win.getBounds(); db.upsert('notes', { id: noteId, sticky_bounds: JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }) }, true); }, 400); };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  win.on('closed', () => {
    stickyWins.delete(noteId);
    if (!quitting && db.get('notes', noteId)) db.upsert('notes', { id: noteId, sticky: 0 });
  });
  stickyWins.set(noteId, win);
  if (!note.sticky) db.upsert('notes', { id: noteId, sticky: 1 });
  return true;
}
function newSticky() {
  const n = db.upsert('notes', { title: '', content: '', plain: '', ink: '[]', tag: '', pinned: 0, sticky_color: 'yellow' });
  openSticky(n.id);
  return n.id;
}

// ---------------- tray ----------------
function createTray() {
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')));
  tray.setToolTip('Dani SuperApp');
  buildTrayMenu();
  tray.on('click', () => showMain());
}
function buildTrayMenu() {
  const u = upd.status();
  tray?.setContextMenu(Menu.buildFromTemplate([
    ...(u.state === 'ready' ? [{ label: T('Pasang pembaruan {v} & mulai ulang', { v: u.version }), click: () => upd.install() }, { type: 'separator' }] : []),
    { label: T('Buka Dani SuperApp'), click: () => showMain() },
    { label: T('Catatan cepat'), accelerator: db.getSetting('quickShortcut'), click: toggleQuick },
    { label: T('Widget mini'), click: toggleWidget },
    { label: T('Sticky note baru'), click: () => newSticky() },
    { type: 'separator' },
    { label: T('Kalender'), click: () => showMain({ nav: 'cal' }) },
    { label: T('Catatan'), click: () => showMain({ nav: 'notes' }) },
    { label: T('Keuangan'), click: () => showMain({ nav: 'fin' }) },
    { type: 'separator' },
    { label: T('Keluar|tray'), click: () => { quitting = true; app.quit(); } }
  ]));
}

// ---------------- notifications ----------------
function notify({ title, body, payload }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: asset('icon.png'), timeoutType: payload?.type === 'event' || payload?.type === 'task' ? 'never' : 'default' });
  n.on('click', () => { showMain(payload?.nav ? payload : { nav: 'cal', date: payload?.date, reminder: payload }); liveNotifs.delete(n); });
  n.on('close', () => liveNotifs.delete(n));
  liveNotifs.add(n);
  n.show();
}

// ---------------- backup ----------------
function backupDir() {
  const d = db.getSetting('backupDir') || path.join(app.getPath('documents'), 'Dani SuperApp', 'Backup');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function backupNow(suffix = '') {
  const d = backupDir();
  const ts = new Date();
  const name = `superapp-${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}${suffix}`;
  let file = path.join(d, name + '.dsabak');
  for (let i = 2; fs.existsSync(file); i++) file = path.join(d, `${name}-${i}.dsabak`);
  fs.writeFileSync(file, db.exportEncrypted());
  const keep = Number(db.getSetting('backupKeep', 14)) || 14;
  const files = listBackups();
  for (const f of files.slice(keep)) { try { fs.unlinkSync(f.path); } catch { /* ignore */ } }
  db.setSetting('backup.last', new Date().toISOString());
  return file;
}
function listBackups() {
  const d = backupDir();
  return fs.readdirSync(d).filter((f) => f.endsWith('.dsabak')).map((f) => {
    const p = path.join(d, f); const st = fs.statSync(p);
    return { name: f, path: p, size: st.size, mtime: st.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
}

// ---------------- clipboard history ----------------
let clipTimer = null, lastClip = '';
function setupClipboard() {
  clearInterval(clipTimer);
  if (!db.getSetting('clipboardEnabled', false)) return;
  lastClip = clipboard.readText();
  clipTimer = setInterval(() => {
    const t = clipboard.readText();
    if (!t || t === lastClip || t.length > 20000 || !t.trim()) return;
    lastClip = t;
    const dup = db.list('clipboard', { where: { text: t } })[0];
    if (dup) { db.upsert('clipboard', { id: dup.id, text: t }); return; }
    db.upsert('clipboard', { text: t, pinned: 0 });
    const rest = db.list('clipboard', { where: { pinned: { ne: 1 } }, order: 'updated_at desc' });
    for (const r of rest.slice(100)) db.remove('clipboard', r.id);
  }, 1200);
}

// ---------------- settings side effects ----------------
function applyAutostart() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!db.getSetting('autostart', true), path: process.execPath, args: ['--hidden'] });
}
let currentShortcut = null;
function applyShortcut() {
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  const sc = db.getSetting('quickShortcut', 'CommandOrControl+Shift+Space');
  try { if (sc && globalShortcut.register(sc, toggleQuick)) currentShortcut = sc; } catch { currentShortcut = null; }
}
function applyTheme() {
  const t = db.getSetting('theme', 'system');
  nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system';
  const c = themeColors();
  for (const w of [mainWin]) if (w && !w.isDestroyed()) { try { w.setTitleBarOverlay({ color: c.surface, symbolColor: c.text, height: 44 }); w.setBackgroundColor(c.bg); } catch { /* not supported */ } }
  broadcast('theme:changed', { dark: effectiveDark(), setting: t });
}

// ---------------- PIN (UI lock) ----------------
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function verifyPin(pin) {
  const h = db.getSetting('pinHash', '');
  if (!h) return true;
  const [salt, hash] = h.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

// ---------------- IPC ----------------
function trusted(e) {
  const url = e.senderFrame?.url || '';
  return url.startsWith('file://') || (DEV_URL && url.startsWith(DEV_URL));
}
const handlers = {};
const h = (name, fn) => { handlers[name] = fn; };

const PRIVATE_TABLES = new Set(['note_images']); // binary data: only through img:* and the dsa-img protocol
const pub = (t) => { if (PRIVATE_TABLES.has(t)) throw new Error('Tabel tidak dikenal: ' + t); return t; };
h('db:list', (t, opts) => db.list(pub(t), opts || {}));
h('db:get', (t, id) => db.get(pub(t), id));
h('db:upsert', (t, row) => { if (t === 'settings') throw new Error('Gunakan settings:set'); return db.upsert(pub(t), row); });
h('db:remove', (t, id) => { if (t === 'notes') stickyWins.get(id)?.destroy(); return db.remove(pub(t), id); });
h('db:removeWhere', (t, where) => db.removeWhere(pub(t), where));
h('settings:all', () => db.allSettings());
h('settings:set', (k, v) => {
  if (k === 'pinHash') throw new Error('Gunakan pin:set');
  db.setSetting(k, v);
  if (k === 'autostart') applyAutostart();
  if (k === 'theme') applyTheme();
  if (k === 'clipboardEnabled') setupClipboard();
  if (k === 'quickShortcut') applyShortcut();
  if (k === 'location') svc.clearCache('weather');
  if (k === 'feeds') svc.clearCache('news');
  if (k === 'lang' && v !== lang()) {
    setLang(v);
    buildTrayMenu();
    // reload after this IPC reply is delivered
    setTimeout(() => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) load(w, w.__hash || ''); }, 50);
  }
  return true;
});
h('fin:recap', (y) => db.finRecap(Number(y)));
h('fin:budgets', (y, m) => db.finBudgets(Number(y), Number(m)));
h('search', (q) => db.search(String(q || '')));
h('weather', (force) => svc.weather(!!force));
h('place:search', (q) => svc.searchPlace(String(q)));
h('place:reverse', (lat, lon) => svc.reverseGeocode(Number(lat), Number(lon)));
h('place:ip', () => svc.ipLocation());
h('market:quotes', (syms) => svc.quotes((syms || []).slice(0, 40).map(String)));
h('market:chart', (s, r) => svc.chart(String(s), String(r || '1mo')));
h('market:search', (q) => svc.searchSymbol(String(q)));
h('market:checkAlerts', () => sched.checkAlerts());
h('news:list', (cat, force) => svc.news(cat === 'id' ? 'id' : 'fin', !!force));
h('news:feeds', () => svc.feeds());
h('news:defaultFeeds', () => svc.DEFAULT_FEEDS);
h('holidays', () => svc.holidays(lang()));
h('brief', () => sched.buildBrief());
h('reminder:snooze', (id, m) => sched.snooze(String(id), Number(m) || 10));
h('reminder:dismiss', (id) => sched.dismiss(String(id)));
h('reminder:pending', () => sched.pending());
h('focus:set', (until) => sched.setFocus(Number(until) || 0));
h('backup:now', () => backupNow());
h('backup:list', () => listBackups());
h('backup:openDir', () => shell.openPath(backupDir()));
h('backup:chooseDir', async () => {
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory', 'createDirectory'], title: T('Pilih folder backup') });
  if (r.canceled || !r.filePaths[0]) return null;
  db.setSetting('backupDir', r.filePaths[0]);
  return r.filePaths[0];
});
h('backup:restore', async (filePath, keyHex) => {
  let p = filePath;
  if (!p) {
    const r = await dialog.showOpenDialog(mainWin, { title: T('Pilih file backup'), defaultPath: backupDir(), filters: [{ name: T('Backup Dani SuperApp'), extensions: ['dsabak', 'enc'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    p = r.filePaths[0];
  }
  try { backupNow('-sebelum-pulih'); } catch { /* keep going */ }
  try { db.restoreFrom(fs.readFileSync(p), keyHex || null); return { ok: true, path: p }; }
  catch (e) { if (e.code === 'NEED_KEY') return { needKey: true, path: p }; return { error: T('Gagal memulihkan: kunci salah atau file rusak') }; }
});
h('recovery:key', (pin) => { if (!verifyPin(pin)) throw new Error(T('PIN salah')); return db.getKeyHex().match(/.{1,8}/g).join('-'); });
h('pin:status', () => ({ set: !!db.getSetting('pinHash', '') }));
h('pin:verify', (pin) => verifyPin(pin));
h('pin:set', (oldPin, newPin) => {
  if (!verifyPin(oldPin)) throw new Error(T('PIN lama salah'));
  if (newPin && !/^\d{4,8}$/.test(String(newPin))) throw new Error(T('PIN harus 4–8 angka'));
  db.setSetting('pinHash', newPin ? hashPin(newPin) : '');
  return true;
});
h('export:xlsx', async (year) => {
  const r = await dialog.showSaveDialog(mainWin, { title: T('Ekspor keuangan'), defaultPath: path.join(app.getPath('documents'), `${T('Keuangan')} ${year}.xlsx`), filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (r.canceled || !r.filePath) return null;
  await io.exportFinanceXlsx(Number(year), r.filePath);
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
h('export:csv', async (year) => {
  const r = await dialog.showSaveDialog(mainWin, { title: T('Ekspor CSV'), defaultPath: path.join(app.getPath('documents'), `${T('Transaksi')} ${year}.csv`), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  return io.exportFinanceCsv(Number(year), r.filePath);
});
h('import:csv', async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: T('Impor transaksi (CSV)'), filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return io.importFinanceCsv(r.filePaths[0]);
});
h('export:ics', async () => {
  const r = await dialog.showSaveDialog(mainWin, { title: T('Ekspor kalender'), defaultPath: path.join(app.getPath('documents'), T('Kalender Dani') + '.ics'), filters: [{ name: 'iCalendar', extensions: ['ics'] }] });
  if (r.canceled || !r.filePath) return null;
  return io.exportIcs(r.filePath);
});
h('import:ics', async (calendarId) => {
  const r = await dialog.showOpenDialog(mainWin, { title: T('Impor kalender (.ics)'), filters: [{ name: 'iCalendar', extensions: ['ics'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return io.importIcs(r.filePaths[0], calendarId);
});
// ---------------- note images & export ----------------
// ---------------- auto-update ----------------
h('update:status', () => upd.status());
h('update:check', () => upd.check());
h('update:install', () => upd.install());

h('img:put', (noteId, mime, bytes) => db.imagePut(String(noteId || ''), String(mime), bytes));
const fileSafe = (s) => (String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || T('Tanpa judul'));
const extOf = (mime) => ({ 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[mime] || 'img');
h('note:exportMd', async (id) => {
  const note = db.get('notes', String(id));
  if (!note) return null;
  const r = await dialog.showSaveDialog(mainWin, { title: T('Ekspor catatan ke Markdown'), defaultPath: path.join(app.getPath('documents'), fileSafe(note.title) + '.md'), filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (r.canceled || !r.filePath) return null;
  let doc = null; try { doc = JSON.parse(note.content || 'null'); } catch { /* plain */ }
  const base = path.basename(r.filePath, path.extname(r.filePath));
  const dirName = base + '_files';
  const names = {};
  imageIds(doc).forEach((imgId, i) => {
    const im = db.imageGet(imgId);
    if (!im) return;
    fs.mkdirSync(path.join(path.dirname(r.filePath), dirName), { recursive: true });
    const name = `${i + 1}.${extOf(im.mime)}`;
    fs.writeFileSync(path.join(path.dirname(r.filePath), dirName, name), im.data);
    names[imgId] = `${dirName}/${name}`;
  });
  const md = doc ? toMarkdown(doc, { title: note.title || '', imageSrc: (src) => { const m = /^dsa-img:\/\/img\/([\w-]+)/.exec(src); return m ? names[m[1]] || '' : src; } }) : `# ${note.title || ''}\n\n${note.plain || ''}\n`;
  fs.writeFileSync(r.filePath, md, 'utf8');
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
const printWaiters = new Map();
h('print:ready', (e) => { printWaiters.get(e.sender.id)?.(); });
h('note:exportPdf', async (id) => {
  const note = db.get('notes', String(id));
  if (!note) return null;
  const r = await dialog.showSaveDialog(mainWin, { title: T('Ekspor catatan ke PDF'), defaultPath: path.join(app.getPath('documents'), fileSafe(note.title) + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, backgroundColor: '#ffffff', webPreferences });
  try {
    hardenWindow(win);
    const ready = new Promise((resolve, reject) => {
      printWaiters.set(win.webContents.id, resolve);
      setTimeout(() => reject(new Error(T('Gagal menyiapkan PDF (waktu habis)'))), 20000);
    });
    load(win, '/print/' + encodeURIComponent(note.id));
    await ready;
    // the note page is 820 px wide; A4 with 1 cm margins fits ~717 px, so print at 87 %
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, scale: 0.87, margins: { top: 0.4, bottom: 0.4, left: 0.39, right: 0.39 } });
    fs.writeFileSync(r.filePath, pdf);
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  } finally {
    printWaiters.delete(win.webContents.id);
    win.destroy();
  }
});

h('shell:open', (url) => { if (/^https?:\/\//.test(String(url))) shell.openExternal(String(url)); });
h('clipboard:write', (t) => { lastClip = String(t); clipboard.writeText(String(t)); });
h('win:quick', () => toggleQuick());
h('win:widget', () => toggleWidget());
h('sticky:open', (id) => openSticky(String(id)));
h('sticky:new', () => newSticky());
h('sticky:setTop', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const id = [...stickyWins].find(([, w]) => w === win)?.[0];
  if (!win || !id) return false;
  win.setAlwaysOnTop(!!on, 'floating');
  db.upsert('notes', { id, sticky_top: on ? 1 : 0 });
  return !!on;
});
h('sticky:setColor', (e, color) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const id = [...stickyWins].find(([, w]) => w === win)?.[0];
  if (!win || !id) return false;
  const c = stickyColor(color);
  win.setBackgroundColor(effectiveDark() ? c.dark : c.light);
  db.upsert('notes', { id, sticky_color: color });
  return true;
});
h('win:hideSelf', (e) => { BrowserWindow.fromWebContents(e.sender)?.hide(); });
h('win:closeSelf', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
h('win:show', (nav) => showMain(nav));
h('nav:pending', () => { const n = pendingNav; pendingNav = null; return n; });
h('theme:get', () => ({ dark: effectiveDark(), setting: db.getSetting('theme', 'system') }));
h('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, dataDir: app.getPath('userData'), encrypted: safeStorage.isEncryptionAvailable(), backupDir: backupDir() }));

const NEEDS_EVENT = new Set(['win:hideSelf', 'win:closeSelf', 'sticky:setTop', 'sticky:setColor', 'print:ready']);
function registerIpc() {
  ipcMain.handle('invoke', async (e, name, ...args) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    const fn = handlers[name];
    if (!fn) throw new Error('Unknown channel ' + name);
    return NEEDS_EVENT.has(name) ? fn(e, ...args) : fn(...args);
  });
}

// ---------------- lifecycle ----------------
app.on('second-instance', () => showMain());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); sched.stop(); try { state.save(); } catch { /* ignore */ } db.closeDb(); });
app.on('window-all-closed', () => { /* stay in tray */ });

app.whenReady().then(async () => {
  // allow geolocation for "Deteksi lokasi"; deny everything else
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'geolocation' || perm === 'notifications'));
  const hadData = fs.existsSync(path.join(app.getPath('userData'), 'data.db.enc'));
  await db.openDb({ dir: app.getPath('userData'), keyStore, wasmPath: require.resolve('sql.js/dist/sql-wasm.wasm') });
  state.open(app.getPath('userData'));
  try { db.pruneImages(); } catch (e) { console.error('[images]', e); }
  protocol.handle('dsa-img', (req) => {
    const id = new URL(req.url).pathname.replace(/^\//, '');
    const im = db.imageGet(id);
    return im ? new Response(im.data, { headers: { 'content-type': im.mime, 'cache-control': 'private, max-age=31536000, immutable' } }) : new Response('', { status: 404 });
  });
  setLang(db.getSetting('lang', 'id'));
  // data lives in %APPDATA% and survives updates; still keep a backup from before each version change
  if (db.getSetting('app.version') !== app.getVersion()) {
    if (hadData) { try { backupNow(`-sebelum-v${app.getVersion()}`); } catch (e) { console.error('[backup]', e); } }
    db.setSetting('app.version', app.getVersion(), true);
  }
  db.onChange((tables) => broadcast('db:changed', tables));
  registerIpc();
  applyTheme();
  // started by Windows in the tray: create the window only when it is opened (saves RAM at boot)
  if (!startHidden) createMain();
  createTray();
  upd.initUpdater({
    broadcast, getSetting: db.getSetting,
    onReady: (v) => { buildTrayMenu(); notify({ title: T('Pembaruan siap'), body: T('Dani SuperApp {v} sudah diunduh. Pasang dari Pengaturan → Umum atau menu tray.', { v }), payload: { nav: 'settings' } }); }
  });
  applyAutostart();
  applyShortcut();
  setupClipboard();
  if (db.getSetting('widget.open', false)) toggleWidget();
  for (const n of db.list('notes', { where: { sticky: 1 } })) openSticky(n.id); // reopen floating notes like Windows Sticky Notes
  nativeTheme.on('updated', () => { const c = themeColors(); try { mainWin?.setTitleBarOverlay({ color: c.surface, symbolColor: c.text, height: 44 }); } catch { /* */ } broadcast('theme:changed', { dark: effectiveDark(), setting: db.getSetting('theme', 'system') }); });
  sched.start({ notify, send: broadcast, backup: backupNow });
  const wake = () => { sched.wake(); broadcast('power:resume', Date.now()); };
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
  powerMonitor.on('lock-screen', () => broadcast('power:lock', Date.now()));
});
