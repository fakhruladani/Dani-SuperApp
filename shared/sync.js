// Phone <-> laptop sync over the local network (no cloud). The laptop runs a small HTTP server
// (electron/syncServer.js); the phone is the client and starts every sync.
//
// Pairing: the laptop shows a QR code with its addresses and a fresh random 256-bit key. The phone
// scans it and calls `pair` encrypted with that key; from then on the key is shared by the two and
// every message both ways is AES-256-GCM encrypted and authenticated with it, with a timestamp and
// nonce against replays. Plain HTTP is fine because nothing readable or forgeable goes over it.
//
// Merge: per row, the newest updated_at wins; a deletion wins over older edits (see dbcore.js).
// Platform-neutral: WebCrypto (globalThis.crypto) exists in Node 20+, Electron and the WebView.

export const SYNC_PORT = 47613;
export const PROTO = 1;
const MAX_SKEW = 10 * 60000;
const IMG_BATCH_BYTES = 3 * 1024 * 1024;

// ---------- base64 (chunked: large images must not overflow the call stack) ----------
export function b64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) {
  const bin = atob(String(s || ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));

export const randomKey = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const subtle = () => globalThis.crypto.subtle;
const keyCache = new Map();
async function aesKey(raw) {
  const id = typeof raw === 'string' ? raw : b64(raw);
  if (!keyCache.has(id)) keyCache.set(id, await subtle().importKey('raw', typeof raw === 'string' ? unb64(raw) : raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyCache.get(id);
}

/** Encrypts a JSON value. key: raw bytes or base64. The sender id travels in clear so the receiver can find the key. */
export async function seal(key, from, body, nonce = b64(globalThis.crypto.getRandomValues(new Uint8Array(12)))) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ t: Date.now(), n: nonce, b: body }));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(String(from)) }, await aesKey(key), plain));
  return { v: PROTO, from: String(from), iv: b64(iv), ct: b64(ct) };
}
/** Decrypts and checks freshness. Throws on a wrong key, tampering or an old message. Returns { body, nonce }. */
export async function open(key, env, { maxSkew = MAX_SKEW } = {}) {
  if (!env || env.v !== PROTO) throw new Error('bad envelope');
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: new TextEncoder().encode(String(env.from)) }, await aesKey(key), unb64(env.ct));
  const msg = JSON.parse(new TextDecoder().decode(plain));
  if (!Number.isFinite(msg.t) || Math.abs(Date.now() - msg.t) > maxSkew) throw new Error('stale message');
  return { body: msg.b, nonce: msg.n };
}

// ---------- QR code payload ----------
export function pairingPayload({ device, name, addrs, port = SYNC_PORT, key }) {
  return 'dsa-sync:' + b64url(new TextEncoder().encode(JSON.stringify({ v: PROTO, d: device, n: name, a: addrs, p: port, k: b64url(key) })));
}
export function parsePairing(text) {
  const m = /^dsa-sync:([\w-]+)$/.exec(String(text || '').trim());
  if (!m) throw new Error('not a D\'Super App code');
  const o = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
  if (o.v !== PROTO || !o.d || !Array.isArray(o.a) || !o.k) throw new Error('unsupported code');
  return { device: o.d, name: o.n || '', addrs: o.a.map(String), port: Number(o.p) || SYNC_PORT, key: unb64url(o.k) };
}

// ---------- laptop side ----------
/**
 * Server logic, independent of HTTP. core: shared/dbcore.js API. pairing(): the key shown in the QR
 * code right now (or null). Returns handle(op, envelope) -> envelope.
 */
export function createServer({ core, deviceName, pairing, onPaired = () => {}, onSynced = () => {} }) {
  const seen = new Map(); // nonce -> time, against replays
  const remember = (n) => {
    const now = Date.now();
    for (const [k, t] of seen) if (now - t > MAX_SKEW * 2) seen.delete(k);
    if (seen.has(n)) throw new Error('replayed message');
    seen.set(n, now);
  };
  const ops = {
    ping: () => ({ device: core.deviceId(), name: deviceName(), rev: core.clock() }),
    sync: (p, b) => {
      const res = core.applyChanges(b.changes || {});
      const out = core.changesSince(Number(b.since) || 0, res.applied);
      core.peerSave({ id: p.id, last_sync: new Date().toISOString() });
      onSynced(p, res);
      return { changes: out, needImages: res.needImages };
    },
    'img/get': (p, b) => ({ images: core.imagesData((b.ids || []).slice(0, 200)).map((r) => ({ ...r, data: b64(r.data) })) }),
    'img/put': (p, b) => ({ stored: core.imagesStore((b.images || []).map((r) => ({ ...r, data: unb64(r.data) }))) }),
    unpair: (p) => { core.peerRemove(p.id); return { ok: true }; }
  };
  return async function handle(op, env) {
    if (op === 'pair') {
      const key = pairing();
      if (!key) throw Object.assign(new Error('pairing is not open'), { status: 403 });
      const { body, nonce } = await open(key, env);
      remember(nonce);
      if (!body?.device || body.device !== env.from) throw new Error('bad pairing');
      core.peerSave({ id: body.device, name: String(body.name || 'HP').slice(0, 60), key: b64(key) });
      onPaired(core.peer(body.device));
      return seal(key, core.deviceId(), { device: core.deviceId(), name: deviceName(), echo: nonce });
    }
    const p = core.peer(env?.from || '');
    if (!p?.key || !ops[op]) throw Object.assign(new Error('unknown device'), { status: 403 });
    const { body, nonce } = await open(p.key, env);
    remember(nonce);
    const result = await ops[op](p, body || {});
    return seal(p.key, core.deviceId(), { ...result, echo: nonce });
  };
}

