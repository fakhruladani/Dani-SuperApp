import { useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { DB, useApp } from '../lib/api.js';
import { T } from '../lib/i18n.js';

// Shared by Fokus & Tugas and Proyek.
export const PRIO = [T('Rendah'), T('Sedang'), T('Tinggi')];
const TREM = [[-1, T('Tanpa pengingat')], [0, T('Saat tenggat')], [15, T('15 menit sebelum')], [30, T('30 menit sebelum')], [60, T('1 jam sebelum')], [1440, T('1 hari sebelum')]];

export default function TaskModal({ task, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ title: '', notes: '', due_date: '', due_time: '', tag: '', priority: 0, reminder_min: 0, done: 0, ...task });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title.trim()) return;
    await DB.save('tasks', { ...f, due_date: f.due_date || null, due_time: f.due_date && f.due_time ? f.due_time : null, priority: Number(f.priority), reminder_min: f.due_date ? Number(f.reminder_min) : -1 });
    app.toast(T("Tugas disimpan"));
    onClose();
  };
  return (
    <Modal title={f.id ? T("Edit tugas") : T("Tugas baru")} onClose={onClose} width={520} footer={<>
      {f.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { await DB.remove('tasks', f.id); onClose(); }}>{T("Hapus")}</button>}
      <button className="btn" onClick={onClose}>{T("Batal")}</button>
      <button className="btn pri" onClick={save}>{T("Simpan")}</button>
    </>}>
      <input className="field" aria-label={T("Judul tugas")} value={f.title} onChange={set('title')} style={{ fontSize: 17, fontWeight: 700 }} onKeyDown={(e) => e.key === 'Enter' && save()} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={T("Tenggat")}><input type="date" className="field" value={f.due_date || ''} onChange={set('due_date')} /></Field>
        <Field label={T("Jam (opsional)")}><input type="time" className="field" value={f.due_time || ''} onChange={set('due_time')} disabled={!f.due_date} /></Field>
        <Field label={T("Prioritas")}><select className="field" value={f.priority} onChange={set('priority')}>{PRIO.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></Field>
        <Field label={T("Pengingat")}><select className="field" value={f.reminder_min} onChange={set('reminder_min')} disabled={!f.due_date}>{TREM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <Field label={T("Tag")}><input className="field" value={f.tag || ''} onChange={(e) => setF({ ...f, tag: e.target.value.replace(/\s|#/g, '') })} placeholder={T("mis. TA")} /></Field>
      <Field label={T("Catatan")}><textarea className="field" rows={3} value={f.notes || ''} onChange={set('notes')} /></Field>
    </Modal>
  );
}

