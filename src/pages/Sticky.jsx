import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Icon from '../components/Icon.jsx';
import { noteExtensions } from '../components/NoteEditor.jsx';
import { api, DB, on } from '../lib/api.js';
import { STICKY_COLORS, stickyColor } from '../../shared/sticky.js';
import { T } from '../lib/i18n.js';

// Floating sticky-note window for one note (route #/sticky/<noteId>).
export default function Sticky() {
  const id = decodeURIComponent(location.hash.replace(/^#\/sticky\//, ''));
  const [note, setNote] = useState(null);
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const lastContent = useRef('');
  const saveT = useRef();

  const editor = useEditor({
    extensions: noteExtensions(T('Tulis catatan…'), { noteId: id }),
    content: '',
    onUpdate: ({ editor: ed }) => {
      clearTimeout(saveT.current);
      saveT.current = setTimeout(() => {
        const json = JSON.stringify(ed.getJSON());
        const plain = ed.getText();
        lastContent.current = json;
        const patch = { id, content: json, plain };
        DB.get('notes', id).then((n) => { if (n && !n.title) patch.title = plain.split('\n').find((l) => l.trim())?.slice(0, 60) || ''; DB.save('notes', patch); });
      }, 500);
    }
  });

  const load = () => DB.get('notes', id).then((n) => {
    if (!n) { api('win:closeSelf'); return; }
    setNote(n);
    document.title = n.title || 'Sticky note';
    if (editor && n.content !== lastContent.current && !editor.isFocused) {
      try { editor.commands.setContent(n.content ? JSON.parse(n.content) : '', false); } catch { /* bad json */ }
      lastContent.current = n.content || '';
    }
  });

  useEffect(() => {
    if (!editor) return undefined;
    load();
    const off = on('db:changed', (t) => t.includes('notes') && load());
    const offTheme = on('theme:changed', (t) => setDark(!!t.dark));
    const flush = () => { if (saveT.current) { clearTimeout(saveT.current); const json = JSON.stringify(editor.getJSON()); if (json !== lastContent.current) DB.save('notes', { id, content: json, plain: editor.getText() }); } };
    window.addEventListener('beforeunload', flush);
    editor.commands.focus('end');
    return () => { off(); offTheme(); window.removeEventListener('beforeunload', flush); };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note || !editor) return <div style={{ height: '100vh', background: 'var(--surface)' }} />;
  const c = stickyColor(note.sticky_color);
  const top = !!note.sticky_top;
  const e = editor;
  const B = ({ label, icon, text, on: active, run, style }) => (
    <button className={`sticky-btn ${active ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={active ? 'true' : 'false'} onMouseDown={(ev) => ev.preventDefault()} onClick={run} style={style}>
      {icon ? <Icon name={icon} size="sm" /> : text}
    </button>
  );

  return (
    <div className="sticky" style={{ '--st-head': c.head, '--st-body': dark ? c.dark : c.light }}>
      <div className="sticky-head drag">
        <button className="sticky-btn nodrag" aria-label={T("Sticky note baru")} title={T("Sticky note baru")} onClick={() => api('sticky:new')}><Icon name="plus" size="sm" /></button>
        <span className="sticky-title">{note.title || ''}</span>
        <button className={`sticky-btn nodrag ${top ? 'on' : ''}`} aria-label={top ? T("Matikan selalu di atas") : T("Selalu di atas")} aria-pressed={top} title={top ? T("Selalu di atas: aktif") : T("Selalu di atas")} onClick={() => api('sticky:setTop', !top).then(load)}><Icon name="pinned" size="sm" /></button>
        <button className="sticky-btn nodrag" aria-label={T("Menu")} aria-expanded={menu} onClick={() => { setMenu(!menu); setConfirmDel(false); }}><Icon name="more" size="sm" style={{ strokeWidth: 3.2 }} /></button>
        <button className="sticky-btn nodrag" aria-label={T("Tutup jendela")} title={T("Tutup (catatan tetap tersimpan)")} onClick={() => api('win:closeSelf')}><Icon name="x" size="sm" /></button>
      </div>
      {menu && (
        <div className="sticky-menu" role="menu">
          <div className="sticky-colors" role="radiogroup" aria-label={T("Warna")}>
            {Object.entries(STICKY_COLORS).map(([k, v]) => (
              <button key={k} role="radio" aria-checked={note.sticky_color === k || (!note.sticky_color && k === 'yellow')} aria-label={v.name} title={v.name}
                className={`sticky-swatch ${note.sticky_color === k || (!note.sticky_color && k === 'yellow') ? 'on' : ''}`} style={{ background: v.head }}
                onClick={() => api('sticky:setColor', k).then(load)} />
            ))}
          </div>
          <button className="sticky-item" role="menuitemcheckbox" aria-checked={top} onClick={() => api('sticky:setTop', !top).then(load)}><Icon name="pinned" size="sm" />{T("Selalu di atas")}<span style={{ marginLeft: 'auto' }}>{top ? T("Aktif") : T("Mati")}</span></button>
          <button className="sticky-item" role="menuitem" onClick={() => { api('win:show', { nav: 'notes', noteId: id }); setMenu(false); }}><Icon name="external" size="sm" />{T("Buka di aplikasi")}</button>
          <button className="sticky-item danger" role="menuitem" onClick={() => (confirmDel ? DB.remove('notes', id) : setConfirmDel(true))}><Icon name="trash" size="sm" />{confirmDel ? T("Klik lagi untuk menghapus") : T("Hapus catatan")}</button>
        </div>
      )}
      <div className="sticky-body" onMouseDown={() => setMenu(false)}>
        <EditorContent editor={e} />
      </div>
      <div className="sticky-tools" role="toolbar" aria-label={T("Format")}>
        <B label={T("Tebal (Ctrl+B)")} text="B" style={{ fontWeight: 800 }} on={e.isActive('bold')} run={() => e.chain().focus().toggleBold().run()} />
        <B label={T("Miring (Ctrl+I)")} text="I" style={{ fontStyle: 'italic', fontFamily: 'Lora, serif' }} on={e.isActive('italic')} run={() => e.chain().focus().toggleItalic().run()} />
        <B label={T("Garis bawah (Ctrl+U)")} text="U" style={{ textDecoration: 'underline' }} on={e.isActive('underline')} run={() => e.chain().focus().toggleUnderline().run()} />
        <B label={T("Coret")} text="ab" style={{ textDecoration: 'line-through' }} on={e.isActive('strike')} run={() => e.chain().focus().toggleStrike().run()} />
        <B label={T("Stabilo")} icon="hl" on={e.isActive('highlight')} run={() => e.chain().focus().toggleHighlight({ color: '#FDE68A' }).run()} />
        <B label={T("Daftar berpoin")} icon="list" on={e.isActive('bulletList')} run={() => e.chain().focus().toggleBulletList().run()} />
        <B label={T("Checklist")} icon="checklist" on={e.isActive('taskList')} run={() => e.chain().focus().toggleTaskList().run()} />
      </div>
    </div>
  );
}
