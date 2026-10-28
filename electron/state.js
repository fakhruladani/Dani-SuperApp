// Small, frequently-changing state kept OUTSIDE the main database, so it does not
// trigger a full export + re-encrypt of the database every few seconds:
// network caches (weather, quotes, news, holidays) and the scheduler's last check time.
// Stored encrypted with the same key, written at most every few seconds.
import fs from 'node:fs';
import path from 'node:path';
import * as db from './db.js';

let file = null;
let data = {};
let timer = null;

export function open(dir) {
  file = path.join(dir, 'state.bin');
  try { if (fs.existsSync(file)) data = JSON.parse(db.decrypt(fs.readFileSync(file)).toString('utf8')); } catch { data = {}; }
  // one-time migration: older versions kept these inside the database
  for (const r of db.all("SELECT id, value FROM settings WHERE id LIKE 'cache.%' OR id = 'scheduler.lastCheck'")) {
    if (!(r.id in data)) { try { data[r.id] = JSON.parse(r.value); } catch { /* skip */ } }
    db.run('DELETE FROM settings WHERE id = ?', [r.id]);
  }
}

export const get = (k, fallback = null) => (k in data ? data[k] : fallback);
export function set(k, v) { data[k] = v; clearTimeout(timer); timer = setTimeout(save, 3000); }

export function save() {
  clearTimeout(timer);
  if (!file) return;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, db.encrypt(Buffer.from(JSON.stringify(data))));
  fs.renameSync(tmp, file);
}
