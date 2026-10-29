// Right-click menu builders shared by several pages (see components/ContextMenu.jsx).
import { api, DB } from './api.js';
import { toLocalDate, addDays } from '../../shared/recur.js';
import { T } from './i18n.js';

const today = () => toLocalDate(new Date());
const plusDays = (n) => toLocalDate(addDays(new Date(), n));

/** Task: done, edit, reschedule, priority, project, delete. */
export function taskItems(app, t, { onEdit } = {}) {
  const save = (patch) => DB.save('tasks', { id: t.id, ...patch });
  const due = (d) => save({ due_date: d, due_time: d ? t.due_time : null, reminder_min: d ? t.reminder_min : -1 });
  return [
    { label: t.done ? T('Tandai belum selesai') : T('Tandai selesai'), icon: 'check', run: () => save({ done: t.done ? 0 : 1, done_at: t.done ? null : new Date().toISOString() }) },
    onEdit && { label: T('Edit tugas…'), icon: 'edit', run: () => onEdit(t) },
    '-',
    { label: T('Tenggat hari ini'), icon: 'cal', disabled: t.due_date === today(), run: () => due(today()) },
    { label: T('Tenggat besok'), icon: 'cal', disabled: t.due_date === plusDays(1), run: () => due(plusDays(1)) },
    { label: T('Tenggat minggu depan'), icon: 'cal', run: () => due(plusDays(7)) },
    t.due_date && { label: T('Hapus tenggat'), icon: 'x', run: () => due(null) },
    '-',
    ...[[2, T('Prioritas tinggi')], [1, T('Prioritas sedang')], [0, T('Prioritas rendah')]].map(([p, label]) => ({ label, icon: (t.priority || 0) === p ? 'check' : 'flag', disabled: (t.priority || 0) === p, run: () => save({ priority: p }) })),
    t.tag && '-',
    t.tag && { label: T('Buka proyek #{t}', { t: t.tag }), icon: 'project', run: () => app.nav('projects', { tag: t.tag }) },
    '-',
    { label: T('Hapus tugas'), icon: 'trash', danger: true, run: async () => { if (await app.confirm(T('Hapus “{t}”?', { t: t.title }), { danger: true, ok: T('Hapus') })) DB.remove('tasks', t.id); } }
  ];
}

/** Calendar event row (not an occurrence): edit, duplicate, open day, delete. */
export function eventItems(app, ev, { onEdit, onOpenDay, date } = {}) {
  const repeating = ev.repeat && ev.repeat !== 'none';
  return [
    onEdit && { label: T('Edit acara…'), icon: 'edit', run: () => onEdit(ev) },
    { label: T('Duplikat'), icon: 'duplicate', run: async () => { const { id, created_at, updated_at, ...rest } = ev; const n = await DB.save('events', { ...rest, title: rest.title }); app.toast(T('Acara diduplikat')); onEdit?.(n); } },
    onOpenDay && date && { label: T('Lihat tanggal ini'), icon: 'cal', run: () => onOpenDay(date) },
    '-',
    { label: repeating ? T('Hapus acara (semua pengulangan)') : T('Hapus acara'), icon: 'trash', danger: true, run: async () => {
      const msg = repeating ? T('Hapus “{t}” beserta semua pengulangannya?', { t: ev.title }) : T('Hapus “{t}”?', { t: ev.title });
      if (await app.confirm(msg, { danger: true, ok: T('Hapus') })) DB.remove('events', ev.id);
    } }
  ];
}

/** Note in the list: open, pin, float, duplicate, export, delete. */
export function noteItems(app, n, { onOpen, onDeleted } = {}) {
  const run = (ch) => api(ch, n.id).catch((err) => app.toast({ text: String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), error: true }));
  return [
    onOpen && { label: T('Buka'), icon: 'note', run: () => onOpen(n) },
    { label: n.pinned ? T('Lepas sematan') : T('Sematkan'), icon: 'pinned', run: () => DB.save('notes', { id: n.id, pinned: n.pinned ? 0 : 1 }) },
    { label: T('Jendela mengambang'), icon: 'widget', run: () => api('sticky:open', n.id) },
    { label: T('Duplikat'), icon: 'duplicate', run: async () => { const c = await DB.save('notes', { title: (n.title || T('Tanpa judul')) + ' ' + T('(salinan)'), content: n.content, plain: n.plain, ink: n.ink, tag: n.tag, pinned: 0 }); onOpen?.(c); } },
    '-',
    { label: T('Ekspor ke PDF…'), icon: 'download', run: () => run('note:exportPdf') },
    { label: T('Ekspor ke Markdown…'), icon: 'download', run: () => run('note:exportMd') },
    '-',
    { label: T('Hapus catatan'), icon: 'trash', danger: true, run: async () => { if (await app.confirm(T('Hapus catatan “{t}”?', { t: n.title || T('Tanpa judul') }), { danger: true, ok: T('Hapus') })) { await DB.remove('notes', n.id); onDeleted?.(n); } } }
  ];
}

export const copyText = (app, text, label = T('Disalin ke clipboard')) => { api('clipboard:write', String(text)); app.toast(label); };

/** News story: open, copy link/title, save for later. */
export function newsItems(app, n, { saved, toggleSave } = {}) {
  return [
    { label: T('Buka di browser'), icon: 'external', run: () => api('shell:open', n.link) },
    { label: T('Salin tautan'), icon: 'link', run: () => copyText(app, n.link) },
    { label: T('Salin judul'), icon: 'copy', run: () => copyText(app, n.title) },
    toggleSave && '-',
    toggleSave && { label: saved ? T('Hapus dari simpanan') : T('Simpan untuk dibaca nanti'), icon: 'bookmark', run: () => toggleSave(n) }
  ];
}

/** Clipboard history entry -> a new note. */
export async function clipToNote(app, text) {
  const n = await DB.save('notes', { title: text.slice(0, 40), content: JSON.stringify({ type: 'doc', content: text.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) }), plain: text, ink: '[]', pinned: 0 });
  app.nav('notes', { noteId: n.id });
}
