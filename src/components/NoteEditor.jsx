import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Plugin } from '@tiptap/pm/state';
import { getStroke } from 'perfect-freehand';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';
import { T } from '../lib/i18n.js';
import { imageFiles, insertImageFiles } from '../lib/images.js';

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: (el) => el.style.fontSize || null, renderHTML: (a) => (a.fontSize ? { style: `font-size: ${a.fontSize}` } : {}) } } }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});

export const FONTS = [
  ['Plus Jakarta Sans Variable', 'Plus Jakarta Sans'], ['Segoe UI', 'Segoe UI'], ['Calibri', 'Calibri'], ['Arial', 'Arial'],
  ['Times New Roman', 'Times New Roman'], ['Georgia', 'Georgia'], ['Lora', 'Lora (serif)'], ['Caveat', 'Caveat (tulisan tangan)'],
  ['Comic Sans MS', 'Comic Sans MS'], ['JetBrains Mono', 'JetBrains Mono'], ['Consolas', 'Consolas']
];
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'];
const TEXT_COLORS = ['#14171C', '#E11D48', '#C2410C', '#B45309', '#15803D', '#0F766E', '#2459D6', '#7C3AED', '#6B7280'];
const HL_COLORS = ['#FDE68A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#FED7AA'];
const PEN_COLORS = ['#E11D48', '#2459D6', '#0F766E', '#F59E0B', '#7C3AED', '#14171C', '#FFFFFF'];
const PAGE_W = 820;
const MIN_H = 1100;

const pathCache = new WeakMap();
const cachedPath = (s) => { let d = pathCache.get(s); if (d === undefined) { d = strokePath(s); pathCache.set(s, d); } return d; };

function strokePath(s) {
  const pts = getStroke(s.points, {
    size: s.tool === 'hl' ? s.size * 4 : s.size * 2.2, thinning: s.tool === 'hl' ? 0 : 0.55, smoothing: 0.6, streamline: 0.45,
    simulatePressure: !s.pressure, last: true, start: { cap: true }, end: { cap: true }
  });
  if (!pts.length) return '';
  const d = pts.reduce((acc, [x0, y0], i, arr) => { const [x1, y1] = arr[(i + 1) % arr.length]; acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); return acc; }, ['M', ...pts[0], 'Q']);
  d.push('Z');
  return d.join(' ');
}

const InkLayer = memo(function InkLayer({ tool, color, size, strokes, setStrokes, height }) {
  const ref = useRef();
  const cur = useRef(null);
  const [, force] = useState(0);
  const toPt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PAGE_W, ((e.clientY - r.top) / r.height) * height, e.pressure || 0.5];
  };
  const eraseAt = (p) => {
    const R = 12;
    const keep = strokes.filter((s) => !s.points.some(([x, y]) => Math.abs(x - p[0]) < R + s.size && Math.abs(y - p[1]) < R + s.size));
    if (keep.length !== strokes.length) setStrokes(keep);
  };
  const down = (e) => {
    if (tool === 'type') return;
    ref.current.setPointerCapture(e.pointerId);
    const p = toPt(e);
    if (tool === 'erase') { eraseAt(p); cur.current = { erasing: true }; return; }
    cur.current = { tool, color, size, pressure: e.pointerType === 'pen', points: [p] };
    force((x) => x + 1);
  };
  const move = (e) => {
    if (!cur.current) return;
    const p = toPt(e);
    if (cur.current.erasing) { eraseAt(p); return; }
    cur.current.points.push(p);
    force((x) => x + 1);
  };
  const up = () => {
    if (cur.current && !cur.current.erasing && cur.current.points.length > 1) setStrokes([...strokes, cur.current]);
    cur.current = null;
    force((x) => x + 1);
  };
  return (
    <svg ref={ref} className={`ink-layer ${tool === 'type' ? 'passive' : tool === 'erase' ? 'erase' : 'pen'}`} viewBox={`0 0 ${PAGE_W} ${height}`} preserveAspectRatio="none"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={T("Lapisan coretan pena")} role="img">
      {strokes.map((s, i) => <path key={i} d={cachedPath(s)} fill={s.color} opacity={s.tool === 'hl' ? 0.35 : 1} />)}
      {cur.current && !cur.current.erasing && <path d={strokePath(cur.current)} fill={cur.current.color} opacity={cur.current.tool === 'hl' ? 0.35 : 1} />}
    </svg>
  );
});

