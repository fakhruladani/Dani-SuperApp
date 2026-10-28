import { api } from './api.js';

const MAX_W = 1600; // 2x the note page width: sharp when zoomed or printed, small in the database

/** Downscale and re-encode to WebP (keeps transparency). GIFs are kept as-is so they still animate. */
export async function compressImage(file) {
  if (file.type === 'image/gif') return { mime: 'image/gif', bytes: new Uint8Array(await file.arrayBuffer()) };
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, MAX_W / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.86 });
  return { mime: 'image/webp', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export const imageFiles = (list) => [...(list || [])].filter((f) => f.type && f.type.startsWith('image/'));

/** Stores the files in the encrypted database and inserts them at `pos` (default: the cursor). */
export async function insertImageFiles(editor, noteId, files, pos) {
  let at = pos;
  for (const f of files) {
    const { mime, bytes } = await compressImage(f);
    const id = await api('img:put', noteId, mime, bytes);
    const node = { type: 'image', attrs: { src: `dsa-img://img/${id}`, alt: (f.name || '').replace(/\.[^.]+$/, '') } };
    if (at == null) editor.chain().focus().insertContent(node).run();
    else { editor.chain().focus().insertContentAt(at, node).run(); at = editor.state.selection.to; }
  }
}
