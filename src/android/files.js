// Files on the phone: exports go to the Android share sheet (save to Files/Drive, send by WhatsApp,
// ...); imports come from the system file picker.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { b64 } from '../../shared/sync.js';

const safe = (s) => String(s || 'file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

/** data: string (UTF-8) or bytes. Returns the file name, or null when the share sheet was closed. */
export async function shareFile(name, data, mime = 'application/octet-stream') {
  name = safe(name);
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return name;
  }
  const path = 'export/' + name;
  const r = typeof data === 'string'
    ? await Filesystem.writeFile({ path, data, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
    : await Filesystem.writeFile({ path, data: b64(data), directory: Directory.Cache, recursive: true });
  try { await Share.share({ title: name, files: [r.uri], dialogTitle: name }); } catch (e) { if (!/cancel/i.test(String(e?.message || e))) throw e; return null; }
  return name;
}

/** Opens the file picker. Must run straight from a tap (no await before it). Resolves to a File or null. */
export function pickFile(accept = '*/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let done = false;
    const finish = (f) => { if (done) return; done = true; input.remove(); resolve(f || null); };
    input.onchange = () => finish(input.files?.[0]);
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    input.click();
  });
}
