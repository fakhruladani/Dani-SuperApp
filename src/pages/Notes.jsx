import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TagInput from '../components/TagInput.jsx';
import Icon from '../components/Icon.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import { Modal, Field } from '../components/ui.jsx';
import { api, DB, useApp, useQuery } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { T } from '../lib/i18n.js';
import Resizer, { usePanelWidth } from '../components/Resizer.jsx';
import { openMenu } from '../components/ContextMenu.jsx';
import { noteItems } from '../lib/menus.js';

// One row: All, Pinned, as many of the most used tags as fit (the selected one first), and a
// "+N" button that opens every tag with a search box. The row never wraps, however many tags exist.
function TagFilter({ tags, tag, setTag }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fit, setFit] = useState(tags.length);
  const ref = useRef();
  const rowRef = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const sel = tag && tag !== '__pin' ? tag : null;
  const order = sel ? [sel, ...tags.map((x) => x.t).filter((t) => t !== sel)] : tags.map((x) => x.t);
  const candidates = order.slice(0, 12);
  // count how many chips fit in the row; re-measured when the panel is resized
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const max = row.getBoundingClientRect().right;
      let n = 0;
      for (const el of row.children) { if (el.getBoundingClientRect().right <= max + 0.5) n++; else break; }
      setFit(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [candidates.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const rest = tags.length - Math.min(fit, candidates.length);
  const found = tags.filter((x) => x.t.toLowerCase().includes(q.trim().toLowerCase().replace(/^#/, '')));
  const pick = (t) => { setTag(t); setOpen(false); setQ(''); };
  return (
    <div ref={ref} className="row" style={{ gap: 6, position: 'relative', flexWrap: 'nowrap', minWidth: 0 }}>
      <button className={`chip ${!tag ? 'on' : ''}`} style={{ flex: 'none' }} onClick={() => setTag('')}>{T("Semua")}</button>
      <button className={`chip ${tag === '__pin' ? 'on' : ''}`} style={{ flex: 'none' }} onClick={() => setTag('__pin')}>{T("Disematkan")}</button>
      <div ref={rowRef} className="row grow" style={{ gap: 6, flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
        {candidates.map((t, i) => (
          <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(t)} title={'#' + t}
            style={{ flex: 'none', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', visibility: i < fit ? 'visible' : 'hidden' }}>#{t}</button>
        ))}
      </div>
      {tags.length > 0 && (
        <button className={`chip ${open ? 'on' : ''}`} aria-haspopup="listbox" aria-expanded={open} title={T('Semua tag')} onClick={() => setOpen(!open)} style={{ flex: 'none' }}>
          <Icon name="plus" size="sm" style={{ width: 12, height: 12 }} />{rest > 0 ? rest : ''}
        </button>
      )}
      {open && (
        <div className="card tag-pop">
          <input className="field" autoFocus placeholder={T('Cari tag…')} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) pick(found[0].t); }} style={{ minHeight: 34 }} />
          <div className="col" role="listbox" aria-label={T('Semua tag')} style={{ gap: 2, maxHeight: 260, overflow: 'auto' }}>
            {found.length === 0 && <span className="mut" style={{ fontSize: 13, padding: 6 }}>{T('Tidak ada tag yang cocok.')}</span>}
            {found.map((x) => (
              <button key={x.t} role="option" aria-selected={tag === x.t} className={`tag-opt ${tag === x.t ? 'on' : ''}`} onClick={() => pick(x.t)}>
                <span className="grow ellipsis">#{x.t}</span><span className="mut num">{x.c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Notes() {
  const app = useApp();
  const notes = useQuery(() => DB.list('notes', { order: 'pinned desc,updated_at desc' }), [], ['notes']);
  const templates = useQuery(() => DB.list('note_templates', { order: 'name' }), [], ['note_templates']);
  const [selId, setSelId] = useState(app.params.noteId || null);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [zoom, setZoomState] = useState(app.settings.noteZoom || 100);
  const [tplOpen, setTplOpen] = useState(false);
  const [tagEdit, setTagEdit] = useState(null);
  const listW = usePanelWidth('notesList', 290, 220, 520);
  const setZoom = (z) => { setZoomState(z); app.setSetting('noteZoom', z); };

  const create = useCallback(async (tpl) => {
    const n = await DB.save('notes', { title: tpl ? tpl.name : '', content: tpl ? tpl.content : '', plain: '', ink: '[]', tag: tag || '', pinned: 0 });
    setSelId(n.id);
    setTplOpen(false);
  }, [tag]);

  useEffect(() => { if (app.params.newNote) create(); if (app.params.noteId) setSelId(app.params.noteId); }, [app.params._t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!selId && notes.data?.length) setSelId(notes.data[0].id); }, [notes.data, selId]);

  // tags sorted by how many notes use them (most used first)
  const tags = useMemo(() => {
    const n = new Map();
    for (const x of notes.data || []) if (x.tag) n.set(x.tag, (n.get(x.tag) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, c]) => ({ t, c }));
  }, [notes.data]);
  const list = (notes.data || []).filter((n) => (!tag || n.tag === tag || (tag === '__pin' && n.pinned)) && (!q || `${n.title} ${n.plain}`.toLowerCase().includes(q.toLowerCase())));
  const sel = (notes.data || []).find((n) => n.id === selId);
  const onSave = useCallback((row) => DB.save('notes', row), []);

  const del = async () => {
    if (!(await app.confirm(T('Hapus catatan “{t}”?', { t: sel.title || T('Tanpa judul') }), { danger: true, ok: T("Hapus") }))) return;
    await DB.remove('notes', sel.id);
    setSelId(null);
  };

  return (
    <div className="page full" style={{ paddingBottom: 24 }}>
      <div className="notes-layout">
        <aside className="card notes-list" style={{ width: listW.width }}>
          <div className="row">
            <label className="sr" htmlFor="n-q">{T("Cari catatan")}</label>
            <input id="n-q" className="field" placeholder={T("Cari catatan…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn pri" aria-label={T("Catatan baru")} title={T("Catatan baru")} onClick={() => create()} style={{ padding: '0 10px' }}><Icon name="plus" /></button>
          </div>
          <button className="btn sm" onClick={() => setTplOpen(true)}><Icon name="note" size="sm" />{T("Baru dari template")}</button>
          <TagFilter tags={tags} tag={tag} setTag={setTag} />
          <div className="col" style={{ gap: 2, overflow: 'auto', flex: 1, margin: '0 -4px', padding: '0 4px' }}>
            {list.length === 0 && <div className="empty">{notes.data?.length ? T("Tidak ada yang cocok.") : T("Belum ada catatan. Klik + untuk membuat.")}</div>}
            {list.map((n) => (
              <button key={n.id} className={`note-item ${n.id === selId ? 'on' : ''}`} onClick={() => setSelId(n.id)} onContextMenu={(e) => openMenu(e, noteItems(app, n, { onOpen: (x) => setSelId(x.id), onDeleted: (x) => { if (x.id === selId) setSelId(null); } }))}>
                <span className="row" style={{ fontWeight: 700, gap: 6 }}>{n.pinned ? <Icon name="pinned" size="sm" /> : null}<span className="ellipsis grow">{n.title || T("Tanpa judul")}</span>{n.sticky ? <span title={T("Sedang terbuka sebagai jendela mengambang")} style={{ display: 'inline-flex' }}><Icon name="widget" size="sm" className="mut" /></span> : null}</span>
                <span className="mut ellipsis" style={{ fontSize: 12 }}>{(n.plain || '').slice(0, 80) || (n.ink && n.ink !== '[]' ? T("Coretan pena") : T("Kosong"))}</span>
                <span className="mut" style={{ fontSize: 11 }}>{timeAgo(new Date(n.updated_at).getTime())}{n.tag ? ` · #${n.tag}` : ''}</span>
              </button>
            ))}
          </div>
        </aside>
        <Resizer panel={listW} label={T('Ubah lebar daftar catatan')} />
        {sel ? (
          <div className="col grow" style={{ minWidth: 0, gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="mut" style={{ fontSize: 13 }}>{T("Tag:")}</span>
              {tagEdit != null ? (
                <TagInput autoFocus value={tagEdit} onChange={setTagEdit} options={tags} commitOnPick onCommit={(v) => { if (v !== (sel.tag || '')) DB.save('notes', { id: sel.id, tag: v }); setTagEdit(null); }} onCancel={() => setTagEdit(null)} style={{ width: 180, minHeight: 32 }} placeholder={T('Ketik atau pilih tag')} aria-label={T("Tag catatan")} />
              ) : (
                <button className="chip" onClick={() => setTagEdit(sel.tag || '')}>{sel.tag ? '#' + sel.tag : T("+ tambah tag")}</button>
              )}
            </div>
            <NoteEditor key={sel.id} note={sel} onSave={onSave} onDelete={del} onPin={(p) => DB.save('notes', { id: sel.id, pinned: p ? 1 : 0 })} onFloat={() => api('sticky:open', sel.id)} onError={(err) => app.toast({ text: String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), error: true })} zoom={zoom} setZoom={setZoom} />
          </div>
        ) : (
          <section className="card editor-card" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="empty"><Icon name="note" size="lg" /><p>{T("Pilih atau buat catatan.")}</p><button className="btn pri" onClick={() => create()}><Icon name="plus" size="sm" />{T("Catatan baru")}</button></div>
          </section>
        )}
      </div>
      {tplOpen && (
        <Modal title={T("Buat dari template")} width={460} onClose={() => setTplOpen(false)}>
          <div className="col" style={{ gap: 6 }}>
            {(templates.data || []).map((t) => (
              <div key={t.id} className="row">
                <button className="mini-ev grow" onClick={() => create(t)}><Icon name="note" size="sm" /><span style={{ fontWeight: 700 }}>{t.name}</span></button>
                <button className="icb sm" aria-label={T('Hapus template {t}', { t: t.name })} onClick={() => DB.remove('note_templates', t.id)}><Icon name="trash" size="sm" /></button>
              </div>
            ))}
          </div>
          {sel && <TemplateFromNote note={sel} />}
        </Modal>
      )}
    </div>
  );
}

function TemplateFromNote({ note }) {
  const [name, setName] = useState('');
  const app = useApp();
  return (
    <div className="col" style={{ gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <Field label={T("Simpan catatan yang terbuka sebagai template")}>
        <div className="row">
          <input className="field" placeholder={T("Nama template")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={async () => { if (!name.trim()) return; await DB.save('note_templates', { name: name.trim(), content: note.content }); setName(''); app.toast(T("Template disimpan")); }}>{T("Simpan")}</button>
        </div>
      </Field>
    </div>
  );
}
