// Phone side of laptop sync: pairing from the scanned QR code, sync on start, on resume, every
// minute while the app is open and a few seconds after a local change. When the laptop's address
// changed (new DHCP lease), its old subnet is scanned to find it again.
import * as db from './db.js';
import { createClient } from '../../shared/sync.js';

let client = null;
let emit = () => {};
let busy = null;
let state = { syncing: false, lastError: '', lastResult: null, lastAt: null };
let loop = null;
let soon = null;
const lastProbe = {};

async function post(addr, op, env) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), op === 'ping' ? 1500 : op === 'sync' ? 60000 : 30000);
  try {
    const r = await fetch(`http://${addr}/v1/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(env), signal: ctl.signal });
    if (!r.ok) throw new Error(r.status === 403 ? 'FORBIDDEN' : 'HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export function init({ deviceName, onEvent }) {
  emit = onEvent || emit;
  client = createClient({ core: db, post, deviceName });
  loop = setInterval(() => { if (document.visibilityState === 'visible') syncAll({ quiet: true }); }, 60000);
  setTimeout(() => syncAll({ quiet: true }), 1500);
}

export const status = () => ({ role: 'phone', ...state, peers: db.peers() });
const set = (patch) => { state = { ...state, ...patch }; emit({ type: 'status', ...state }); };

export async function pair(code) {
  const p = await client.pair(code);
  emit({ type: 'paired', name: p.name });
  await syncAll({});
  return status();
}

/** Every address on the /24 networks of the addresses we knew, for finding the laptop again. */
function neighbours(peer) {
  const out = [];
  for (const a of client.addrList(peer)) {
    const m = /^(\d+\.\d+\.\d+)\.(\d+):(\d+)$/.exec(a);
    if (!m) continue;
    for (let i = 1; i < 255; i++) if (String(i) !== m[2]) out.push(`${m[1]}.${i}:${m[3]}`);
  }
  return [...new Set(out)];
}

async function syncOne(peer) {
  try {
    return await client.sync(peer.id, { onProgress: (step) => emit({ type: 'progress', step }) });
  } catch (e) {
    if (String(e?.message) === 'FORBIDDEN') throw new Error('UNPAIRED');
    // scanning the subnet costs ~250 requests: at most every 10 minutes (the laptop may just be off)
    if (Date.now() - (lastProbe[peer.id] || 0) < 10 * 60000) throw e;
    lastProbe[peer.id] = Date.now();
    const found = await client.probe(peer, neighbours(peer)).catch(() => null);
    if (!found) throw e;
    db.peerSave({ id: peer.id, addr: [found, ...client.addrList(peer)].join(',') });
    return client.sync(peer.id);
  }
}

/** Syncs with every paired laptop. quiet: errors only go to the status, no toast. */
export function syncAll({ quiet = false } = {}) {
  if (busy) return busy;
  const peers = db.peers();
  if (!peers.length) return Promise.resolve(null);
  set({ syncing: true });
  busy = (async () => {
    let result = null, error = '';
    for (const p of peers) {
      try { result = await syncOne(db.peer(p.id)); }
      catch (e) { error = String(e?.message || e) === 'UNPAIRED' ? 'UNPAIRED' : 'OFFLINE'; }
    }
    set({ syncing: false, lastError: error, lastResult: result, lastAt: error ? state.lastAt : Date.now() });
    if (!quiet || (result && result.received)) emit({ type: error ? 'error' : 'synced', error, result, quiet });
    return result;
  })().finally(() => { busy = null; });
  return busy;
}

/** A local edit: push it shortly (one sync for a burst of edits). */
export function changed() { clearTimeout(soon); soon = setTimeout(() => syncAll({ quiet: true }), 4000); }

export async function unpair(id) {
  const p = db.peer(id);
  if (p) { try { await client.call(p, 'unpair', {}); } catch { /* laptop offline: forget it here anyway */ } }
  db.peerRemove(id);
  return status();
}

export function stop() { clearInterval(loop); }
export const isBusy = () => !!busy;
