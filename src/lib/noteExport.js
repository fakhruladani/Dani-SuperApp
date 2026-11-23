import { api } from './api.js';
import { T } from './i18n.js';

// Note -> Word (.docx). Runs in the renderer (the docx library is loaded only when exporting) because
// note images are stored as WebP, which Word cannot show: each image is redrawn here as PNG.
// Pen strokes are not part of the document text, so they are left out (PDF keeps them).

const PAGE_W = 600; // usable width in px at 96 dpi (A4, ~2.5 cm margins)

async function toPng(src) {
  const id = /^dsa-img:\/\/img\/([\w-]+)/.exec(src)?.[1];
  const im = id ? await api('img:get', id) : null;
  if (!im) throw new Error('image not found');
  const bmp = await createImageBitmap(new Blob([im.data], { type: im.mime }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  const png = await c.convertToBlob({ type: 'image/png' });
  const out = { data: new Uint8Array(await png.arrayBuffer()), w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

export async function noteToDocx(note) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, ExternalHyperlink, AlignmentType, LevelFormat, BorderStyle } = d;
  let doc = null;
  try { doc = note.content ? JSON.parse(note.content) : null; } catch { /* plain note */ }

  // convert every image once, before building (ImageRun needs the bytes and size)
  const images = new Map();
  const collect = (n) => { if (n.type === 'image' && n.attrs?.src && !images.has(n.attrs.src)) images.set(n.attrs.src, null); (n.content || []).forEach(collect); };
  if (doc) collect(doc);
  for (const src of images.keys()) { try { images.set(src, await toPng(src)); } catch { /* missing image: skipped */ } }

  const HEAD = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, left: AlignmentType.LEFT };
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.slice(1) : undefined);

  const runs = (nodes = []) => nodes.flatMap((n) => {
    if (n.type === 'hardBreak') return [new TextRun({ break: 1 })];
    if (n.type === 'image') return imageRun(n);
    if (n.type !== 'text') return [];
    const m = Object.fromEntries((n.marks || []).map((x) => [x.type, x.attrs || {}]));
    const style = m.textStyle || {};
    const run = new TextRun({
      text: n.text, bold: !!m.bold, italics: !!m.italic, strike: !!m.strike, underline: m.underline || m.link ? {} : undefined,
      color: m.link ? '2459D6' : hex(style.color), highlight: m.highlight ? 'yellow' : undefined,
      font: m.code ? 'Consolas' : style.fontFamily?.split(',')[0].replace(/['"]/g, '') || undefined,
      size: style.fontSize ? Math.round(parseInt(style.fontSize, 10) * 1.5) : undefined // px -> half-points
    });
    return m.link?.href ? [new ExternalHyperlink({ link: m.link.href, children: [run] })] : [run];
  });
  const imageRun = (n) => {
    const im = images.get(n.attrs?.src);
    if (!im) return [];
    const s = Math.min(1, PAGE_W / im.w);
    return [new ImageRun({ type: 'png', data: im.data, transformation: { width: Math.round(im.w * s), height: Math.round(im.h * s) } })];
  };

  const out = [];
  const para = (n, extra = {}) => new Paragraph({ children: runs(n.content), alignment: ALIGN[n.attrs?.textAlign], ...extra });
  const walk = (nodes, ctx = { level: 0 }) => {
    for (const n of nodes || []) {
      switch (n.type) {
        case 'paragraph': out.push(para(n, ctx.quote ? { indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'B0B7C3', space: 8 } } } : {})); break;
        case 'heading': out.push(para(n, { heading: HEAD[n.attrs?.level] || HeadingLevel.HEADING_2 })); break;
        case 'image': out.push(new Paragraph({ children: imageRun(n) })); break;
        case 'horizontalRule': out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B0B7C3', space: 1 } } })); break;
        case 'codeBlock': for (const line of (n.content || []).map((x) => x.text || '').join('').split('\n')) out.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 19 })], shading: { fill: 'F1F3F6' }, spacing: { after: 0 } })); break;
        case 'blockquote': walk(n.content, { ...ctx, quote: true }); break;
        case 'bulletList': case 'orderedList': case 'taskList':
          for (const li of n.content || []) {
            const [first, ...rest] = li.content || [];
            const check = n.type === 'taskList' ? [new TextRun({ text: li.attrs?.checked ? '☑ ' : '☐ ' })] : [];
            const list = n.type === 'bulletList' ? { bullet: { level: ctx.level } } : n.type === 'orderedList' ? { numbering: { reference: 'num', level: ctx.level } } : { indent: { left: 360 * (ctx.level + 1) } };
            out.push(new Paragraph({ children: [...check, ...runs(first?.type === 'paragraph' ? first.content : [])], ...list }));
            walk(first && first.type !== 'paragraph' ? [first, ...rest] : rest, { ...ctx, level: Math.min(ctx.level + 1, 8) });
          }
          break;
        default: if (n.content) walk(n.content, ctx);
      }
    }
  };
  out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: note.title || T('Tanpa judul') })] }));
  if (doc) walk(doc.content);
  else if (note.plain) for (const line of note.plain.split('\n')) out.push(new Paragraph({ children: [new TextRun(line)] }));

  const file = new Document({
    creator: "D'Super App",
    title: note.title || '',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 100 } } } } },
    numbering: { config: [{ reference: 'num', levels: Array.from({ length: 9 }, (_, i) => ({ level: i, format: LevelFormat.DECIMAL, text: `%${i + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } })) }] },
    sections: [{ children: out }]
  });
  return new Uint8Array(await (await Packer.toBlob(file)).arrayBuffer());
}

/** One entry point for every note export; the note is re-read so unsaved typing that was just flushed is included. */
export async function exportNote(kind, id) {
  if (kind !== 'docx') return api({ pdf: 'note:exportPdf', md: 'note:exportMd', txt: 'note:exportTxt' }[kind], id);
  const note = await api('db:get', 'notes', id);
  if (!note) return null;
  return api('note:saveDocx', id, await noteToDocx(note));
}
