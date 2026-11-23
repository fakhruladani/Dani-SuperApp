// Android counterpart of electron/state.js: small, often-changing state outside the database
// (network caches, scheduler bookkeeping), kept in the WebView's storage.
const KEY = 'dsa.state';
let data = {};
let timer = null;

export function open() {
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { data = {}; }
}
export const get = (k, fallback = null) => (k in data ? data[k] : fallback);
export function set(k, v) { data[k] = v; clearTimeout(timer); timer = setTimeout(save, 3000); }
export function save() {
  clearTimeout(timer);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked: caches only */ }
}
