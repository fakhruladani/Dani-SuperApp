import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Modal, Seg, Field, ColorPick, Switch, Empty } from '../components/ui.jsx';
import TaskModal from '../components/TaskModal.jsx';
import { DB, useApp, useNow, useQuery } from '../lib/api.js';
import { toLocalDate, addDays, parseLocal, parseQuickTask, fmtDateLong, DOW_ID } from '../../shared/recur.js';
import { T } from '../lib/i18n.js';

// A project is a task tag (#TA) plus optional metadata (name, deadline, color) in `projects`.
// Tags that only exist on tasks still show up, so tagging a task is enough to start a project.
const keyOf = (tag) => String(tag || '').trim().toLowerCase();
const cleanTag = (s) => String(s || '').replace(/\s|#/g, '');
// auto projects (tag only) get a stable color from the tag name
const tagColor = (tag) => 'c' + (1 + [...keyOf(tag)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 8);
const dayDiff = (from, to) => Math.round((parseLocal(to) - parseLocal(from)) / 86400000);

export function countdown(deadline, today) {
  if (!deadline) return null;
  const n = dayDiff(today, deadline);
  if (n > 0) return { n, text: T('H-{n}', { n }), cls: n <= 7 ? 'warn' : '' };
  if (n === 0) return { n, text: T('Hari H'), cls: 'dn' };
  return { n, text: T('Lewat {n} hari', { n: -n }), cls: 'dn' };
}

function useGroups(tasks, projects, today) {
  return useMemo(() => {
    const map = new Map();
    const ensure = (tag) => {
      const k = keyOf(tag);
      if (!map.has(k)) map.set(k, { key: k, tag, meta: null, tasks: [] });
      return map.get(k);
    };
    for (const p of projects) if (p.tag) ensure(p.tag).meta = p;
    for (const t of tasks) if (t.tag) ensure(t.tag).tasks.push(t);
    return [...map.values()].map((g) => {
      const open = g.tasks.filter((t) => !t.done).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || (a.due_time || '').localeCompare(b.due_time || '') || (b.priority || 0) - (a.priority || 0));
      const done = g.tasks.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
      const total = g.tasks.length;
      return {
        ...g,
        tag: g.meta?.tag || g.tag,
        name: g.meta?.name || '#' + (g.meta?.tag || g.tag),
        color: g.meta?.color || tagColor(g.tag),
        deadline: g.meta?.deadline || null,
        archived: !!g.meta?.archived,
        open, done, total,
        pct: total ? Math.round((done.length / total) * 100) : 0,
        overdue: open.filter((t) => t.due_date && t.due_date < today).length,
        next: open.find((t) => t.due_date) || null
      };
    }).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.name.localeCompare(b.name));
  }, [tasks, projects, today]);
}

