// Native HTTP for the online data (market, news, weather...): the WebView's fetch() is blocked by
// CORS on most of those servers, the native client is not. In a browser (tests) it falls back to fetch().
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { responseBytes } from './httpDecode.js';

export async function nativeFetch(url, { headers = {}, signal } = {}) {
  if (!Capacitor.isNativePlatform()) return fetch(url, { signal });
  const r = await CapacitorHttp.get({ url, headers, responseType: 'arraybuffer', connectTimeout: 15000, readTimeout: 20000 });
  const bytes = responseBytes(r);
  const hdr = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const text = () => new TextDecoder().decode(bytes);
  return {
    ok: r.status >= 200 && r.status < 300, status: r.status,
    headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => text(),
    json: async () => JSON.parse(text())
  };
}
