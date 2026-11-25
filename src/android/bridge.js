// Android app: the "main process" runs inside the WebView. install() opens the database, registers
// the same handlers as the desktop app (electron/common.js) plus Android versions of the platform
// ones, and exposes them as window.dsa, so the React UI runs unchanged.
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Browser } from '@capacitor/browser';
import * as db from './db.js';
import * as state from './state.js';
import * as svc from '../../electron/services.js';
import * as sched from '../../electron/scheduler.js';
import * as io from '../../electron/io.js';
import { registerCommon } from '../../electron/common.js';
import { vfs } from './shims/fs.js';
import { nativeFetch } from './http.js';
import { shareFile, pickFile } from './files.js';
import { imageUrl, imageSrc } from './images.js';
import * as reminders from './reminders.js';
import * as sync from './syncClient.js';
import * as gsheet from '../../electron/gsheet.js';
import { toText } from '../../shared/md.js';
import { t as T, setLang, lang } from '../../shared/i18n.js';
import { b64 } from '../../shared/sync.js';

const EVENTS = new Set(['db:changed', 'reminder:fire', 'nav', 'theme:changed', 'power:resume', 'power:lock', 'quick:shown', 'update:status', 'sync:event', 'gsheet:event']);
const listeners = new Map();
function emit(event, data) { for (const cb of listeners.get(event) || []) { try { cb(data); } catch (e) { console.error(e); } } }

const handlers = {};
const h = (name, fn) => { handlers[name] = fn; };
const REPO = 'fakhruladani/Dani-SuperApp';
let pendingNav = null;
let info = { version: __APP_VERSION__, name: 'Android' };
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = db.getSetting('theme', 'system'); return t === 'dark' || (t === 'system' && darkQuery.matches); };
// status bar icons readable on the app's own background (light icons on dark theme)
function paintBars() {
  if (!Capacitor.isNativePlatform()) return;
  const dark = isDark();
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: dark ? '#151920' : '#FFFFFF' }).catch(() => {});
}
const unsupported = () => { throw new Error(T('Tidak tersedia di versi Android')); };
const fileSafe = (s) => (String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || T('Tanpa judul'));