function ProjectModal({ initial, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', tag: '', deadline: '', color: 'c2', note: '', archived: 0, ...initial });
  const save = async () => {
    const tag = cleanTag(f.tag);
    if (!tag) { app.toast({ text: T('Tag wajib diisi'), error: true }); return; }
    const others = await DB.list('projects');
    if (others.some((p) => p.id !== f.id && keyOf(p.tag) === keyOf(tag))) { app.toast({ text: T('Tag ini sudah dipakai proyek lain'), error: true }); return; }
    // renaming the tag moves its tasks along
    const oldTag = initial.tag;
    if (oldTag && keyOf(oldTag) !== keyOf(tag)) {
      for (const t of await DB.list('tasks')) if (keyOf(t.tag) === keyOf(oldTag)) await DB.save('tasks', { id: t.id, tag });
    }
    await DB.save('projects', { ...f, tag, name: f.name.trim(), deadline: f.deadline || null, archived: f.archived ? 1 : 0, sort: f.sort ?? Date.now() });
    app.toast(T('Proyek disimpan'));
    onClose(keyOf(tag));
  };
  const del = async () => {
    if (!(await app.confirm(T('Hapus info proyek “{t}”? Tugas dengan tag ini tetap ada.', { t: f.name || '#' + f.tag }), { danger: true, ok: T('Hapus') }))) return;
    await DB.remove('projects', f.id);
    onClose();
  };
  return (
    <Modal title={f.id ? T('Edit proyek') : T('Proyek baru')} width={480} onClose={() => onClose()} footer={<>
      {f.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={del}>{T('Hapus')}</button>}
      <button className="btn" onClick={() => onClose()}>{T('Batal')}</button>
      <button className="btn pri" onClick={save}>{T('Simpan')}</button>
    </>}>
      <Field label={T('Nama proyek')}><input className="field" value={f.name} placeholder={T('mis. Tugas Akhir')} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={T('Tag tugas')} hint={T('Tugas bertag ini masuk ke proyek.')}><input className="field" value={f.tag} placeholder="TA" onChange={(e) => setF({ ...f, tag: cleanTag(e.target.value) })} /></Field>
        <Field label={T('Tenggat proyek')}><input type="date" className="field" value={f.deadline || ''} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
      </div>
      <Field label={T('Warna')}><ColorPick value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
      <Field label={T('Catatan')}><textarea className="field" rows={3} value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <label className="row" style={{ gap: 10 }}><Switch on={!!f.archived} onChange={(v) => setF({ ...f, archived: v ? 1 : 0 })} label={T('Arsipkan')} /><span>{T('Arsipkan proyek')}</span></label>
    </Modal>
  );
}

function TaskLine({ t, today, onOpen }) {
  const late = !t.done && t.due_date && t.due_date < today;
  const week = toLocalDate(addDays(parseLocal(today), 7));
  const when = !t.due_date ? '' : t.due_date === today ? T('hari ini') : t.due_date === toLocalDate(addDays(parseLocal(today), 1)) ? T('besok') : t.due_date <= week && t.due_date > today ? DOW_ID[parseLocal(t.due_date).getDay()] : t.due_date;
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <button className={`chk ${t.done ? 'on' : ''}`} aria-label={t.done ? T('Tandai belum selesai') : T('Tandai selesai')} onClick={() => DB.save('tasks', { id: t.id, done: t.done ? 0 : 1, done_at: t.done ? null : new Date().toISOString() })}><Icon name="check" size="sm" /></button>
      <button className="t grow ellipsis" onClick={() => onOpen(t)} style={{ border: 0, background: 'transparent', textAlign: 'left', padding: 0, color: 'inherit', textDecoration: t.done ? 'line-through' : 'none' }}>
        {t.priority > 0 && <Icon name="flag" size="sm" className={`prio-${t.priority}`} />} {t.title}
      </button>
      {when && <span className={`num ${late ? 'dn' : 'mut'}`} style={{ fontSize: 12, fontWeight: late ? 700 : 500 }}>{late ? T('terlambat · ') : ''}{when}{t.due_time ? ' ' + t.due_time.replace(':', '.') : ''}</span>}
    </div>
  );
}

