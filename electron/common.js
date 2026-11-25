// IPC handlers that work the same on desktop (Electron main) and Android (WebView backend):
// database CRUD, settings, finance, search, online data, reminders, Total Wealth, note images.
// Platform code passes hooks for its own side effects (windows, tray, theme, ...).
import * as db from './db.js';
import * as svc from './services.js';
import * as sched from './scheduler.js';
import * as gsheet from './gsheet.js';
import { lang } from '../shared/i18n.js';

const PRIVATE_TABLES = new Set(['note_images']); // binary data: only through img:* and the image protocol
const pub = (t) => { if (PRIVATE_TABLES.has(t)) throw new Error('Tabel tidak dikenal: ' + t); return t; };

export function registerCommon(h, { beforeRemove = () => {}, onSetting = () => {} } = {}) {
  h('db:list', (t, opts) => db.list(pub(t), opts || {}));
  h('db:get', (t, id) => db.get(pub(t), id));
  h('db:upsert', (t, row) => { if (t === 'settings') throw new Error('Gunakan settings:set'); return db.upsert(pub(t), row); });
  h('db:remove', (t, id) => { beforeRemove(t, id); return db.remove(pub(t), id); });
  h('db:removeWhere', (t, where) => db.removeWhere(pub(t), where));
  h('settings:all', () => db.allSettings());
  h('settings:set', (k, v) => {
    if (k === 'pinHash') throw new Error('Gunakan pin:set');
    db.setSetting(k, v);
    if (k === 'location') svc.clearCache('weather');
    if (k === 'feeds') svc.clearCache('news');
    onSetting(k, v);
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
  // Total Wealth sheet
  h('wealth:import', (cells) => db.wealthImport(Array.isArray(cells) ? cells : []));
  h('wealth:snapshot', (date) => db.wealthSnapshot(String(date)));
  h('wealth:moveDate', (from, to) => db.wealthMoveDate(String(from), String(to)));
  h('wealth:deleteDate', (date) => db.wealthDeleteDate(String(date)));
  h('wealth:renameCol', (from, to) => db.wealthRenameCol(from || {}, to || {}));
  h('wealth:deleteCol', (col) => db.wealthDeleteCol(col || {}));
  // Google Sheets import (errors carry a short code as their message, see GSheetPanel)
  h('gsheet:status', () => gsheet.status());
  h('gsheet:test', (url, key, since) => gsheet.test(String(url || '').trim(), String(key || '').trim(), String(since || '')));
  h('gsheet:import', () => gsheet.importNow({}));
  // note images
  h('img:put', (noteId, mime, bytes) => db.imagePut(String(noteId || ''), String(mime), bytes));
  // bytes of one note image, for the Word export (fetch() of the image URL from the page is a cross-origin request)
  h('img:get', (id) => { const im = db.imageGet(String(id || '')); return im ? { mime: im.mime, data: im.data } : null; });
}