// ---------- PIN (PBKDF2 here; the desktop uses scrypt, PINs are per device anyway) ----------
async function pbkdf2(pin, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, k, 256));
  return [...bits].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function verifyPin(pin) {
  const hv = db.getSetting('pinHash', '');
  if (!hv) return true;
  const [kind, salt, hash] = hv.split(':');
  if (kind !== 'pbkdf2') return false;
  const test = await pbkdf2(pin, salt);
  let diff = test.length ^ hash.length;
  for (let i = 0; i < Math.min(test.length, hash.length); i++) diff |= test.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// ---------- update check: the APK is installed by the user from the GitHub release ----------
let upd = { state: 'idle', current: '' };
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate() {
  upd = { state: 'checking', current: info.version }; emit('update:status', upd);
  try {
    const r = await nativeFetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    const j = await r.json();
    const v = String(j.tag_name || '').replace(/^v/, '');
    const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
    upd = v && apk && newer(v, info.version) ? { state: 'ready', current: info.version, version: v, url: apk.browser_download_url, notes: j.body || '' } : { state: 'none', current: info.version, checkedAt: Date.now() };
  } catch (e) { upd = { state: 'error', current: info.version, error: String(e?.message || e) }; }
  emit('update:status', upd);
  return upd;
}

function registerAndroid() {
  registerCommon(h, {
    onSetting: (k, v) => {
      if (k === 'theme') { emit('theme:changed', { dark: isDark(), setting: v }); paintBars(); }
      if (k === 'lang' && v !== lang()) setTimeout(() => { db.saveNow(); const u = new URL(location.href); u.searchParams.set('lang', v); location.replace(u.toString()); }, 50);
      if (['briefEnabled', 'briefTime'].includes(k)) reminders.replan();
    }
  });
  h('theme:get', () => ({ dark: isDark(), setting: db.getSetting('theme', 'system') }));
  h('app:info', () => ({ version: info.version, packaged: true, platform: 'android', dataDir: '', encrypted: true, backupDir: '' }));
  h('nav:pending', () => { const n = pendingNav; pendingNav = null; return n; });
  h('pin:status', () => ({ set: !!db.getSetting('pinHash', '') }));
  h('pin:verify', (pin) => verifyPin(pin));
  h('pin:set', async (oldPin, newPin) => {
    if (!(await verifyPin(oldPin))) throw new Error(T('PIN lama salah'));
    if (newPin && !/^\d{4,8}$/.test(String(newPin))) throw new Error(T('PIN harus 4–8 angka'));
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    db.setSetting('pinHash', newPin ? `pbkdf2:${salt}:${await pbkdf2(newPin, salt)}` : '');
    return true;
  });
  h('recovery:key', unsupported);
  // exports: build the file in memory, then the share sheet
  const out = async (name, mime, make) => { const p = '/out/' + name; await make(p); const data = vfs.get(p); vfs.delete(p); return shareFile(name, data, mime); };
  h('export:xlsx', async (year) => { globalThis.__exceljs ||= (await import('exceljs')).default; return out(`${T('Keuangan')} ${year}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (p) => io.exportFinanceXlsx(Number(year), p)); });
  h('export:csv', (year) => out(`${T('Transaksi')} ${year}.csv`, 'text/csv', (p) => io.exportFinanceCsv(Number(year), p)));
  h('export:ics', () => out(T('Kalender') + '.ics', 'text/calendar', (p) => io.exportIcs(p)));
  const pickText = async (accept) => { const f = await pickFile(accept); if (!f) return null; if (f.size > 5 * 1024 * 1024) throw new Error(T('File terlalu besar')); const buf = new Uint8Array(await f.arrayBuffer()); return buf[0] === 0xff && buf[1] === 0xfe ? new TextDecoder('utf-16le').decode(buf) : new TextDecoder().decode(buf); };
  const pickIn = async (accept, run) => { const text = await pickText(accept); if (text == null) return null; vfs.set('/in', text); try { return run('/in'); } finally { vfs.delete('/in'); } };
  h('import:csv', () => pickIn('.csv,text/csv,text/comma-separated-values', (p) => io.importFinanceCsv(p)));
  h('import:ics', (calId) => pickIn('.ics,text/calendar', (p) => io.importIcs(p, calId)));
  h('file:readText', () => pickText('.csv,.tsv,.txt,text/*'));
  h('note:exportTxt', (id) => {
    const note = db.get('notes', String(id));
    if (!note) return null;
    let doc = null; try { doc = JSON.parse(note.content || 'null'); } catch { /* plain */ }
    const txt = doc ? toText(doc, { title: note.title || '' }) : `${note.title || ''}\r\n\r\n${note.plain || ''}\r\n`;
    return shareFile(fileSafe(note.title) + '.txt', '﻿' + txt, 'text/plain');
  });
  h('note:saveDocx', (id, bytes) => { const note = db.get('notes', String(id)); return note ? shareFile(fileSafe(note.title) + '.docx', bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') : null; });
  h('note:exportPdf', unsupported);
  h('note:exportMd', unsupported);
  h('clipboard:read', () => navigator.clipboard.readText().catch(() => ''));
  h('clipboard:write', (t) => navigator.clipboard.writeText(String(t)).catch(() => {}));
  // links open in a browser tab over the app (Custom Tab), never inside the app's own page
  const openUrl = (url) => (Capacitor.isNativePlatform() ? Browser.open({ url }) : window.open(url, '_blank'));
  h('shell:open', (url) => { if (/^https?:\/\//.test(String(url))) openUrl(String(url)); });
  h('update:status', () => ({ ...upd, current: info.version }));
  h('notify:test', () => reminders.test());
  h('update:check', () => checkUpdate());
  h('update:install', () => { if (upd.url) openUrl(upd.url); return true; });
  h('backup:list', () => []);
  for (const n of ['backup:now', 'backup:openDir', 'backup:chooseDir', 'backup:restore', 'win:quick', 'win:widget', 'sticky:open', 'sticky:new', 'export:pdf']) h(n, unsupported);
  for (const n of ['win:hideSelf', 'win:closeSelf', 'win:show', 'sticky:setTop', 'sticky:setColor', 'print:ready', 'edit:cmd', 'edit:copyImageAt']) h(n, () => null);
  // phone sync
  h('sync:status', () => sync.status());
  h('sync:pair', (code) => sync.pair(String(code || '')));
  h('sync:now', () => sync.syncAll({}));
  h('sync:unpair', (id) => sync.unpair(String(id)));
}

export async function install() {
  try { const i = await CapApp.getInfo(); if (i?.version) info = i; } catch { /* browser */ }
  let model = 'HP';
  try { const d = await Device.getInfo(); model = [d.manufacturer, d.model].filter(Boolean).join(' ') || 'HP'; } catch { /* browser */ }
  await db.openDb();
  state.open();
  // language is fixed per page load (as on desktop): reload once if the saved one differs
  const want = db.getSetting('lang', 'id');
  if (want !== lang() && new URLSearchParams(location.search).get('lang') !== want) {
    const u = new URL(location.href); u.searchParams.set('lang', want); location.replace(u.toString());
    await new Promise(() => {}); // the page is going away
  }
  setLang(want);
  globalThis.__dsaFetch = nativeFetch;
  try { db.pruneImages(); } catch (e) { console.error('[images]', e); }
  registerAndroid();

  db.onChange((tables) => {
    emit('db:changed', tables);
    if (tables.some((t) => ['events', 'tasks', 'settings'].includes(t))) reminders.replan();
    if (!sync.isBusy() && tables.some((t) => t !== 'reminder_log')) sync.changed();
  });
  darkQuery.addEventListener('change', () => { emit('theme:changed', { dark: isDark(), setting: db.getSetting('theme', 'system') }); paintBars(); });
  paintBars();
  sched.start({ notify: (n) => emit('reminder:fire', n.payload || {}), send: emit, reminders: false, brief: false, backup: null });
  sync.init({ deviceName: () => model, onEvent: (ev) => emit('sync:event', ev) });
  gsheet.start({ onEvent: (ev) => emit('gsheet:event', ev) });
  reminders.init({ tap: (extra) => { const nav = extra.type === 'brief' ? { nav: 'home' } : { nav: extra.type === 'task' ? 'focus' : 'cal', date: extra.date }; pendingNav = nav; emit('nav', nav); } });

  addEventListener('pagehide', () => { db.saveNow(); state.save(); });
  if (Capacitor.isNativePlatform()) {
    CapApp.addListener('pause', () => { db.saveNow(); state.save(); });
    CapApp.addListener('resume', () => { sched.wake(); emit('power:resume', Date.now()); sync.syncAll({ quiet: true }); reminders.replan(); gsheet.importNow({ quiet: true }); });
    CapApp.addListener('backButton', () => {
      // close the top-most popup first (they all listen for Esc), else go back to Beranda, else leave
      if (document.querySelector('.overlay, .ctx-menu, .menu-pop, .tag-pop, .qb, .sheet')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      if (window.__dsaBack?.()) return;
      CapApp.minimizeApp();
    });
    setTimeout(() => { if (db.getSetting('autoUpdate', true)) checkUpdate(); }, 20000);
  }

  window.dsa = {
    platform: 'android',
    invoke: async (name, ...args) => {
      const fn = handlers[name];
      if (!fn) throw new Error('Unknown channel ' + name);
      // structured clone like Electron IPC: the UI never gets live references into the backend
      const r = await fn(...args);
      return r instanceof Uint8Array ? r.slice() : r === undefined ? undefined : structuredClone(r);
    },
    on: (event, cb) => {
      if (!EVENTS.has(event)) throw new Error('Event tidak diizinkan: ' + event);
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => listeners.get(event).delete(cb);
    },
    imageUrl, imageSrc
  };
}