export default function Projects() {
  const app = useApp();
  const now = useNow(60000);
  const today = toLocalDate(now);
  const tasks = useQuery(() => DB.list('tasks'), [], ['tasks']);
  const projects = useQuery(() => DB.list('projects', { order: 'sort' }), [], ['projects']);
  const groups = useGroups(tasks.data || [], projects.data || [], today);
  const [view, setView] = useState('active');
  const [sel, setSel] = useState(app.params.tag ? keyOf(app.params.tag) : null);
  const [edit, setEdit] = useState(null);
  const [taskModal, setTaskModal] = useState(null);
  const [quick, setQuick] = useState('');
  const [showDone, setShowDone] = useState(false);

  const shown = groups.filter((g) => (view === 'archived' ? g.archived : !g.archived));
  const cur = groups.find((g) => g.key === sel) || shown[0] || null;
  useEffect(() => { setShowDone(false); setQuick(''); }, [cur?.key]);

  const addTask = async () => {
    if (!cur || !quick.trim()) return;
    const p = parseQuickTask(quick);
    if (!p.title) return;
    await DB.save('tasks', { ...p, tag: cur.tag, done: 0, reminder_min: p.due_time ? 0 : -1, sort: Date.now() });
    setQuick('');
  };
  const loading = tasks.data == null || projects.data == null;

  return (
    <div className="page" data-tour="projects">
      <div className="row wrap" style={{ gap: 12 }}>
        <Seg label={T('Filter proyek')} value={view} onChange={setView} options={[{ value: 'active', label: `${T('Aktif')} (${groups.filter((g) => !g.archived).length})` }, { value: 'archived', label: `${T('Arsip')} (${groups.filter((g) => g.archived).length})` }]} />
        <span className="mut grow" style={{ fontSize: 13 }}>{T('Tugas dikelompokkan per tag. Tulis #tag saat membuat tugas, misalnya “revisi bab 3 besok #TA”.')}</span>
        <button className="btn pri" onClick={() => setEdit({})}><Icon name="plus" size="sm" />{T('Proyek baru')}</button>
      </div>

      {loading ? <div className="skeleton" style={{ height: 240 }} /> : shown.length === 0 ? (
        <div className="card pad"><Empty icon="project">{view === 'archived' ? T('Belum ada proyek diarsipkan.') : T('Belum ada proyek. Beri tag pada tugas (mis. #TA) atau klik “Proyek baru”.')}</Empty></div>
      ) : (
        <div className="proj-layout">
          <div className="col" style={{ gap: 10 }}>
            {shown.map((g) => {
              const cd = countdown(g.deadline, today);
              return (
                <button key={g.key} className={`card proj-card k-${g.color} ${cur?.key === g.key ? 'on' : ''}`} onClick={() => setSel(g.key)} aria-pressed={cur?.key === g.key}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: 'var(--k)' }} />
                    <strong className="grow ellipsis" style={{ textAlign: 'left' }}>{g.name}</strong>
                    {cd && <span className={`chip num ${cd.cls}`}>{cd.text}</span>}
                  </div>
                  <div className="bar" style={{ margin: '10px 0 6px' }}><span style={{ width: g.pct + '%', background: 'var(--k)' }} /></div>
                  <div className="row mut" style={{ fontSize: 12, gap: 6 }}>
                    <span className="num">{g.pct}%</span>
                    <span>·</span>
                    <span>{T('{d}/{n} tugas selesai', { d: g.done.length, n: g.total })}</span>
                    {g.overdue > 0 && <span className="dn" style={{ fontWeight: 700 }}>· {T('{n} terlambat', { n: g.overdue })}</span>}
                    <span className="grow" />
                    <span className="chip">#{g.tag}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {cur && (
            <section className={`card pad col k-${cur.color}`} style={{ gap: 14 }} aria-label={cur.name}>
              <div className="row wrap" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                  <h2 className="h2 ellipsis" style={{ fontSize: 22 }}>{cur.name}</h2>
                  <span className="mut" style={{ fontSize: 13 }}>#{cur.tag}{cur.deadline ? ` · ${T('Tenggat')} ${fmtDateLong(parseLocal(cur.deadline))}` : ` · ${T('Belum ada tenggat')}`}</span>
                </div>
                <button className="btn sm" onClick={() => setEdit(cur.meta || { tag: cur.tag, name: '', color: cur.color })}><Icon name="edit" size="sm" />{cur.meta ? T('Edit proyek') : T('Atur proyek')}</button>
              </div>

              <div className="proj-stats">
                <div className="col"><span className="lbl">{T('Hitung mundur')}</span><span className={`v num ${countdown(cur.deadline, today)?.cls || ''}`}>{countdown(cur.deadline, today)?.text || '—'}</span></div>
                <div className="col"><span className="lbl">{T('Progres')}</span><span className="v num">{cur.pct}%</span></div>
                <div className="col"><span className="lbl">{T('Sisa tugas')}</span><span className="v num">{cur.open.length}</span></div>
                <div className="col"><span className="lbl">{T('Terlambat')}</span><span className={`v num ${cur.overdue ? 'dn' : ''}`}>{cur.overdue}</span></div>
              </div>
              <div className="bar" style={{ height: 10 }}><span style={{ width: cur.pct + '%', background: 'var(--k)' }} /></div>
              {cur.next && <span style={{ fontSize: 13 }}><span className="mut">{T('Berikutnya:')}</span> <strong>{cur.next.title}</strong> <span className="mut num">· {cur.next.due_date}{cur.next.due_time ? ' ' + cur.next.due_time.replace(':', '.') : ''}</span></span>}
              {cur.meta?.note && <p className="mut" style={{ margin: 0, whiteSpace: 'pre-line', fontSize: 13 }}>{cur.meta.note}</p>}

              <div className="row">
                <label className="sr" htmlFor="p-new">{T('Tugas baru')}</label>
                <input id="p-new" className="field" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder={T('Tambah tugas ke #{t}… mis. “kirim draf besok 10.00”', { t: cur.tag })} />
                <button className="btn pri" onClick={addTask}><Icon name="plus" size="sm" />{T('Tambah')}</button>
              </div>
              <div className="col" style={{ gap: 2 }}>
                {cur.open.length === 0 && <span className="mut" style={{ fontSize: 13 }}>{cur.total ? T('Semua tugas selesai.') : T('Belum ada tugas di proyek ini.')}</span>}
                {cur.open.map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={setTaskModal} />)}
              </div>
              {cur.done.length > 0 && (
                <div className="col" style={{ gap: 2 }}>
                  <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                    <Icon name={showDone ? 'down' : 'right'} size="sm" />{T('Selesai ({n})', { n: cur.done.length })}
                  </button>
                  {showDone && cur.done.map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={setTaskModal} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {edit && <ProjectModal initial={edit} onClose={(k) => { setEdit(null); if (k) setSel(k); }} />}
      {taskModal && <TaskModal task={taskModal} onClose={() => setTaskModal(null)} />}
    </div>
  );
}
