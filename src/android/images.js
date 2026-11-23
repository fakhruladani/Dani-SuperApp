// Note images on Android: the note content refers to them as dsa-img://img/<id> (same as desktop,
// so notes sync unchanged). The WebView has no such protocol, so the editor shows them through
// blob: URLs made from the database bytes; the reverse map turns a pasted blob: URL back.
import * as db from './db.js';

const urls = new Map(); // id -> blob url
const ids = new Map(); // blob url -> id
const RE = /^dsa-img:\/\/img\/([\w-]+)/;

export function imageUrl(src) {
  const m = RE.exec(String(src || ''));
  if (!m) return src;
  if (urls.has(m[1])) return urls.get(m[1]);
  const im = db.imageGet(m[1]);
  if (!im) return src;
  const url = URL.createObjectURL(new Blob([im.data], { type: im.mime }));
  urls.set(m[1], url); ids.set(url, m[1]);
  return url;
}
export const imageSrc = (url) => (ids.has(url) ? 'dsa-img://img/' + ids.get(url) : url);
