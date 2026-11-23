// Turns a CapacitorHttp response into bytes. The native side does not always honour responseType:
// a JSON response (Content-Type application/json) comes back already parsed as an object, and an
// error response (4xx/5xx) as plain text; only other bodies come back base64-encoded.
import { unb64 } from '../../shared/sync.js';

const enc = (s) => new TextEncoder().encode(s);

export function responseBytes(r) {
  const ct = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
  if (r.data == null) return new Uint8Array(0);
  if (typeof r.data === 'object') return enc(JSON.stringify(r.data));
  if (/json/i.test(ct) || r.status >= 400) return enc(String(r.data));
  try { return unb64(r.data); } catch { return enc(String(r.data)); }
}