// ---------- phone side ----------
/**
 * Client for one paired laptop. post(addr, op, envelope) -> envelope does the HTTP call (fetch or a
 * native plugin). Addresses are tried in order; the first that answers is remembered.
 */
export function createClient({ core, post, deviceName }) {
  const addrList = (peer) => String(peer.addr || '').split(',').map((a) => a.trim()).filter(Boolean);
  // remember the address that answered first, the others stay as fallbacks
  const addrField = (good, all) => [...new Set([good, ...all])].join(',');

  async function call(peer, op, body, addrs = null) {
    let lastErr = null;
    for (const addr of [...new Set(addrs || addrList(peer))]) {
      try {
        const nonce = b64(globalThis.crypto.getRandomValues(new Uint8Array(12)));
        const reply = await post(addr, op, await seal(peer.key, core.deviceId(), body, nonce));
        const { body: res } = await open(peer.key, reply);
        if (res?.echo !== nonce) throw new Error('reply does not match the request');
        return { res, addr };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no address');
  }

  /** Pairs with a laptop from the scanned QR text. Returns the stored peer. */
  async function pair(qrText) {
    const q = parsePairing(qrText);
    const addrs = q.addrs.map((a) => `${a}:${q.port}`);
    const { res, addr } = await call({ key: q.key }, 'pair', { device: core.deviceId(), name: deviceName() }, addrs);
    if (res.device !== q.device) throw new Error('unexpected device');
    return core.peerSave({ id: q.device, name: res.name || q.name, key: b64(q.key), addr: addrField(addr, addrs), last_pulled: 0, last_pushed: 0 });
  }

  /** One full sync with a paired laptop. Returns a summary for the UI. */
  async function sync(peerId, { onProgress = () => {} } = {}) {
    let peer = core.peer(peerId);
    if (!peer) throw new Error('not paired');
    const first = !peer.last_pulled;
    const fresh = first && core.isPristine();
    if (fresh) core.resetForInitialSync(); // a new phone takes the laptop's data instead of adding its defaults
    const pushRev = core.clock();
    const out = fresh ? { rev: pushRev, rows: {}, deleted: [], images: [] } : core.changesSince(peer.last_pushed || 0);
    onProgress('sync');
    const { res, addr } = await call(peer, 'sync', { since: peer.last_pulled || 0, changes: out });
    const before = core.clock();
    const applied = core.applyChanges(res.changes);
    const after = core.clock();
    // nothing was edited here while waiting for the reply: the rows just received need not go back
    const pushed = before === pushRev ? after : pushRev;
    peer = core.peerSave({ id: peerId, addr: addrField(addr, addrList(peer)), last_pulled: res.changes.rev, last_pushed: pushed });

    // images: send the ones the laptop lacks, then fetch the ones we lack (in batches)
    let sent = 0, got = 0;
    const up = res.needImages || [];
    for (let i = 0; i < up.length;) {
      const batch = [];
      let size = 0;
      while (i < up.length && (size < IMG_BATCH_BYTES || !batch.length)) { const [r] = core.imagesData([up[i++]]); if (r) { batch.push({ ...r, data: b64(r.data) }); size += r.data.length; } }
      if (batch.length) { onProgress('img-up'); sent += (await call(peer, 'img/put', { images: batch }, [addr])).res.stored || 0; }
    }
    const down = applied.needImages;
    for (let i = 0; i < down.length; i += 8) {
      onProgress('img-down');
      const { res: r } = await call(peer, 'img/get', { ids: down.slice(i, i + 8) }, [addr]);
      got += core.imagesStore((r.images || []).map((x) => ({ ...x, data: unb64(x.data) })));
    }
    core.peerSave({ id: peerId, last_sync: new Date().toISOString() });
    const n = (c) => Object.values(c.rows || {}).reduce((a, l) => a + l.length, 0) + (c.deleted || []).length;
    return { sent: n(out) + sent, received: applied.applied.size + got, tables: applied.tables, first, addr };
  }

  /** Checks a set of addresses for the paired laptop (used after its IP address changed). */
  async function probe(peer, addrs) {
    for (let i = 0; i < addrs.length; i += 24) {
      const hits = await Promise.all(addrs.slice(i, i + 24).map((a) => call(peer, 'ping', {}, [a]).then((r) => r, () => null)));
      const hit = hits.find((h) => h && h.res.device === peer.id);
      if (hit) return hit.addr;
    }
    return null;
  }

  return { pair, sync, call, probe, addrList };
}