// Paste (Ctrl+V a screenshot) and drop image files into a note.
const ImageInput = Extension.create({
  name: 'imageInput',
  addOptions() { return { noteId: null, onError: null }; },
  addProseMirrorPlugins() {
    const { editor } = this;
    const { noteId, onError } = this.options;
    const run = (files, pos) => insertImageFiles(editor, noteId, files, pos).catch((err) => (onError ? onError(err) : console.error(err)));
    return [new Plugin({
      props: {
        handlePaste: (view, event) => {
          const files = imageFiles(event.clipboardData?.files);
          if (!files.length || !noteId) return false;
          event.preventDefault();
          run(files);
          return true;
        },
        handleDrop: (view, event, slice, moved) => {
          if (moved || !noteId) return false;
          const files = imageFiles(event.dataTransfer?.files);
          if (!files.length) return false;
          event.preventDefault();
          run(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
          return true;
        }
      }
    })];
  }
});

// Shared by the main editor, floating sticky notes and the PDF print view, so all keep the same formatting.
export function noteExtensions(placeholder, { noteId = null, onError = null } = {}) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline, TextStyle, FontFamily, FontSize, Color,
    Highlight.configure({ multicolor: true }), TaskList, TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }), Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder }),
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'note-img' } }),
    ImageInput.configure({ noteId, onError })
  ];
}

// Compact color picker: one toolbar button, swatches in a small popover.
function ColorMenu({ label, colors, current, onPick, square, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const pick = (c) => { onPick(c); setOpen(false); };
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className={`icb sm ${open ? 'on' : ''}`} aria-label={label} title={label} aria-expanded={open} onMouseDown={(ev) => ev.preventDefault()} onClick={() => setOpen(!open)}>{children}<Icon name="down" size="sm" style={{ width: 12, height: 12, marginLeft: 2 }} /></button>
      {open && (
        <span className="card" role="menu" style={{ position: 'absolute', top: 36, left: 0, zIndex: 20, padding: 8, display: 'flex', gap: 2, boxShadow: 'var(--shadow-lg)' }}>
          {colors.map((c) => <button key={c} role="menuitemradio" aria-checked={current === c} className={`sw ${current === c ? 'on' : ''}`} aria-label={label + ' ' + c} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(c)}><i style={{ background: c, width: 16, height: 16, borderRadius: square ? 3 : '50%' }} /></button>)}
          <button className="icb sm" aria-label={T('Hapus') + ' ' + label.toLowerCase()} title={T("Hapus")} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(null)}><Icon name="x" size="sm" /></button>
        </span>
      )}
    </span>
  );
}

function ExportMenu({ busy, run }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const item = (k, label, sub) => (
    <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); run(k); }}>
      <strong>{label}</strong><span className="mut" style={{ fontSize: 12 }}>{sub}</span>
    </button>
  );
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn sm ghost" aria-haspopup="menu" aria-expanded={open} disabled={!!busy} onClick={() => setOpen(!open)}>
        <Icon name={busy ? 'refresh' : 'download'} size="sm" className={busy ? 'spin' : ''} />{T('Ekspor')}
      </button>
      {open && (
        <span className="card menu-pop" role="menu" style={{ bottom: 36, right: 0 }}>
          {item('pdf', 'PDF', T('Dengan gambar dan coretan pena'))}
          {item('md', 'Markdown (.md)', T('Gambar disimpan di folder terpisah, tanpa coretan pena'))}
        </span>
      )}
    </span>
  );
}

