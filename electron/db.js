// Encrypted local database for the desktop app. The logic lives in shared/dbcore.js (also used
// by the Android app); this file adds the Windows side: the database is kept in memory and
// persisted as one AES-256-GCM encrypted file. The data key is wrapped with Windows DPAPI through
// Electron safeStorage, so the app can start (and fire reminders) without a password, while the
// file on disk is unreadable without this Windows account or the recovery key.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as core from '../shared/dbcore.js';

export * from '../shared/dbcore.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const MAGIC = Buffer.from('DSA1');
let key = null;
let file = null;

export function encrypt(buf, k = key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}

export function decrypt(buf, k = key) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error("Bukan file data D'Super App");
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), data = buf.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

function writeFile() {
  const buf = encrypt(Buffer.from(core.exportBytes()));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

/** keyStore: { load(): Buffer|null, save(Buffer) } — wraps DPAPI in production, plain in tests. */
export async function openDb({ dir, keyStore, wasmPath }) {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'data.db.enc');
  key = keyStore.load();
  if (!key) { key = crypto.randomBytes(32); keyStore.save(key); }
  return core.init(SQL, fs.existsSync(file) ? decrypt(fs.readFileSync(file)) : null, { persist: writeFile });
}

export function getKeyHex() { return key.toString('hex'); }
export function dataFile() { return file; }
export const saveNow = () => core.flush();

export function imageGet(id) {
  const im = core.imageGet(id);
  return im ? { mime: im.mime, data: Buffer.from(im.data) } : null;
}

// ---------- backup / restore ----------
export function exportEncrypted() { core.flush(); return fs.readFileSync(file); }

export function restoreFrom(buf, recoveryKeyHex = null) {
  let plain;
  try { plain = decrypt(buf); } catch {
    if (!recoveryKeyHex) { const err = new Error('NEED_KEY'); err.code = 'NEED_KEY'; throw err; }
    plain = decrypt(buf, Buffer.from(recoveryKeyHex.replace(/[^0-9a-f]/gi, ''), 'hex'));
  }
  core.replaceWith(plain);
}

export function closeDb() { core.close(); }
