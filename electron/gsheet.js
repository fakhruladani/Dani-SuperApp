// Import transactions from a Google Sheet (see shared/gsheet.js). Runs on the desktop (Electron main)
// and in the Android app (same file, see vite.android.config.js). Both devices may import: the ids
// come from the sheet, so the same row is never added twice and phone sync merges them.
import * as db from './db.js';
import { parseSheet, decide } from '../shared/gsheet.js';

let timer = null;
let running = null;
let notify = () => {};
let last = null; // { at, added, updated, skipped, error }

const cfg = () => db.getSetting('gsheet', null) || {};

/** GET the Apps Script web app. Returns its JSON; throws Error with a code the UI translates. */
export async function fetchSheet(url, key) {
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(String(url || ''))) throw Object.assign(new Error('URL'), { code: 'URL' });
  const u = new URL(url);
  u.searchParams.set('key', String(key || ''));
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  let r;
  try { r = await (globalThis.__dsaFetch || fetch)(u.toString(), { signal: ctl.signal, redirect: 'follow' }); }
  catch { throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' }); }
  finally { clearTimeout(t); }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* an HTML page: wrong URL, or the web app is not shared with "Anyone" */ }
  if (!j) throw Object.assign(new Error('NOT_JSON'), { code: 'NOT_JSON' });
  if (j.error === 'forbidden') throw Object.assign(new Error('KEY'), { code: 'KEY' });
  if (j.error) throw Object.assign(new Error(String(j.error)), { code: 'SCRIPT' });
  if (!Array.isArray(j.header) || !Array.isArray(j.rows)) throw Object.assign(new Error('FORMAT'), { code: 'FORMAT' });
  return j;
}

const context = (since) => ({ cats: db.list('fin_categories'), history: db.list('fin_tx', { order: 'date desc', limit: 500 }), since });

/** Reads the sheet without saving anything: for the settings preview. */
export async function test(url, key, since = '') {
  const j = await fetchSheet(url, key);
  const p = parseSheet(j, context(since));
  if (p.error) throw Object.assign(new Error(`${p.error}:${(p.missing || []).join(',')}`), { code: p.error });
  const names = Object.fromEntries(db.list('fin_categories').map((c) => [c.id, c.name]));
  const plan = p.items.map((it) => ({ ...it, categoryName: names[it.category_id] || '', action: decide(it, db.get('fin_tx', it.id), db.isDeleted('fin_tx', it.id)) }));
  return { sheet: j.sheet || '', total: p.items.length, skipped: p.skipped, preview: plan.slice(-8).reverse(), counts: { add: plan.filter((x) => x.action === 'add').length, update: plan.filter((x) => x.action === 'update').length } };
}

/** Imports new and changed rows. quiet: no toast unless something was added. */
export function importNow({ quiet = false } = {}) {
  if (running) return running;
  running = (async () => {
    const c = cfg();
    if (!c.url || !c.key) return null;
    try {
      const j = await fetchSheet(c.url, c.key);
      const p = parseSheet(j, context(c.since || ''));
      if (p.error) throw Object.assign(new Error(p.error), { code: p.error });
      let added = 0, updated = 0;
      for (const it of p.items) {
        const act = decide(it, db.get('fin_tx', it.id), db.isDeleted('fin_tx', it.id));
        if (act === 'keep') continue;
        db.upsert('fin_tx', { id: it.id, date: it.date, description: it.description, amount: it.amount, kind: it.kind, category_id: it.category_id, src: 'gs:' + it.hash, ...(act === 'add' ? { note: '' } : {}) }, true);
        act === 'add' ? added++ : updated++;
      }
      if (added || updated) db.touched(['fin_tx']); // one change event for a whole batch
      last = { at: Date.now(), added, updated, skipped: p.skipped.length, error: null };
    } catch (e) {
      last = { at: Date.now(), added: 0, updated: 0, skipped: 0, error: e.code || 'NETWORK' };
    }
    if (!quiet || last.added || last.updated || last.error) notify({ ...last, quiet });
    return last;
  })().finally(() => { running = null; });
  return running;
}

export const status = () => ({ ...cfg(), key: cfg().key ? '••••' : '', hasKey: !!cfg().key, last, running: !!running });

/** Starts the periodic import (every 5 minutes, first one shortly after start). */
export function start({ onEvent } = {}) {
  notify = onEvent || notify;
  clearInterval(timer);
  const tick = () => { if (cfg().auto !== false && cfg().url) importNow({ quiet: true }); };
  setTimeout(tick, 8000);
  timer = setInterval(tick, 5 * 60000);
}
