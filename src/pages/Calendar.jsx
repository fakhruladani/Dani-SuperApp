import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import idLocale from '@fullcalendar/core/locales/id';
import Icon from '../components/Icon.jsx';
import { Modal, Seg, Switch, Field, ColorPick } from '../components/ui.jsx';
import { api, DB, useApp, useNow, useQuery, useDebounced } from '../lib/api.js';
import { expandAll, toLocalDate, toLocalDateTime, parseLocal, fmtDateLong, fmtTime, addDays, REPEAT_LABEL, MONTH_ID, pad } from '../../shared/recur.js';
import { T, lang } from '../lib/i18n.js';

const REMINDERS = [[-1, T('Tanpa pengingat')], [0, T('Saat dimulai')], [5, T('5 menit sebelum')], [10, T('10 menit sebelum')], [15, T('15 menit sebelum')], [30, T('30 menit sebelum')], [60, T('1 jam sebelum')], [120, T('2 jam sebelum')], [1440, T('1 hari sebelum')], [2880, T('2 hari sebelum')], [10080, T('1 minggu sebelum')]];
const remLabel = (m) => (REMINDERS.find((r) => r[0] === m) || [m, T('{n} menit sebelum', { n: m })])[1];

export function EventModal({ initial, calendars, onClose, defaultReminder = 30 }) {
  const app = useApp();
  const isNew = !initial.id;
  const [f, setF] = useState(() => {
    const s = parseLocal(initial.start) || new Date();
    const e = parseLocal(initial.end) || new Date(s.getTime() + 3600000);
    return {
      title: initial.title || '', description: initial.description || '', location: initial.location || '',
      all_day: !!initial.all_day, date: toLocalDate(s), time: initial.all_day ? '09:00' : toLocalDateTime(s).slice(11),
      endDate: toLocalDate(e), endTime: initial.all_day ? '10:00' : toLocalDateTime(e).slice(11),
      calendar_id: initial.calendar_id || calendars[0]?.id, repeat: initial.repeat || 'none', repeat_until: initial.repeat_until || '',
      reminder_min: initial.reminder_min ?? defaultReminder
    };
  });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });

  const save = async () => {
    if (!f.title.trim()) { app.toast({ text: T("Judul wajib diisi"), error: true }); return; }
    let start = f.all_day ? f.date : `${f.date}T${f.time}`;
    let end = f.all_day ? (f.endDate < f.date ? f.date : f.endDate) : `${f.endDate}T${f.endTime}`;
    if (!f.all_day && parseLocal(end) <= parseLocal(start)) end = toLocalDateTime(new Date(parseLocal(start).getTime() + 3600000));
    await DB.save('events', { id: initial.id, title: f.title.trim(), description: f.description, location: f.location, start, end, all_day: f.all_day ? 1 : 0, calendar_id: f.calendar_id, repeat: f.repeat, repeat_until: f.repeat !== 'none' && f.repeat_until ? f.repeat_until : null, reminder_min: Number(f.reminder_min) });
    app.toast(isNew ? T('Acara disimpan') : T('Acara diperbarui'));
    onClose(true);
  };
  const del = async () => {
    if (!(await app.confirm(initial.repeat && initial.repeat !== 'none' ? T('Hapus “{t}” beserta semua pengulangannya?', { t: initial.title }) : T('Hapus “{t}”?', { t: initial.title }), { danger: true, ok: T("Hapus") }))) return;
    await DB.remove('events', initial.id);
    onClose(true);
  };

  return (
    <Modal title={isNew ? T("Acara / pengingat baru") : T("Edit acara")} onClose={() => onClose(false)} width={600}
      footer={<>
        {!isNew && <button className="btn danger" onClick={del} style={{ marginRight: 'auto' }}><Icon name="trash" size="sm" />{T("Hapus")}</button>}
        <button className="btn" onClick={() => onClose(false)}>{T("Batal")}</button>
        <button className="btn pri" onClick={save}>{T("Simpan")}</button>
      </>}>
      <input className="field" aria-label={T("Judul")} placeholder={T("Judul, mis. Bimbingan TA")} value={f.title} onChange={set('title')} onKeyDown={(e) => e.key === 'Enter' && save()} style={{ fontSize: 18, fontWeight: 700 }} />
      <div className="row"><Switch on={f.all_day} onChange={set('all_day')} label={T("Seharian")} /><span style={{ fontWeight: 600 }}>{T("Seharian")}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: f.all_day ? '1fr 1fr' : '1.3fr 1fr 1.3fr 1fr', gap: 10 }}>
        <Field label={T("Mulai")}><input type="date" className="field" value={f.date} onChange={(e) => { const d = e.target.value; setF({ ...f, date: d, endDate: f.endDate < d ? d : f.endDate }); }} /></Field>
        {!f.all_day && <Field label={T("Jam")}><input type="time" className="field" value={f.time} onChange={(e) => { const t = e.target.value; const [h, m] = t.split(':').map(Number); const et = `${pad(Math.min(23, h + 1))}:${pad(m)}`; setF({ ...f, time: t, endTime: f.endDate === f.date && f.endTime <= t ? et : f.endTime }); }} /></Field>}
        <Field label={T("Selesai")}><input type="date" className="field" value={f.endDate} min={f.date} onChange={set('endDate')} /></Field>
        {!f.all_day && <Field label={T("Jam")}><input type="time" className="field" value={f.endTime} onChange={set('endTime')} /></Field>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={T("Pengingat (notifikasi Windows)")}>
          <select className="field" value={f.reminder_min} onChange={set('reminder_min')}>{REMINDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label={T("Kalender")}>
          <select className="field" value={f.calendar_id} onChange={set('calendar_id')}>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label={T("Berulang")}>
          <select className="field" value={f.repeat} onChange={set('repeat')}>{Object.entries(REPEAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        {f.repeat !== 'none' && <Field label={T("Berakhir pada (opsional)")}><input type="date" className="field" value={f.repeat_until} min={f.date} onChange={set('repeat_until')} /></Field>}
      </div>
      <Field label={T("Lokasi")}><input className="field" value={f.location} onChange={set('location')} placeholder="opsional" /></Field>
      <Field label={T("Deskripsi")}><textarea className="field" rows={3} value={f.description} onChange={set('description')} placeholder={T("Catatan untuk acara ini")} /></Field>
      {f.repeat !== 'none' && !isNew && <span className="mut" style={{ fontSize: 12 }}>{T("Perubahan berlaku untuk semua pengulangan acara ini.")}</span>}
    </Modal>
  );
}

// "Bulan" view: months stacked vertically and scrollable. The title follows the month at the top.
const SCROLL_VIEW = 'monthScroll';
const SPAN = 25; // months rendered at once, centred on the month being viewed
const isMonthView = (t) => t === 'dayGridMonth' || t === SCROLL_VIEW;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const shiftMonth = (key, n) => monthKey(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1));
const monthTitle = (key) => `${MONTH_ID[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
const rangeStartFor = (key) => shiftMonth(key, -Math.floor(SPAN / 2)) + '-01';

export default function Calendar() {
  const app = useApp();
  const now = useNow(30000);
  const calRef = useRef();
  const wrapRef = useRef();
  const [view, setView] = useState(() => (!app.settings.calView || app.settings.calView === 'dayGridMonth' ? SCROLL_VIEW : app.settings.calView));
  const focusMonth = useRef(monthKey(parseLocal(app.params.date || toLocalDate(new Date()))));
  const scrollTarget = useRef(focusMonth.current); // month to bring into view after the next render
  const [range, setRange] = useState(null);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState(() => app.params.date || toLocalDate(new Date()));
  const [modal, setModal] = useState(null);
  const [calModal, setCalModal] = useState(null);

  const cals = useQuery(() => DB.list('calendars', { order: 'sort' }), [], ['calendars']);
  const events = useQuery(() => DB.list('events'), [], ['events']);
  const tasks = useQuery(() => DB.list('tasks', { where: { due_date: { ne: null } } }), [], ['tasks']);
  const hol = useQuery(() => api('holidays').then((r) => r.items).catch(() => []), []);
  const dayNote = useQuery(() => DB.get('day_notes', sel), [sel], ['day_notes']);
  const [noteText, setNoteText] = useState('');
  useEffect(() => { setNoteText(dayNote.data?.text || ''); }, [dayNote.data, sel]);
  const saveNote = useDebounced((date, text) => (text.trim() ? DB.save('day_notes', { id: date, text }) : DB.remove('day_notes', date)), 500);

  // navigation from other pages / notifications
  useEffect(() => {
    if (app.params.date) { setSel(app.params.date); if (view === SCROLL_VIEW) goMonth(monthKey(parseLocal(app.params.date)), false); else calRef.current?.getApi().gotoDate(app.params.date); }
    if (app.params.newEvent) openNew(app.params.date || sel);
    if (app.params.eventId && events.data) { const ev = events.data.find((e) => e.id === app.params.eventId); if (ev) setModal(ev); }
  }, [app.params._t, events.data == null]); // eslint-disable-line react-hooks/exhaustive-deps

  const calMap = useMemo(() => Object.fromEntries((cals.data || []).map((c) => [c.id, c])), [cals.data]);
  const holByDate = useMemo(() => {
    const m = {};
    for (const h of hol.data || []) { let d = parseLocal(h.start); const e = parseLocal(h.end); while (d <= e) { const k = toLocalDate(d); (m[k] ||= []).push(h); d = addDays(d, 1); } }
    return m;
  }, [hol.data]);

  const fcEvents = useMemo(() => {
    if (!range) return [];
    const visible = (events.data || []).filter((e) => (calMap[e.calendar_id]?.visible ?? 1) !== 0);
    const occ = expandAll(visible, range.start, range.end).map((o) => {
      const c = calMap[o.calendar_id]?.color || 'c1';
      return {
        id: o.key, title: o.title, start: o.occStart, end: o.occEnd, allDay: !!o.all_day,
        classNames: ['ev-k', `k-${c}`], editable: !o.repeat || o.repeat === 'none',
        extendedProps: { type: 'event', row: o }
      };
    });
    const hs = (hol.data || []).filter((h) => app.settings.showHolidays !== false && (!h.observance || app.settings.showObservances)).map((h) => ({
      id: h.id, title: h.title, start: h.start, end: toLocalDate(addDays(parseLocal(h.end), 1)), allDay: true, classNames: [h.observance ? 'ev-obs' : 'ev-hol'], editable: false, extendedProps: { type: 'holiday', row: h }
    }));
    const ts = (tasks.data || []).filter(() => app.settings.showTasksInCalendar !== false).map((t) => ({
      id: 'task-' + t.id, title: (t.done ? '✓ ' : '☐ ') + t.title, start: t.due_time ? `${t.due_date}T${t.due_time}` : t.due_date, allDay: !t.due_time, classNames: ['ev-task'], editable: false, extendedProps: { type: 'task', row: t }
    }));
    return [...hs, ...occ, ...ts];
  }, [range, events.data, calMap, hol.data, tasks.data, app.settings.showHolidays, app.settings.showObservances, app.settings.showTasksInCalendar]);

  const selDate = parseLocal(sel);
  const dayEvents = useMemo(() => {
    const s = parseLocal(sel);
    return expandAll(events.data || [], s, addDays(s, 1)).map((o) => ({ ...o, color: calMap[o.calendar_id]?.color || 'c1' }));
  }, [sel, events.data, calMap]);
  const dayTasks = (tasks.data || []).filter((t) => t.due_date === sel);

  function openNew(date, time, endTime, allDay) {
    const d = date || sel;
    const h = new Date().getHours() + 1;
    const st = time || `${pad(Math.min(h, 23))}:00`;
    const et = endTime || `${pad(Math.min(Number(st.slice(0, 2)) + 1, 23))}:${st.slice(3, 5)}`;
    setModal({ start: allDay ? d : `${d}T${st}`, end: allDay ? d : `${d}T${et}`, all_day: allDay ? 1 : 0, calendar_id: cals.data?.[0]?.id });
  }

  const apiCal = () => calRef.current?.getApi();
  const scroller = () => wrapRef.current?.querySelector('.fc-multimonth');
  const scrollToMonth = (key, smooth) => {
    const sc = scroller();
    const el = sc?.querySelector(`.fc-multimonth-month[data-date^="${key}"]`);
    if (!el) return false;
    sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top, behavior: smooth ? 'smooth' : 'auto' });
    return true;
  };
  // bring a month into view; re-centre the rendered range when it is outside it
  const scrollLock = useRef(0); // ignore scroll events caused by our own (smooth) scrolling
  const goMonth = (key, smooth = true) => {
    focusMonth.current = key;
    scrollLock.current = Date.now() + 700;
    setTitle(monthTitle(key));
    if (!scrollToMonth(key, smooth)) { scrollTarget.current = key; apiCal()?.gotoDate(rangeStartFor(key)); }
  };
  const isScroll = view === SCROLL_VIEW;
  const goToday = () => { const t = toLocalDate(new Date()); setSel(t); if (isScroll) goMonth(monthKey(new Date())); else apiCal().today(); };
  const goPrev = () => (isScroll ? goMonth(shiftMonth(focusMonth.current, -1)) : apiCal().prev());
  const goNext = () => (isScroll ? goMonth(shiftMonth(focusMonth.current, 1)) : apiCal().next());
  const changeView = (v) => {
    setView(v);
    app.setSetting('calView', v);
    if (v === SCROLL_VIEW) { scrollTarget.current = monthKey(parseLocal(sel)); apiCal()?.changeView(v, rangeStartFor(scrollTarget.current)); }
    else apiCal()?.changeView(v, sel);
  };

  // title follows the month at the top while scrolling; extend the range at either end
  const onScroll = useRef(null);
  onScroll.current = () => {
    const sc = scroller();
    if (!sc || Date.now() < scrollLock.current) return;
    const months = [...sc.querySelectorAll('.fc-multimonth-month')];
    const top = sc.getBoundingClientRect().top + 80;
    const idx = Math.max(0, months.findIndex((m) => m.getBoundingClientRect().bottom > top));
    const key = months[idx]?.getAttribute('data-date')?.slice(0, 7);
    if (!key) return;
    if (key !== focusMonth.current) { focusMonth.current = key; setTitle(monthTitle(key)); }
    const atStart = idx === 0 && sc.scrollTop < 40;
    const atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 40;
    if (atStart || atEnd) { scrollTarget.current = key; apiCal()?.gotoDate(rangeStartFor(key)); }
  };
  useEffect(() => {
    if (!isScroll || !range) return undefined;
    const sc = scroller();
    if (!sc) return undefined;
    let raf = 0;
    const h = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => onScroll.current()); };
    sc.addEventListener('scroll', h, { passive: true });
    return () => { sc.removeEventListener('scroll', h); cancelAnimationFrame(raf); };
  }, [isScroll, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const [quick, setQuick] = useState({ title: '', time: '09:00', rem: app.settings.reminderDefault ?? 30 });
  const addQuick = async () => {
    if (!quick.title.trim()) return;
    const [h, m] = quick.time.split(':').map(Number);
    await DB.save('events', { title: quick.title.trim(), start: `${sel}T${quick.time}`, end: `${sel}T${pad(Math.min(23, h + 1))}:${pad(m)}`, all_day: 0, calendar_id: cals.data?.[0]?.id, repeat: 'none', reminder_min: Number(quick.rem) });
    setQuick({ ...quick, title: '' });
    app.toast(T("Pengingat dibuat"));
  };

  const onDrop = async (info) => {
    const row = info.event.extendedProps.row;
    if (info.event.extendedProps.type !== 'event') { info.revert(); return; }
    const s = info.event.start; const e = info.event.end || new Date(s.getTime() + 3600000);
    const allDay = info.event.allDay;
    await DB.save('events', { id: row.id, start: allDay ? toLocalDate(s) : toLocalDateTime(s), end: allDay ? toLocalDate(addDays(e, -1)) : toLocalDateTime(e), all_day: allDay ? 1 : 0 });
  };

  const isToday = sel === toLocalDate(now);

  return (
    <div className="page full" style={{ paddingBottom: 24 }}>
      <div className="cal-layout">
        <section className="card cal-main">
          <div className="row wrap">
            <button className="btn pri" onClick={() => openNew()}><Icon name="plus" size="sm" />{T("Buat")}</button>
            <button className="btn" onClick={goToday}>{T("Hari ini")}</button>
            <button className="icb" aria-label={T("Sebelumnya")} title={isScroll ? T("Bulan sebelumnya") : T("Sebelumnya")} onClick={goPrev}><Icon name="left" /></button>
            <button className="icb" aria-label={T("Berikutnya")} title={isScroll ? T("Bulan berikutnya") : T("Berikutnya")} onClick={goNext}><Icon name="right" /></button>
            <span className="grow ellipsis" title={title} style={{ fontSize: 20, fontWeight: 800, textTransform: 'capitalize', minWidth: 120 }}>{title}</span>
            <Seg label={T("Tampilan")} value={view} onChange={changeView} options={[{ value: 'timeGridDay', label: T("Hari") }, { value: 'timeGridWeek', label: T("Minggu") }, { value: SCROLL_VIEW, label: T("Bulan") }, { value: 'listMonth', label: T("Agenda") }]} />
          </div>
          <div ref={wrapRef} className="cal-wrap">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multiMonthPlugin]}
            views={{ [SCROLL_VIEW]: { type: 'multiMonth', duration: { months: SPAN }, multiMonthMaxColumns: 1, multiMonthTitleFormat: { month: 'long', year: 'numeric' }, fixedWeekCount: false, showNonCurrentDates: false } }}
            initialView={view}
            initialDate={view === SCROLL_VIEW ? rangeStartFor(focusMonth.current) : app.params.date || undefined}
            locale={lang() === 'en' ? 'en-gb' : idLocale}
            firstDay={1}
            headerToolbar={false}
            height="100%"
            now={now}
            nowIndicator
            dayMaxEvents
            selectable
            selectMirror
            editable
            eventDurationEditable
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            scrollTime={`${pad(Math.max(0, now.getHours() - 1))}:00:00`}
            events={fcEvents}
            datesSet={(i) => {
              setRange({ start: i.start, end: i.end });
              if (i.view.type === SCROLL_VIEW) {
                const key = scrollTarget.current || focusMonth.current;
                scrollTarget.current = null;
                setTitle(monthTitle(key));
                focusMonth.current = key;
                requestAnimationFrame(() => scrollToMonth(key, false));
              } else setTitle(i.view.title);
              if (i.view.type === 'timeGridDay') setSel(toLocalDate(i.start));
            }}
            dayCellClassNames={(arg) => { const k = toLocalDate(arg.date); const c = []; if (k === sel) c.push('sel'); if (holByDate[k]?.some((h) => !h.observance)) c.push('holiday'); return c; }}
            dateClick={(i) => { const d = toLocalDate(i.date); if (d === sel && i.allDay && isMonthView(i.view.type)) openNew(d, null, null, false); setSel(d); }}
            select={(i) => { if (isMonthView(i.view.type)) { const days = Math.round((i.end - i.start) / 86400000); if (days > 1) setModal({ start: toLocalDate(i.start), end: toLocalDate(addDays(i.end, -1)), all_day: 1, calendar_id: cals.data?.[0]?.id }); return; } if (i.allDay) return; openNew(toLocalDate(i.start), toLocalDateTime(i.start).slice(11), toLocalDateTime(i.end).slice(11)); }}
            eventClick={(i) => {
              const { type, row } = i.event.extendedProps;
              if (type === 'event') setModal(events.data.find((e) => e.id === row.id));
              else if (type === 'task') app.nav('focus', { taskId: row.id });
              else setSel(row.start);
            }}
            eventDrop={onDrop}
            eventResize={onDrop}
          />
          </div>
        </section>

        <aside className="card cal-side">
          <div className="col" style={{ gap: 2 }}>
            <span className="lbl">{isToday ? T("Hari ini") : T("Tanggal dipilih")}</span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtDateLong(selDate)}</span>
            {(holByDate[sel] || []).map((h) => <span key={h.id} className={h.observance ? 'mut' : 'dn'} style={{ fontWeight: 700, fontSize: 13 }}>{h.observance ? T("Perayaan") : T("Libur nasional")} · {h.title}{h.tentative ? T(" (tentatif)") : ''}</span>)}
          </div>
          <Field label={T("Deskripsi hari")}>
            <textarea className="field" rows={3} value={noteText} placeholder={T("Tulis catatan untuk tanggal ini…")} onChange={(e) => { setNoteText(e.target.value); saveNote(sel, e.target.value); }} />
          </Field>
          <div className="col" style={{ gap: 8 }}>
            <div className="row"><span className="grow" style={{ fontWeight: 700, fontSize: 13 }}>{T("Acara & pengingat")}</span><button className="btn sm" onClick={() => openNew(sel)}><Icon name="plus" size="sm" />{T("Acara")}</button></div>
            {dayEvents.length === 0 && dayTasks.length === 0 && <span className="mut" style={{ fontSize: 13 }}>{T("Belum ada acara di tanggal ini.")}</span>}
            {dayEvents.map((o) => (
              <button key={o.key} className="mini-ev" onClick={() => setModal(events.data.find((e) => e.id === o.id))}>
                <span className={`dot k-${o.color}`} />
                <span className="col grow" style={{ gap: 0 }}>
                  <span style={{ fontWeight: 700 }} className="ellipsis">{o.title}</span>
                  <span className="mut" style={{ fontSize: 12 }}>{o.all_day ? T("Seharian") : `${fmtTime(o.occStart)}–${fmtTime(o.occEnd)}`}{o.repeat && o.repeat !== 'none' ? ' · ' + REPEAT_LABEL[o.repeat].toLowerCase() : ''}</span>
                </span>
                {o.reminder_min >= 0 && <span className="chip" title={remLabel(o.reminder_min)}><Icon name="bell" size="sm" />{o.reminder_min >= 1440 ? T('{n} hr', { n: o.reminder_min / 1440 }) : o.reminder_min >= 60 ? T('{n} j', { n: o.reminder_min / 60 }) : `${o.reminder_min} m`}</span>}
              </button>
            ))}
            {dayTasks.map((t) => (
              <button key={t.id} className="mini-ev" onClick={() => app.nav('focus', { taskId: t.id })}>
                <Icon name={t.done ? 'check' : 'checklist'} size="sm" />
                <span className="col grow" style={{ gap: 0 }}><span style={{ fontWeight: 700, textDecoration: t.done ? 'line-through' : 'none' }} className="ellipsis">{t.title}</span><span className="mut" style={{ fontSize: 12 }}>{T("Tugas")}{t.due_time ? ' · ' + t.due_time.replace(':', '.') : ''}</span></span>
              </button>
            ))}
          </div>
          <div className="col" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{T("Tambah pengingat cepat")}</span>
            <label className="sr" htmlFor="q-title">{T("Judul pengingat")}</label>
            <input id="q-title" className="field" placeholder={T("mis. Bayar UKT")} value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addQuick()} />
            <div className="row">
              <label className="sr" htmlFor="q-time">{T("Jam")}</label>
              <input id="q-time" type="time" className="field" value={quick.time} onChange={(e) => setQuick({ ...quick, time: e.target.value })} style={{ width: 118, flex: 'none' }} />
              <label className="sr" htmlFor="q-rem">{T("Pengingat")}</label>
              <select id="q-rem" className="field grow" value={quick.rem} onChange={(e) => setQuick({ ...quick, rem: e.target.value })}>{REMINDERS.slice(1, 8).map(([v, l]) => <option key={v} value={v}>{v === 0 ? T("Saat mulai") : v < 60 ? T('{n} mnt sblm', { n: v }) : T('{n} jam sblm', { n: v / 60 })}</option>)}</select>
            </div>
            <button className="btn pri" onClick={addQuick}><Icon name="bell" size="sm" />{T("Simpan pengingat")}</button>
            <span className="mut" style={{ fontSize: 12 }}>{T(
              "Notifikasi Windows muncul sesuai pengingat. Jika laptop mati/tidur saat jadwal, pengingat muncul begitu laptop menyala."
            )}</span>
          </div>
          <div className="col" style={{ gap: 6, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="row"><span className="grow" style={{ fontWeight: 700, fontSize: 13 }}>{T("Kalender")}</span><button className="icb sm" aria-label={T("Tambah kalender")} onClick={() => setCalModal({ name: '', color: 'c2', visible: 1, sort: (cals.data || []).length })}><Icon name="plus" size="sm" /></button></div>
            {(cals.data || []).map((c) => (
              <div key={c.id} className="row" style={{ fontSize: 13 }}>
                <button className={`chk ${c.visible !== 0 ? 'on' : ''} k-${c.color}`} style={c.visible !== 0 ? { background: 'var(--k)', borderColor: 'var(--k)' } : { borderColor: 'var(--k)' }} aria-label={T('Tampilkan {t}', { t: c.name })} onClick={() => DB.save('calendars', { id: c.id, visible: c.visible === 0 ? 1 : 0 })}><Icon name="check" size="sm" /></button>
                <span className="grow">{c.name}</span>
                <button className="icb sm" aria-label={`Edit ${c.name}`} onClick={() => setCalModal(c)}><Icon name="edit" size="sm" /></button>
              </div>
            ))}
            <div className="row" style={{ fontSize: 13 }}>
              <button className={`chk ${app.settings.showHolidays !== false ? 'on' : ''}`} style={app.settings.showHolidays !== false ? { background: 'var(--neg)', borderColor: 'var(--neg)' } : undefined} aria-label={T("Tampilkan libur nasional")} onClick={() => app.setSetting('showHolidays', app.settings.showHolidays === false)}><Icon name="check" size="sm" /></button>
              <span className="grow">{T("Libur nasional Indonesia")}</span>
            </div>
            <div className="row" style={{ fontSize: 13 }}>
              <button className={`chk ${app.settings.showTasksInCalendar !== false ? 'on' : ''}`} aria-label={T("Tampilkan tugas")} onClick={() => app.setSetting('showTasksInCalendar', app.settings.showTasksInCalendar === false)}><Icon name="check" size="sm" /></button>
              <span className="grow">{T("Tenggat tugas")}</span>
            </div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={async () => { const n = await api('import:ics', cals.data?.[0]?.id); if (n != null) app.toast(T('{n} acara diimpor', { n })); }}><Icon name="upload" size="sm" />{T("Impor .ics")}</button>
              <button className="btn sm" onClick={async () => { const p = await api('export:ics'); if (p) app.toast(T("Kalender diekspor")); }}><Icon name="download" size="sm" />{T("Ekspor .ics")}</button>
            </div>
          </div>
        </aside>
      </div>

      {modal && <EventModal initial={modal} calendars={cals.data || []} defaultReminder={app.settings.reminderDefault ?? 30} onClose={() => setModal(null)} />}
      {calModal && (
        <Modal title={calModal.id ? T("Edit kalender") : T("Kalender baru")} width={420} onClose={() => setCalModal(null)} footer={<>
          {calModal.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { const n = (events.data || []).filter((e) => e.calendar_id === calModal.id).length; if (!(await app.confirm(n ? T('Hapus kalender “{t}” dan {n} acaranya?', { t: calModal.name, n }) : T('Hapus kalender “{t}”?', { t: calModal.name }), { danger: true, ok: T("Hapus") }))) return; await DB.removeWhere('events', { calendar_id: calModal.id }); await DB.remove('calendars', calModal.id); setCalModal(null); }}>{T("Hapus")}</button>}
          <button className="btn" onClick={() => setCalModal(null)}>{T("Batal")}</button>
          <button className="btn pri" onClick={async () => { if (!calModal.name.trim()) return; await DB.save('calendars', calModal); setCalModal(null); }}>{T("Simpan")}</button>
        </>}>
          <Field label={T("Nama")}><input className="field" value={calModal.name} onChange={(e) => setCalModal({ ...calModal, name: e.target.value })} /></Field>
          <Field label={T("Warna")}><ColorPick value={calModal.color} onChange={(c) => setCalModal({ ...calModal, color: c })} /></Field>
        </Modal>
      )}
      <span className="sr">{MONTH_ID[selDate.getMonth()]}</span>
    </div>
  );
}
