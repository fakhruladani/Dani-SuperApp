import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import { Modal, Field } from '../components/ui.jsx';
import { api, DB, useApp, useQuery } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { T } from '../lib/i18n.js';

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
  const setZoom = (z) => { setZoomState(z); app.setSetting('noteZoom', z); };

  const create = useCallback(async (tpl) => {
    const n = await DB.save('notes', { title: tpl ? tpl.name : '', content: tpl ? tpl.content : '', plain: '', ink: '[]', tag: tag || '', pinned: 0 });
    setSelId(n.id);
    setTplOpen(false);
  }, [tag]);

  useEffect(() => { if (app.params.newNote) create(); if (app.params.noteId) setSelId(app.params.noteId); }, [app.params._t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!selId && notes.data?.length) setSelId(notes.data[0].id); }, [notes.data, selId]);

  const tags = useMemo(() => [...new Set((notes.data || []).map((n) => n.tag).filter(Boolean))].sort(), [notes.data]);
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
        <aside className="card notes-list">
          <div className="row">
            <label className="sr" htmlFor="n-q">{T("Cari catatan")}</label>
            <input id="n-q" className="field" placeholder={T("Cari catatan…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn pri" aria-label={T("Catatan baru")} title={T("Catatan baru")} onClick={() => create()} style={{ padding: '0 10px' }}><Icon name="plus" /></button>
          </div>
          <button className="btn sm" onClick={() => setTplOpen(true)}><Icon name="note" size="sm" />{T("Baru dari template")}</button>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`chip ${!tag ? 'on' : ''}`} onClick={() => setTag('')}>{T("Semua")}</button>
            <button className={`chip ${tag === '__pin' ? 'on' : ''}`} onClick={() => setTag('__pin')}>{T("Disematkan")}</button>
            {tags.map((t) => <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(t)}>#{t}</button>)}
          </div>
          <div className="col" style={{ gap: 2, overflow: 'auto', flex: 1, margin: '0 -4px', padding: '0 4px' }}>
            {list.length === 0 && <div className="empty">{notes.data?.length ? T("Tidak ada yang cocok.") : T("Belum ada catatan. Klik + untuk membuat.")}</div>}
            {list.map((n) => (
              <button key={n.id} className={`note-item ${n.id === selId ? 'on' : ''}`} onClick={() => setSelId(n.id)}>
                <span className="row" style={{ fontWeight: 700, gap: 6 }}>{n.pinned ? <Icon name="pinned" size="sm" /> : null}<span className="ellipsis grow">{n.title || T("Tanpa judul")}</span>{n.sticky ? <span title={T("Sedang terbuka sebagai jendela mengambang")} style={{ display: 'inline-flex' }}><Icon name="widget" size="sm" className="mut" /></span> : null}</span>
                <span className="mut ellipsis" style={{ fontSize: 12 }}>{(n.plain || '').slice(0, 80) || (n.ink && n.ink !== '[]' ? T("Coretan pena") : T("Kosong"))}</span>
                <span className="mut" style={{ fontSize: 11 }}>{timeAgo(new Date(n.updated_at).getTime())}{n.tag ? ` · #${n.tag}` : ''}</span>
              </button>
            ))}
          </div>
        </aside>
        {sel ? (
          <div className="col grow" style={{ minWidth: 0, gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="mut" style={{ fontSize: 13 }}>{T("Tag:")}</span>
              {tagEdit != null ? (
                <input className="field" autoFocus value={tagEdit} onChange={(e) => setTagEdit(e.target.value.replace(/\s/g, ''))} onBlur={() => { DB.save('notes', { id: sel.id, tag: tagEdit }); setTagEdit(null); }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} style={{ width: 180, minHeight: 32 }} aria-label={T("Tag catatan")} />
              ) : (
                <button className="chip" onClick={() => setTagEdit(sel.tag || '')}>{sel.tag ? '#' + sel.tag : T("+ tambah tag")}</button>
              )}
            </div>
            <NoteEditor key={sel.id} note={sel} onSave={onSave} onDelete={del} onPin={(p) => DB.save('notes', { id: sel.id, pinned: p ? 1 : 0 })} onFloat={() => api('sticky:open', sel.id)} zoom={zoom} setZoom={setZoom} />
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
