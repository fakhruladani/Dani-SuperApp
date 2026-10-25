import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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
import { getStroke } from 'perfect-freehand';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';

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

function InkLayer({ tool, color, size, strokes, setStrokes, height }) {
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
  const all = cur.current && !cur.current.erasing ? [...strokes, cur.current] : strokes;
  return (
    <svg ref={ref} className={`ink-layer ${tool === 'type' ? 'passive' : tool === 'erase' ? 'erase' : 'pen'}`} viewBox={`0 0 ${PAGE_W} ${height}`} preserveAspectRatio="none"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Lapisan coretan pena" role="img">
      {all.map((s, i) => <path key={i} d={strokePath(s)} fill={s.color} opacity={s.tool === 'hl' ? 0.35 : 1} />)}
    </svg>
  );
}

// Shared by the main editor and floating sticky notes, so both keep the same formatting.
export function noteExtensions(placeholder) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline, TextStyle, FontFamily, FontSize, Color,
    Highlight.configure({ multicolor: true }), TaskList, TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }), Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder })
  ];
}

export default function NoteEditor({ note, onSave, onDelete, onPin, onFloat, zoom, setZoom }) {
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
  const saveT = useRef();
  const latest = useRef({});
  const lastContent = useRef(note.content || '');

  const flush = useCallback(() => {
    clearTimeout(saveT.current);
    const l = latest.current;
    if (!l.dirty) return;
    l.dirty = false;
    lastContent.current = JSON.stringify(l.json);
    onSave({ id: note.id, title: l.title, content: lastContent.current, plain: l.plain, ink: JSON.stringify(l.strokes) });
    setSavedAt(new Date());
  }, [note.id, onSave]);
  const queue = useCallback((patch) => {
    Object.assign(latest.current, patch, { dirty: true });
    clearTimeout(saveT.current);
    saveT.current = setTimeout(flush, 600);
  }, [flush]);
  useEffect(() => () => flush(), [flush]);

  const editor = useEditor({
    extensions: noteExtensions('Mulai menulis… (pakai mode Pena untuk mencoret bebas)'),
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

  const setStrokes = (s) => { setHistory((h) => [...h.slice(-49), strokes]); setStrokesState(s); queue({ strokes: s }); };
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

  const inkBottom = strokes.reduce((m, s) => Math.max(m, ...s.points.map((p) => p[1])), 0);
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
      <div className="toolbar" role="toolbar" aria-label="Format catatan">
        <B label="Urungkan (Ctrl+Z)" icon="undo" run={() => (tool === 'type' ? e.chain().focus().undo().run() : undoInk())} />
        <B label="Ulangi (Ctrl+Y)" icon="redo" run={() => e.chain().focus().redo().run()} />
        <span className="sep" />
        <label className="sr" htmlFor="ne-font">Font</label>
        <select id="ne-font" className="field" value={ts.fontFamily || ''} onChange={(ev) => (ev.target.value ? e.chain().focus().setFontFamily(ev.target.value).run() : e.chain().focus().unsetFontFamily().run())} style={{ maxWidth: 150 }}>
          <option value="">Font bawaan</option>
          {FONTS.map(([v, l]) => <option key={v} value={v} style={{ fontFamily: v }}>{l}</option>)}
        </select>
        <label className="sr" htmlFor="ne-size">Ukuran</label>
        <select id="ne-size" className="field" value={ts.fontSize || ''} onChange={(ev) => (ev.target.value ? e.chain().focus().setFontSize(ev.target.value).run() : e.chain().focus().unsetFontSize().run())}>
          <option value="">Ukuran</option>
          {SIZES.map((s) => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
        </select>
        <label className="sr" htmlFor="ne-block">Gaya paragraf</label>
        <select id="ne-block" className="field" value={e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
          onChange={(ev) => { const v = ev.target.value; if (v === 'p') e.chain().focus().setParagraph().run(); else e.chain().focus().toggleHeading({ level: Number(v[1]) }).run(); }}>
          <option value="p">Normal</option><option value="h1">Judul 1</option><option value="h2">Judul 2</option><option value="h3">Judul 3</option>
        </select>
        <span className="sep" />
        <B label="Tebal (Ctrl+B)" text="B" style={{ fontWeight: 800 }} on={e.isActive('bold')} run={() => e.chain().focus().toggleBold().run()} />
        <B label="Miring (Ctrl+I)" text="I" style={{ fontStyle: 'italic', fontFamily: 'Lora, serif' }} on={e.isActive('italic')} run={() => e.chain().focus().toggleItalic().run()} />
        <B label="Garis bawah (Ctrl+U)" text="U" style={{ textDecoration: 'underline' }} on={e.isActive('underline')} run={() => e.chain().focus().toggleUnderline().run()} />
        <B label="Coret / strikethrough (Ctrl+Shift+S)" text="S" style={{ textDecoration: 'line-through' }} on={e.isActive('strike')} run={() => e.chain().focus().toggleStrike().run()} />
        <B label="Kode" text="</>" style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} on={e.isActive('code')} run={() => e.chain().focus().toggleCode().run()} />
        <span className="sep" />
        <span className="row" style={{ gap: 0 }} role="group" aria-label="Warna teks">
          {TEXT_COLORS.map((c) => <button key={c} className={`sw ${ts.color === c ? 'on' : ''}`} aria-label={'Warna teks ' + c} title="Warna teks" onMouseDown={(ev) => ev.preventDefault()} onClick={() => e.chain().focus().setColor(c).run()}><i style={{ background: c, width: 14, height: 14 }} /></button>)}
          <B label="Hapus warna" icon="x" run={() => e.chain().focus().unsetColor().run()} />
        </span>
        <span className="sep" />
        <span className="row" style={{ gap: 0 }} role="group" aria-label="Stabilo teks">
          {HL_COLORS.map((c) => <button key={c} className={`sw ${e.isActive('highlight', { color: c }) ? 'on' : ''}`} aria-label={'Stabilo ' + c} title="Stabilo teks" onMouseDown={(ev) => ev.preventDefault()} onClick={() => e.chain().focus().toggleHighlight({ color: c }).run()}><i style={{ background: c, width: 14, height: 14, borderRadius: 3 }} /></button>)}
        </span>
        <span className="sep" />
        <B label="Daftar berpoin" icon="list" on={e.isActive('bulletList')} run={() => e.chain().focus().toggleBulletList().run()} />
        <B label="Daftar bernomor" icon="olist" on={e.isActive('orderedList')} run={() => e.chain().focus().toggleOrderedList().run()} />
        <B label="Checklist" icon="checklist" on={e.isActive('taskList')} run={() => e.chain().focus().toggleTaskList().run()} />
        <B label="Kutipan" icon="quote" on={e.isActive('blockquote')} run={() => e.chain().focus().toggleBlockquote().run()} />
        <B label="Rata kiri" icon="alignL" on={e.isActive({ textAlign: 'left' })} run={() => e.chain().focus().setTextAlign('left').run()} />
        <B label="Rata tengah" icon="alignC" on={e.isActive({ textAlign: 'center' })} run={() => e.chain().focus().setTextAlign('center').run()} />
        <B label="Rata kanan" icon="alignR" on={e.isActive({ textAlign: 'right' })} run={() => e.chain().focus().setTextAlign('right').run()} />
        <B label="Garis pemisah" text="—" run={() => e.chain().focus().setHorizontalRule().run()} />
        <B label="Tautan" icon="link" on={e.isActive('link') || linkUrl != null} run={() => { if (e.isActive('link')) e.chain().focus().unsetLink().run(); else setLinkUrl('https://'); }} />
        {linkUrl != null && (
          <span className="row" style={{ gap: 4 }}>
            <label className="sr" htmlFor="ne-link">Alamat tautan</label>
            <input id="ne-link" className="field" autoFocus value={linkUrl} onChange={(ev) => setLinkUrl(ev.target.value)} style={{ width: 200, minHeight: 32 }}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { if (/^https?:\/\//.test(linkUrl)) e.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run(); setLinkUrl(null); } if (ev.key === 'Escape') setLinkUrl(null); }} />
          </span>
        )}
        <B label="Hapus format" icon="erase" run={() => e.chain().focus().unsetAllMarks().clearNodes().run()} />
        <span className="sep" />
        <span className="row" style={{ gap: 0 }} role="group" aria-label="Mode">
          <B label="Mode ketik" icon="type" on={tool === 'type'} run={() => setTool('type')} />
          <B label="Pena — coret bebas" icon="pen" on={tool === 'pen'} run={() => setTool('pen')} />
          <B label="Stabilo bebas" icon="hl" on={tool === 'hl'} run={() => setTool('hl')} />
          <B label="Penghapus coretan" icon="erase" on={tool === 'erase'} run={() => setTool('erase')} style={{ color: tool === 'erase' ? undefined : 'var(--muted)' }} />
        </span>
        {(tool === 'pen' || tool === 'hl') && (
          <span className="row" style={{ gap: 0 }} role="group" aria-label="Warna pena">
            {PEN_COLORS.map((c) => <button key={c} className={`sw ${penColor === c ? 'on' : ''}`} aria-label={'Warna pena ' + c} onClick={() => setPenColor(c)}><i style={{ background: c, width: 16, height: 16 }} /></button>)}
            <label className="sr" htmlFor="ne-pen">Ketebalan</label>
            <select id="ne-pen" className="field" value={penSize} onChange={(ev) => setPenSize(Number(ev.target.value))} style={{ marginLeft: 4 }}>
              <option value={1}>Tipis</option><option value={2}>Sedang</option><option value={4}>Tebal</option><option value={7}>Sangat tebal</option>
            </select>
          </span>
        )}
        {strokes.length > 0 && <button className="btn sm ghost" onClick={() => setStrokes([])}>Hapus semua coretan</button>}
        <span className="row" style={{ marginLeft: 'auto', gap: 0 }}>
          <B label="Perkecil (Ctrl+-)" icon="zoomOut" run={() => setZoom(Math.max(50, zoom - 10))} />
          <button className="btn sm ghost num" onClick={() => setZoom(100)} title="Reset zoom (Ctrl+0)" style={{ minWidth: 56 }}>{zoom}%</button>
          <B label="Perbesar (Ctrl++)" icon="zoomIn" run={() => setZoom(Math.min(200, zoom + 10))} />
        </span>
      </div>
      <div className="paper-scroll">
        <div style={{ width: PAGE_W * scale, height: pageH * scale, margin: '24px auto', position: 'relative' }}>
          <div className="paper" style={{ width: PAGE_W, minHeight: pageH, margin: 0, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
            <div ref={pageRef}>
              <label className="sr" htmlFor="ne-title">Judul catatan</label>
              <input id="ne-title" className="title-input" placeholder="Judul catatan" value={title} onChange={(ev) => { setTitle(ev.target.value); queue({ title: ev.target.value }); }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); e.commands.focus('start'); } }} />
              <EditorContent editor={e} />
            </div>
            <InkLayer tool={tool} color={penColor} size={penSize} strokes={strokes} setStrokes={setStrokes} height={pageH} />
          </div>
        </div>
      </div>
      <div className="row wrap mut" style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 12, gap: 14 }}>
        <span>{savedAt ? `Tersimpan otomatis · ${savedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Tersimpan otomatis'}</span>
        <span>{words} kata</span>
        <span>{strokes.length} coretan</span>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => { flush(); onFloat(); }} title="Buka catatan ini sebagai jendela mengambang (sticky note)"><Icon name="widget" size="sm" />Jendela mengambang</button>
        <button className="btn sm ghost" onClick={() => onPin(!note.pinned)}><Icon name="pinned" size="sm" />{note.pinned ? 'Lepas sematan' : 'Sematkan'}</button>
        <button className="btn sm ghost danger" onClick={onDelete}><Icon name="trash" size="sm" />Hapus</button>
      </div>
    </section>
  );
}
