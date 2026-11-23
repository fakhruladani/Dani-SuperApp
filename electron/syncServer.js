// Laptop side of phone sync: a small HTTP server on the local network. It only runs while sync is
// switched on (or a pairing QR code is open). Every request and reply is encrypted with the key of
// a paired phone (see shared/sync.js), so the server answers nothing useful to anyone else.
import http from 'node:http';
import os from 'node:os';
import * as db from './db.js';
import { createServer as createSyncLogic, pairingPayload, randomKey, SYNC_PORT } from '../shared/sync.js';

const MAX_BODY = 96 * 1024 * 1024;
let server = null;
let logic = null;
let pairing = null; // { key, until }
let lastError = '';
let notify = () => {};

/** IPv4 addresses of this laptop on its networks, most likely home/office Wi-Fi first. */
export function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|Loopback|Tailscale|ZeroTier/i.test(name);
      const rank = virtual ? 3 : a.address.startsWith('192.168.') ? 0 : a.address.startsWith('10.') ? 1 : 2;
      out.push({ address: a.address, rank });
    }
  }
  return out.sort((x, y) => x.rank - y.rank).map((x) => x.address);
}

const pairingKey = () => (pairing && Date.now() < pairing.until ? pairing.key : null);
const deviceName = () => (os.hostname() || 'Laptop').slice(0, 40);

export function init({ onEvent }) {
  notify = onEvent || notify;
  logic = createSyncLogic({
    core: db, deviceName, pairing: pairingKey,
    onPaired: (p) => { pairing = null; db.setSetting('syncEnabled', true, true); notify({ type: 'paired', name: p.name }); },
    onSynced: (p, res) => notify({ type: 'synced', name: p.name, tables: res.tables })
  });
}

export function running() { return !!server?.listening; }

export function start() {
  if (server) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = http.createServer(handle);
    s.on('error', (e) => { lastError = e.code === 'EADDRINUSE' ? `Port ${SYNC_PORT} sudah dipakai aplikasi lain` : String(e.message || e); server = null; resolve(false); });
    s.listen(SYNC_PORT, '0.0.0.0', () => { lastError = ''; server = s; resolve(true); });
  });
}
export function stop() { server?.close(); server = null; }

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
    return res.end();
  }
  const m = /^\/v1\/([a-z/]+)$/.exec(req.url || '');
  if (req.method !== 'POST' || !m) return send(res, 404, { error: 'not found' });
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); return; } chunks.push(c); });
  req.on('end', async () => {
    try {
      const env = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      send(res, 200, await logic(m[1], env));
    } catch (e) {
      send(res, e.status || 400, { error: e.status === 403 ? 'forbidden' : 'bad request' });
    }
  });
}

/** Opens pairing for 10 minutes and returns what the QR code shows. */
export async function pairStart() {
  if (!(await start())) throw new Error(lastError || 'Server sinkron gagal berjalan');
  pairing = { key: randomKey(), until: Date.now() + 10 * 60000 };
  const addrs = addresses();
  return { code: pairingPayload({ device: db.deviceId(), name: deviceName(), addrs, port: SYNC_PORT, key: pairing.key }), addrs, port: SYNC_PORT, until: pairing.until, name: deviceName() };
}
export function pairStop() { pairing = null; if (!db.getSetting('syncEnabled', false)) stop(); }

export function status() {
  return { enabled: !!db.getSetting('syncEnabled', false), running: running(), port: SYNC_PORT, addrs: addresses(), name: deviceName(), pairing: !!pairingKey(), error: lastError, peers: db.peers() };
}
