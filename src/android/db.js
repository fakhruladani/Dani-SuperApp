// Android counterpart of electron/db.js (the Android build points `./db.js` imports of the desktop
// backend here). Same database logic (shared/dbcore.js); the file lives in the app's private
// storage, encrypted with AES-256-GCM under a key that is generated on the phone, marked
// non-extractable and kept in the WebView's IndexedDB, so the raw key is never readable by code.
import { Filesystem, Directory } from '@capacitor/filesystem';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import * as core from '../../shared/dbcore.js';
import { b64, unb64 } from '../../shared/sync.js';

export * from '../../shared/dbcore.js';

const FILE = 'data.db.enc';
const MAGIC = [0x44, 0x53, 0x41, 0x41]; // "DSAA": Android file, WebCrypto layout (iv | ciphertext+tag)
let key = null;
let writing = Promise.resolve();
let timer = null;

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('dsa-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function loadKey() {
  const store = await idb();
  const get = (mode, fn) => new Promise((resolve, reject) => { const tx = store.transaction('k', mode); const q = fn(tx.objectStore('k')); tx.oncomplete = () => resolve(q?.result); tx.onerror = () => reject(tx.error); });
  let k = await get('readonly', (s) => s.get('db'));
  if (!k) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await get('readwrite', (s) => s.put(k, 'db'));
  }
  return k;
}

async function encrypt(plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(MAGIC); out.set(iv, 4); out.set(ct, 16);
  return out;
}
async function decrypt(buf) {
  if (!MAGIC.every((m, i) => buf[i] === m)) throw new Error("Bukan file data D'Super App");
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(4, 16) }, key, buf.subarray(16)));
}

async function readFile() {
  try {
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data });
    return typeof r.data === 'string' ? unb64(r.data) : new Uint8Array(await r.data.arrayBuffer());
  } catch { return null; }
}
function writeNow() {
  clearTimeout(timer);
  // serialised: a slow write must not be overtaken by an older snapshot
  writing = writing.then(async () => {
    const data = b64(await encrypt(core.exportBytes()));
    await Filesystem.writeFile({ path: FILE + '.tmp', data, directory: Directory.Data });
    await Filesystem.rename({ from: FILE + '.tmp', to: FILE, directory: Directory.Data, toDirectory: Directory.Data });
  }).catch((e) => console.error('[db] save failed', e));
  return writing;
}
// the core asks to persist ~0.4 s after a change; on a phone, batch a little more
const persist = () => { clearTimeout(timer); timer = setTimeout(writeNow, 1200); };

export async function openDb() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  key = await loadKey();
  const raw = await readFile();
  let plain = null;
  if (raw) {
    try { plain = await decrypt(raw); } catch (e) {
      // the key is gone (app storage partly cleared): keep the unreadable file aside and start empty;
      // the data comes back from the laptop on the next sync
      console.error('[db] cannot decrypt, starting fresh', e);
      await Filesystem.rename({ from: FILE, to: `${FILE}.unreadable-${Date.now()}`, directory: Directory.Data, toDirectory: Directory.Data }).catch(() => {});
    }
  }
  core.init(SQL, plain, { persist });
}
/** Writes immediately (app going to the background). */
export const saveNow = () => { core.flush(); return writeNow(); };
export const closeDb = () => saveNow();
