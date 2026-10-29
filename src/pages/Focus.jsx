import { Fragment, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Icon from '../components/Icon.jsx';
import { Modal, Seg, Field, ColorPick } from '../components/ui.jsx';
import { DB, useApp, useNow, useQuery, themeColors } from '../lib/api.js';
import { mmss, useFocusLeft } from '../lib/focus.js';
import { toLocalDate, addDays, parseQuickTask, DOW_ID, parseLocal } from '../../shared/recur.js';
import { T } from '../lib/i18n.js';
import { openMenu } from '../components/ContextMenu.jsx';
import { taskItems } from '../lib/menus.js';
import TaskModal, { PRIO } from '../components/TaskModal.jsx';

function Pomodoro() {
  const app = useApp();
  const f = app.focus;
  const left = useFocusLeft(f);
  const R = 92, C = 2 * Math.PI * R;
  const prog = 1 - left / f.total;
  return (
    <section data-tour="pomodoro" className="card pad col" style={{ flex: '1 1 330px', alignItems: 'center', gap: 16 }}>
      <Seg label={T("Mode")} value={f.phase} onChange={f.setPhase} options={[{ value: 'focus', label: T('Fokus') + ' ' + (app.settings.focusMin || 25) }, { value: 'short', label: T('Istirahat') + ' ' + (app.settings.shortMin || 5) }, { value: 'long', label: T('Panjang') + ' ' + (app.settings.longMin || 15) }]} />
      <div style={{ position: 'relative', width: 230, height: 230 }}>
        <svg viewBox="0 0 210 210" style={{ width: 230, height: 230, transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="105" cy="105" r={R} style={{ fill: 'none', stroke: 'var(--surface2)', strokeWidth: 12 }} />
          <circle cx="105" cy="105" r={R} style={{ fill: 'none', stroke: f.phase === 'focus' ? 'var(--accent)' : 'var(--pos)', strokeWidth: 12, strokeLinecap: 'round', strokeDasharray: C, strokeDashoffset: C * (1 - prog), transition: 'stroke-dashoffset .3s linear' }} />
        </svg>
        <div className="col" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <span className="num" style={{ fontSize: 46, fontWeight: 800 }}>{mmss(left)}</span>
          <span className="mut" style={{ fontSize: 13 }}>{f.phase === 'focus' ? T('Sesi ke-{n}', { n: f.count + 1 }) : T("Istirahat")}</span>
        </div>
      </div>
      <label className="sr" htmlFor="pomo-l">{T("Sedang mengerjakan")}</label>
      <input id="pomo-l" className="field" placeholder={T("Sedang mengerjakan apa?")} value={f.label} onChange={(e) => f.setLabel(e.target.value)} style={{ textAlign: 'center', maxWidth: 280 }} />
      <div className="row">
        <button className="btn pri" onClick={f.running ? f.pause : f.start} style={{ minWidth: 120 }}><Icon name={f.running ? 'pause' : 'play'} size="sm" />{f.running ? T("Jeda") : left < f.total ? T("Lanjut") : T("Mulai")}</button>
        <button className="btn" onClick={f.reset}>{T("Reset")}</button>
        <button className="btn ghost" onClick={f.skip} title={T("Lewati ke fase berikutnya")}>{T("Lewati")}</button>
      </div>
      <span className="mut" style={{ fontSize: 12, textAlign: 'center' }}>{T(
        "Selama sesi fokus, notifikasi non-penting (alert harga, ringkasan) ditahan. Pengingat acara tetap muncul."
      )}</span>
    </section>
  );
}

function Habits({ today }) {
  const app = useApp();
  const habits = useQuery(() => DB.list('habits', { where: { archived: { ne: 1 } }, order: 'sort' }), [], ['habits']);
  const start = addDays(parseLocal(today), -((parseLocal(today).getDay() + 6) % 7)); // Monday
  const days = Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(start, i)));
  const logs = useQuery(() => DB.list('habit_logs', { where: { date: { gte: toLocalDate(addDays(start, -60)) } } }), [today], ['habit_logs']);
  const [edit, setEdit] = useState(null);
  const has = (hid, d) => (logs.data || []).some((l) => l.habit_id === hid && l.date === d);
  const toggle = (hid, d) => (has(hid, d) ? DB.remove('habit_logs', `${hid}|${d}`) : DB.save('habit_logs', { id: `${hid}|${d}`, habit_id: hid, date: d }));
  const streak = (hid) => { let n = 0; let d = parseLocal(today); if (!has(hid, today)) d = addDays(d, -1); while (has(hid, toLocalDate(d))) { n++; d = addDays(d, -1); } return n; };
  return (
    <section className="card pad col" style={{ flex: '1 1 380px', gap: 10 }}>
      <div className="row"><h2 className="h2 grow">{T("Kebiasaan minggu ini")}</h2><button className="btn sm" onClick={() => setEdit({ name: '', color: 'c1', sort: (habits.data || []).length, archived: 0 })}><Icon name="plus" size="sm" />{T("Kebiasaan|add")}</button></div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, 32px) 60px', gap: 8, alignItems: 'center', minWidth: 430 }}>
          <span />
          {days.map((d) => <span key={d} className="mut" style={{ textAlign: 'center', fontSize: 11, fontWeight: 700 }}>{DOW_ID[parseLocal(d).getDay()].slice(0, 3)}<br />{Number(d.slice(8))}</span>)}
          <span className="mut" style={{ fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{T("Streak")}</span>
          {(habits.data || []).map((h) => (
            <Fragment key={h.id}>
              <button className="btn ghost sm" style={{ justifyContent: 'flex-start', padding: '0 4px' }} onClick={() => setEdit(h)} onContextMenu={(e) => openMenu(e, [
                { label: T('Edit kebiasaan'), icon: 'edit', run: () => setEdit(h) },
                '-',
                { label: T('Hapus kebiasaan'), icon: 'trash', danger: true, run: async () => { if (await app.confirm(T('Hapus kebiasaan “{t}” dan riwayatnya?', { t: h.name }), { danger: true, ok: T('Hapus') })) DB.remove('habits', h.id); } }
              ])}><span className={`dot k-${h.color}`} />{h.name}</button>
              {days.map((d) => <button key={h.id + d} className={`hb k-${h.color} ${has(h.id, d) ? 'on' : ''} ${d === today ? 'today' : ''}`} aria-label={`${h.name} ${d}`} aria-pressed={has(h.id, d)} disabled={d > today} onClick={() => toggle(h.id, d)} style={d > today ? { opacity: 0.4 } : undefined} />)}
              <span className="num" style={{ textAlign: 'center', fontWeight: 800 }} title={T("Hari berturut-turut")}>{T('{n} hr', { n: streak(h.id) })}</span>
            </Fragment>
          ))}
        </div>
      </div>
      {edit && (
        <Modal title={edit.id ? T("Edit kebiasaan") : T("Kebiasaan baru")} width={420} onClose={() => setEdit(null)} footer={<>
          {edit.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { if (await app.confirm(T('Hapus kebiasaan “{t}” dan riwayatnya?', { t: edit.name }), { danger: true, ok: T("Hapus") })) { await DB.remove('habits', edit.id); setEdit(null); } }}>{T("Hapus")}</button>}
          <button className="btn" onClick={() => setEdit(null)}>{T("Batal")}</button>
          <button className="btn pri" onClick={async () => { if (!edit.name.trim()) return; await DB.save('habits', edit); setEdit(null); }}>{T("Simpan")}</button>
        </>}>
          <Field label={T("Nama")}><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={T("Warna")}><ColorPick value={edit.color} onChange={(c) => setEdit({ ...edit, color: c })} /></Field>
        </Modal>
      )}
    </section>
  );
}

function Stats({ today }) {
  const app = useApp();
  const C = useMemo(() => themeColors(), [app.dark]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = addDays(parseLocal(today), -6);
  const sessions = useQuery(() => DB.list('focus_sessions', { where: { start: { gte: toLocalDate(start) } } }), [today], ['focus_sessions']);
  const done = useQuery(() => DB.list('tasks', { where: { done: 1 } }), [], ['tasks']);
  const days = Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(start, i)));
  const data = days.map((d) => ({ name: DOW_ID[parseLocal(d).getDay()].slice(0, 3), Menit: (sessions.data || []).filter((s) => s.start.startsWith(d)).reduce((a, s) => a + s.minutes, 0) }));
  const total = data.reduce((a, x) => a + x.Menit, 0);
  const doneWeek = (done.data || []).filter((t) => t.done_at && toLocalDate(new Date(t.done_at)) >= toLocalDate(start)).length;
  return (
    <section className="card pad col" style={{ flex: '1 1 380px', gap: 10 }}>
      <h2 className="h2">{T("Statistik 7 hari")}</h2>
      <div className="row wrap" style={{ gap: 24 }}>
        <div className="col" style={{ gap: 0 }}><span className="lbl">{T("Waktu fokus")}</span><span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{T('{n} j', { n: Math.floor(total / 60) })} {total % 60} m</span></div>
        <div className="col" style={{ gap: 0 }}><span className="lbl">{T("Sesi")}</span><span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{(sessions.data || []).length}</span></div>
        <div className="col" style={{ gap: 0 }}><span className="lbl">{T("Tugas selesai")}</span><span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{doneWeek}</span></div>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="name" stroke={C.muted} tickLine={false} axisLine={false} />
            <YAxis stroke={C.muted} tickLine={false} axisLine={false} width={30} />
            <Tooltip cursor={{ fill: C.surface2 }} contentStyle={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, color: C.text }} formatter={(v) => [T('{n} menit', { n: v }), T('Menit')]} />
            <Bar dataKey="Menit" name={T("Menit")} fill={C.accent} radius={[6, 6, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function Focus() {
  const app = useApp();
  const now = useNow(60000);
  const today = toLocalDate(now);
  const tasks = useQuery(() => DB.list('tasks', { order: 'done,due_date,due_time,priority desc,sort' }), [], ['tasks']);
  const [filter, setFilter] = useState('today');
  const [quick, setQuick] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => { if (app.params.taskId && tasks.data) { const t = tasks.data.find((x) => x.id === app.params.taskId); if (t) setModal(t); } }, [app.params._t, tasks.data == null]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = quick.trim() ? parseQuickTask(quick) : null;
  const add = async () => {
    if (!preview?.title) return;
    await DB.save('tasks', { ...preview, done: 0, reminder_min: preview.due_time ? 0 : -1, sort: Date.now() });
    setQuick('');
  };
  const all = tasks.data || [];
  const week = toLocalDate(addDays(now, 7));
  const lists = {
    today: all.filter((t) => !t.done && (!t.due_date || t.due_date <= today)),
    upcoming: all.filter((t) => !t.done && t.due_date && t.due_date > today),
    all: all.filter((t) => !t.done),
    done: all.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 100)
  };
  const shown = lists[filter];

  return (
    <div className="page">
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Pomodoro />
        <section className="card pad col" style={{ flex: '2 1 460px', gap: 8 }}>
          <div className="row wrap"><h2 className="h2 grow">{T("Tugas")}</h2>
            <Seg label={T("Filter tugas")} value={filter} onChange={setFilter} options={[{ value: 'today', label: `${T('Hari ini')} (${lists.today.length})` }, { value: 'upcoming', label: `${T('Mendatang')} (${lists.upcoming.length})` }, { value: 'all', label: T("Semua") }, { value: 'done', label: T("Selesai") }]} />
          </div>
          <div className="row">
            <label className="sr" htmlFor="t-new">{T("Tugas baru")}</label>
            <input id="t-new" className="field" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={T("Ketik tugas… mis. “revisi abstrak besok 09.00 #TA !tinggi”")} />
            <button className="btn pri" onClick={add}><Icon name="plus" size="sm" />{T("Tambah")}</button>
          </div>
          {preview && (preview.due_date || preview.tag || preview.priority) ? (
            <span className="mut" style={{ fontSize: 12 }}>{T("Terbaca:")} <strong>{preview.title}</strong>{preview.due_date ? ` · ${preview.due_date}` : ''}{preview.due_time ? ` ${preview.due_time}` : ''}{preview.tag ? ` · #${preview.tag}` : ''}{preview.priority ? ` · ${T('prioritas')} ${PRIO[preview.priority].toLowerCase()}` : ''}</span>
          ) : <span className="mut" style={{ fontSize: 12 }}>{T(
            "Bisa pakai kata: hari ini, besok, lusa, nama hari, 12/11, jam 9, 14.30, #tag, !tinggi"
          )}</span>}
          <div className="col" style={{ gap: 2, maxHeight: 460, overflow: 'auto' }}>
            {shown.length === 0 && <div className="empty">{filter === 'done' ? T("Belum ada tugas selesai.") : T("Tidak ada tugas.")}</div>}
            {shown.map((t) => {
              const late = !t.done && t.due_date && t.due_date < today;
              return (
                <div key={t.id} className={`task ${t.done ? 'done' : ''}`} onContextMenu={(e) => openMenu(e, taskItems(app, t, { onEdit: setModal }))}>
                  <button className={`chk ${t.done ? 'on' : ''}`} aria-label={t.done ? T("Tandai belum selesai") : T("Tandai selesai")} onClick={() => DB.save('tasks', { id: t.id, done: t.done ? 0 : 1, done_at: t.done ? null : new Date().toISOString() })}><Icon name="check" size="sm" /></button>
                  <button className="t grow ellipsis" onClick={() => setModal(t)} style={{ border: 0, background: 'transparent', textAlign: 'left', padding: 0, color: 'inherit', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.priority > 0 && <Icon name="flag" size="sm" className={`prio-${t.priority}`} />} {t.title}
                  </button>
                  {t.reminder_min >= 0 && t.due_date && !t.done && <Icon name="bell" size="sm" className="mut" />}
                  {t.due_date && <span className={`num ${late ? 'dn' : 'mut'}`} style={{ fontSize: 12, fontWeight: late ? 700 : 500 }}>{late ? T("terlambat · ") : ''}{t.due_date === today ? T("hari ini") : t.due_date === toLocalDate(addDays(now, 1)) ? T("besok") : t.due_date <= week ? DOW_ID[parseLocal(t.due_date).getDay()] : t.due_date}{t.due_time ? ' ' + t.due_time.replace(':', '.') : ''}</span>}
                  {t.tag && <span className="chip">#{t.tag}</span>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Habits today={today} />
        <Stats today={today} />
      </div>
      {modal && <TaskModal task={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