export default function NoteEditor({ note, onSave, onDelete, onPin, onFloat, onError, zoom, setZoom }) {
  const [title, setTitle] = useState(note.title || '');
  const [strokes, setStrokesState] = useState(() => { try { return JSON.parse(note.ink || '[]'); } catch { return []; } });
  const [history, setHistory] = useState([]);
  const [tool, setTool] = useState('type');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState(2);
  const [contentH, setContentH] = useState(MIN_H);
  const [words, setWords] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [linkUrl, setLinkUrl] = useState(null);
  const pageRef = useRef();
  const fileRef = useRef();
  const [exporting, setExporting] = useState('');
  const saveT = useRef();
  const latest = useRef({});
  const lastContent = useRef(note.content || '');

  const flush = useCallback(() => {
    clearTimeout(saveT.current);
    const l = latest.current;
    if (!l.dirty) return Promise.resolve();
    l.dirty = false;
    lastContent.current = JSON.stringify(l.json);
    setSavedAt(new Date());
    return Promise.resolve(onSave({ id: note.id, title: l.title, content: lastContent.current, plain: l.plain, ink: JSON.stringify(l.strokes) }));
  }, [note.id, onSave]);
  const queue = useCallback((patch) => {
    Object.assign(latest.current, patch, { dirty: true });
    clearTimeout(saveT.current);
    saveT.current = setTimeout(flush, 600);
  }, [flush]);
  useEffect(() => () => flush(), [flush]);

  const editor = useEditor({
    extensions: noteExtensions(T('Mulai menulis… (pakai mode Pena untuk mencoret bebas)'), { noteId: note.id, onError: (err) => onError?.(err) }),
    content: (() => { try { return note.content ? JSON.parse(note.content) : ''; } catch { return ''; } })(),
    onCreate: ({ editor: ed }) => { latest.current = { title: note.title || '', json: ed.getJSON(), plain: ed.getText(), strokes, dirty: false }; setWords(ed.getText().split(/\s+/).filter(Boolean).length); },
    onUpdate: ({ editor: ed }) => { const plain = ed.getText(); setWords(plain.split(/\s+/).filter(Boolean).length); queue({ json: ed.getJSON(), plain }); },
    editorProps: {
      handleClickOn: (view, pos, node, nodePos, event) => {
        const a = event.target.closest?.('a');
        if (a && (event.ctrlKey || event.metaKey)) { api('shell:open', a.href); return true; }
        return false;
      }
    }
  }, [note.id]);

  // content changed elsewhere (sticky note window): reload unless the user is typing here
  useEffect(() => {
    if (!editor || !note.content || note.content === lastContent.current) return;
    if (editor.isFocused || latest.current.dirty) return;
    try { editor.commands.setContent(JSON.parse(note.content), false); lastContent.current = note.content; latest.current.json = editor.getJSON(); latest.current.plain = editor.getText(); } catch { /* ignore bad json */ }
  }, [note.content, editor]);

  const strokesRef = useRef(strokes); strokesRef.current = strokes;
  const setStrokes = useCallback((s) => { setHistory((h) => [...h.slice(-49), strokesRef.current]); setStrokesState(s); queue({ strokes: s }); }, [queue]);
  const undoInk = () => { if (!history.length) return; const prev = history[history.length - 1]; setHistory(history.slice(0, -1)); setStrokesState(prev); queue({ strokes: prev }); };

  useLayoutEffect(() => {
    if (!pageRef.current) return undefined;
    const ro = new ResizeObserver(() => setContentH(pageRef.current.offsetHeight));
    ro.observe(pageRef.current);
    return () => ro.disconnect();
  }, [editor]);

  useEffect(() => {
    const k = (e) => {
      if (tool !== 'type' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoInk(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(Math.min(200, zoom + 10)); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setZoom(Math.max(50, zoom - 10)); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(100); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const inkBottom = useMemo(() => strokes.reduce((m, s) => s.points.reduce((mm, p) => (p[1] > mm ? p[1] : mm), m), 0), [strokes]);
  const pageH = Math.max(contentH, inkBottom + 300, MIN_H);
  if (!editor) return null;
  const e = editor;
  const ts = e.getAttributes('textStyle');
  const B = ({ on, label, icon, run, text, style }) => (
    <button className={`icb sm ${on ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={on ? 'true' : 'false'} onMouseDown={(ev) => ev.preventDefault()} onClick={run} style={style}>
      {icon ? <Icon name={icon} size="sm" /> : text}
    </button>
  );
  const scale = zoom / 100;

  return (
    <section className="card editor-card">
      <div className="toolbar" role="toolbar" aria-label={T("Format catatan")}>
        <B label={T("Urungkan (Ctrl+Z)")} icon="undo" run={() => (tool === 'type' ? e.chain().focus().undo().run() : undoInk())} />
        <B label={T("Ulangi (Ctrl+Y)")} icon="redo" run={() => e.chain().focus().redo().run()} />
        <span className="sep" />
        <label className="sr" htmlFor="ne-font">{T("Font")}</label>
        <select id="ne-font" className="field" value={ts.fontFamily || ''} onChange={(ev) => (ev.target.value ? e.chain().focus().setFontFamily(ev.target.value).run() : e.chain().focus().unsetFontFamily().run())} style={{ maxWidth: 150 }}>
          <option value="">{T("Font bawaan")}</option>
          {FONTS.map(([v, l]) => <option key={v} value={v} style={{ fontFamily: v }}>{l}</option>)}
        </select>
        <label className="sr" htmlFor="ne-size">{T("Ukuran")}</label>
        <select id="ne-size" className="field" value={ts.fontSize || ''} onChange={(ev) => (ev.target.value ? e.chain().focus().setFontSize(ev.target.value).run() : e.chain().focus().unsetFontSize().run())}>
          <option value="">{T("Ukuran")}</option>
          {SIZES.map((s) => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
        </select>
        <label className="sr" htmlFor="ne-block">{T("Gaya paragraf")}</label>
        <select id="ne-block" className="field" value={e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
          onChange={(ev) => { const v = ev.target.value; if (v === 'p') e.chain().focus().setParagraph().run(); else e.chain().focus().toggleHeading({ level: Number(v[1]) }).run(); }}>
          <option value="p">{T("Normal")}</option><option value="h1">{T("Judul 1")}</option><option value="h2">{T("Judul 2")}</option><option value="h3">{T("Judul 3")}</option>
        </select>
        <span className="sep" />
        <B label={T("Tebal (Ctrl+B)")} text="B" style={{ fontWeight: 800 }} on={e.isActive('bold')} run={() => e.chain().focus().toggleBold().run()} />
        <B label={T("Miring (Ctrl+I)")} text="I" style={{ fontStyle: 'italic', fontFamily: 'Lora, serif' }} on={e.isActive('italic')} run={() => e.chain().focus().toggleItalic().run()} />
        <B label={T("Garis bawah (Ctrl+U)")} text="U" style={{ textDecoration: 'underline' }} on={e.isActive('underline')} run={() => e.chain().focus().toggleUnderline().run()} />
        <B label={T("Coret / strikethrough (Ctrl+Shift+S)")} text="S" style={{ textDecoration: 'line-through' }} on={e.isActive('strike')} run={() => e.chain().focus().toggleStrike().run()} />
        <B label={T("Kode")} text="</>" style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} on={e.isActive('code')} run={() => e.chain().focus().toggleCode().run()} />
        <span className="sep" />
        <ColorMenu label={T("Warna teks")} colors={TEXT_COLORS} current={ts.color} onPick={(c) => (c ? e.chain().focus().setColor(c).run() : e.chain().focus().unsetColor().run())}>
          <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1, borderBottom: `3px solid ${ts.color || 'currentColor'}`, padding: '0 2px' }}>A</span>
        </ColorMenu>
        <ColorMenu label={T("Stabilo teks")} colors={HL_COLORS} current={e.getAttributes('highlight').color} square onPick={(c) => (c ? e.chain().focus().setHighlight({ color: c }).run() : e.chain().focus().unsetHighlight().run())}>
          <Icon name="hl" size="sm" />
        </ColorMenu>
        <span className="sep" />
        <B label={T("Daftar berpoin")} icon="list" on={e.isActive('bulletList')} run={() => e.chain().focus().toggleBulletList().run()} />
        <B label={T("Daftar bernomor")} icon="olist" on={e.isActive('orderedList')} run={() => e.chain().focus().toggleOrderedList().run()} />
        <B label={T("Checklist")} icon="checklist" on={e.isActive('taskList')} run={() => e.chain().focus().toggleTaskList().run()} />
        <B label={T("Kutipan")} icon="quote" on={e.isActive('blockquote')} run={() => e.chain().focus().toggleBlockquote().run()} />
        <B label={T("Rata kiri")} icon="alignL" on={e.isActive({ textAlign: 'left' })} run={() => e.chain().focus().setTextAlign('left').run()} />
        <B label={T("Rata tengah")} icon="alignC" on={e.isActive({ textAlign: 'center' })} run={() => e.chain().focus().setTextAlign('center').run()} />
        <B label={T("Rata kanan")} icon="alignR" on={e.isActive({ textAlign: 'right' })} run={() => e.chain().focus().setTextAlign('right').run()} />
        <B label={T("Garis pemisah")} text="—" run={() => e.chain().focus().setHorizontalRule().run()} />
        <B label={T("Sisipkan gambar (atau tempel Ctrl+V)")} icon="image" run={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(ev) => { const files = imageFiles(ev.target.files); ev.target.value = ''; if (files.length) insertImageFiles(e, note.id, files).catch((err) => onError?.(err)); }} />
        <B label={T("Tautan")} icon="link" on={e.isActive('link') || linkUrl != null} run={() => { if (e.isActive('link')) e.chain().focus().unsetLink().run(); else setLinkUrl('https://'); }} />
        {linkUrl != null && (
          <span className="row" style={{ gap: 4 }}>
            <label className="sr" htmlFor="ne-link">{T("Alamat tautan")}</label>
            <input id="ne-link" className="field" autoFocus value={linkUrl} onChange={(ev) => setLinkUrl(ev.target.value)} style={{ width: 200, minHeight: 32 }}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { if (/^https?:\/\//.test(linkUrl)) e.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run(); setLinkUrl(null); } if (ev.key === 'Escape') setLinkUrl(null); }} />
          </span>
        )}
        <B label={T("Hapus format")} icon="erase" run={() => e.chain().focus().unsetAllMarks().clearNodes().run()} />
        <span className="sep" />
        <span className="row" style={{ gap: 0 }} role="group" aria-label={T("Mode")}>
          <B label={T("Mode ketik")} icon="type" on={tool === 'type'} run={() => setTool('type')} />
          <B label={T("Pena — coret bebas")} icon="pen" on={tool === 'pen'} run={() => setTool('pen')} />
          <B label={T("Stabilo bebas")} icon="hl" on={tool === 'hl'} run={() => setTool('hl')} />
          <B label={T("Penghapus coretan")} icon="erase" on={tool === 'erase'} run={() => setTool('erase')} style={{ color: tool === 'erase' ? undefined : 'var(--muted)' }} />
        </span>
        {(tool === 'pen' || tool === 'hl') && (
          <span className="row" style={{ gap: 0 }} role="group" aria-label={T("Warna pena")}>
            {PEN_COLORS.map((c) => <button key={c} className={`sw ${penColor === c ? 'on' : ''}`} aria-label={T('Warna pena') + ' ' + c} onClick={() => setPenColor(c)}><i style={{ background: c, width: 16, height: 16 }} /></button>)}
            <label className="sr" htmlFor="ne-pen">{T("Ketebalan")}</label>
            <select id="ne-pen" className="field" value={penSize} onChange={(ev) => setPenSize(Number(ev.target.value))} style={{ marginLeft: 4 }}>
              <option value={1}>{T("Tipis")}</option><option value={2}>{T("Sedang")}</option><option value={4}>{T("Tebal")}</option><option value={7}>{T("Sangat tebal")}</option>
            </select>
          </span>
        )}
        {strokes.length > 0 && <button className="btn sm ghost" onClick={() => setStrokes([])}>{T("Hapus semua coretan")}</button>}
        <span className="row" style={{ marginLeft: 'auto', gap: 0 }}>
          <B label={T("Perkecil (Ctrl+-)")} icon="zoomOut" run={() => setZoom(Math.max(50, zoom - 10))} />
          <button className="btn sm ghost num" onClick={() => setZoom(100)} title={T("Reset zoom (Ctrl+0)")} style={{ minWidth: 56 }}>{zoom}%</button>
          <B label={T("Perbesar (Ctrl++)")} icon="zoomIn" run={() => setZoom(Math.min(200, zoom + 10))} />
        </span>
      </div>
      <div className="paper-scroll">
        <div style={{ width: PAGE_W * scale, height: pageH * scale, margin: '24px auto', position: 'relative' }}>
          <div className="paper" style={{ width: PAGE_W, minHeight: pageH, margin: 0, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
            <div ref={pageRef}>
              <label className="sr" htmlFor="ne-title">{T("Judul catatan")}</label>
              <input id="ne-title" className="title-input" placeholder={T("Judul catatan")} value={title} onChange={(ev) => { setTitle(ev.target.value); queue({ title: ev.target.value }); }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); e.commands.focus('start'); } }} />
              <EditorContent editor={e} />
            </div>
            <InkLayer tool={tool} color={penColor} size={penSize} strokes={strokes} setStrokes={setStrokes} height={pageH} />
          </div>
        </div>
      </div>
      <div className="row wrap mut" style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 12, gap: 14 }}>
        <span>{savedAt ? T('Tersimpan otomatis') + ' · ' + savedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : T("Tersimpan otomatis")}</span>
        <span>{T('{n} kata', { n: words })}</span>
        <span>{T('{n} coretan', { n: strokes.length })}</span>
        <span className="grow" />
        <ExportMenu busy={exporting} run={async (k) => { setExporting(k); try { await flush(); await api(k === 'pdf' ? 'note:exportPdf' : 'note:exportMd', note.id); } catch (err) { onError?.(err); } finally { setExporting(''); } }} />
        <button data-tour="float" className="btn sm ghost" onClick={() => { flush(); onFloat(); }} title={T("Buka catatan ini sebagai jendela mengambang (sticky note)")}><Icon name="widget" size="sm" />{T("Jendela mengambang")}</button>
        <button className={`icb sm ${note.pinned ? 'on' : ''}`} aria-pressed={!!note.pinned} aria-label={note.pinned ? T("Lepas sematan") : T("Sematkan")} title={note.pinned ? T("Lepas sematan") : T("Sematkan")} onClick={() => onPin(!note.pinned)}><Icon name="pinned" size="sm" /></button>
        <button className="icb sm danger" aria-label={T("Hapus catatan")} title={T("Hapus catatan")} onClick={onDelete}><Icon name="trash" size="sm" /></button>
      </div>
    </section>
  );
}

/** Read-only page used by the hidden PDF window: same layout, fonts, images and pen strokes as the editor. */
export function NotePrint({ note, onReady }) {
  const strokes = useMemo(() => { try { return JSON.parse(note.ink || '[]'); } catch { return []; } }, [note.ink]);
  const pageRef = useRef();
  const [contentH, setContentH] = useState(0);
  const editor = useEditor({
    editable: false,
    extensions: noteExtensions(''),
    content: (() => { try { return note.content ? JSON.parse(note.content) : ''; } catch { return ''; } })()
  });
  useLayoutEffect(() => {
    if (!pageRef.current) return undefined;
    const ro = new ResizeObserver(() => setContentH(pageRef.current.offsetHeight));
    ro.observe(pageRef.current);
    return () => ro.disconnect();
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    let alive = true;
    (async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.paper img')].map((im) => (im.complete ? null : new Promise((res) => { im.onload = res; im.onerror = res; }))));
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      if (alive) onReady();
    })();
    return () => { alive = false; };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  const inkBottom = strokes.reduce((m, st) => st.points.reduce((mm, p) => (p[1] > mm ? p[1] : mm), m), 0);
  const pageH = Math.max(contentH + 32, inkBottom + 24);
  if (!editor) return null;
  return (
    <div className="paper print-paper" style={{ width: PAGE_W, minHeight: pageH }}>
      <div ref={pageRef}>
        <div className="title-input" style={{ whiteSpace: 'pre-wrap' }}>{note.title || T('Tanpa judul')}</div>
        <EditorContent editor={editor} />
      </div>
      <InkLayer tool="type" color="" size={1} strokes={strokes} setStrokes={() => {}} height={pageH} />
    </div>
  );
}
