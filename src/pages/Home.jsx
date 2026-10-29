import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Sparkline, WeatherIcon, Spinner } from '../components/ui.jsx';
import { api, DB, on, useApp, useNow, useQuery } from '../lib/api.js';
import { rupiah, num, pct, timeAgo, greeting } from '../lib/format.js';
import { wmo } from '../../shared/weather.js';
import { expandAll, toLocalDate, fmtTime, DOW_ID, addDays, parseQuickTask, parseLocal } from '../../shared/recur.js';
import { T } from '../lib/i18n.js';
import { openMenu } from '../components/ContextMenu.jsx';
import { taskItems, newsItems, noteItems } from '../lib/menus.js';

function useWeather() {
  const [w, setW] = useState({ data: null, loading: true, error: null });
  const load = (force) => {
    setW((s) => ({ ...s, loading: true }));
    api('weather', force).then((data) => setW({ data, loading: false, error: null }), (e) => setW((s) => ({ ...s, loading: false, error: e.message })));
  };
  useEffect(() => {
    load(false);
    const t = setInterval(() => load(false), 15 * 60000);
    const off = on('power:resume', () => load(true));
    const off2 = on('db:changed', (t2) => { if (t2.includes('settings')) load(false); });
    return () => { clearInterval(t); off(); off2(); };
  }, []);
  return { ...w, reload: () => load(true) };
}

export const tickerLabel = (w) => (/[\^=-]/.test(w.symbol) ? w.name : w.symbol.replace('.JK', ''));

export function WeatherCard({ compact = false }) {
  const w = useWeather();
  const d = w.data;
  return (
    <section data-tour="weather" className="card pad col" style={{ gap: 14, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
      <div className="row" style={{ color: 'var(--accent-text)', fontWeight: 700, fontSize: 13, gap: 6 }}>
        <Icon name="pin" size="sm" />
        <span className="grow ellipsis">{d?.location?.name || T("Lokasi")}{d?.location?.approx ? T(" (perkiraan)") : ''}</span>
        <button className="icb sm" aria-label={T("Perbarui cuaca")} onClick={w.reload} style={{ color: 'var(--accent-text)' }}>{w.loading ? <Spinner /> : <Icon name="refresh" size="sm" />}</button>
      </div>
      {!d && w.error && <span style={{ color: 'var(--accent-text)' }}>{T("Cuaca tidak bisa dimuat (offline?).")}</span>}
      {!d && !w.error && <div className="skeleton" style={{ height: 90 }} />}
      {d && (
        <>
          <div className="row" style={{ gap: 16, color: 'var(--accent-text)' }}>
            <WeatherIcon code={d.current.code} style={{ width: 56, height: 56, strokeWidth: 1.4 }} />
            <div className="col" style={{ gap: 2 }}>
              <span className="num" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: 'var(--text)' }}>{Math.round(d.current.temp)}°</span>
              <span style={{ fontWeight: 700 }}>{wmo(d.current.code)[0]}</span>
            </div>
            <div className="col grow" style={{ alignItems: 'flex-end', gap: 4, fontSize: 13, fontWeight: 600 }}>
              <span className="row" style={{ gap: 4 }}><Icon name="drop" size="sm" />{d.current.humidity}%</span>
              <span className="row" style={{ gap: 4 }}><Icon name="wind" size="sm" />{Math.round(d.current.wind)} {T("km/j")}</span>
              <span>{T("Terasa")} {Math.round(d.current.feels)}°</span>
            </div>
          </div>
          {!compact && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 6, textAlign: 'center' }}>
              {d.hourly.slice(0, 6).map((h) => (
                <div key={h.time} className="col" style={{ gap: 2, padding: '8px 0', borderRadius: 10, background: 'var(--surface)', alignItems: 'center' }}>
                  <span className="mut" style={{ fontSize: 12 }}>{h.time.slice(11, 13)}.00</span>
                  <WeatherIcon code={h.code} size="sm" />
                  <span className="num" style={{ fontWeight: 700 }}>{Math.round(h.temp)}°</span>
                  <span className="mut" style={{ fontSize: 11 }}>{h.pop != null ? `${h.pop}%` : ''}</span>
                </div>
              ))}
            </div>
          )}
          {!compact && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 4 }}>
              {d.daily.slice(1, 7).map((x) => (
                <div key={x.date} className="col" style={{ gap: 2, alignItems: 'center', fontSize: 11.5, color: 'var(--accent-text)' }}>
                  <span style={{ fontWeight: 700 }}>{DOW_ID[parseLocal(x.date).getDay()].slice(0, 3)}</span>
                  <WeatherIcon code={x.code} size="sm" />
                  <span className="num">{Math.round(x.max)}°<span style={{ opacity: .7 }}>/{Math.round(x.min)}°</span></span>
                </div>
              ))}
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--accent-text)' }}>{T("Open-Meteo · diperbarui")} {timeAgo(d.fetchedAt)}{d.stale ? T(" · data lama (offline)") : ''}</span>
        </>
      )}
    </section>
  );
}

export default function Home() {
  const app = useApp();
  const now = useNow(60000);
  const today = toLocalDate(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const agenda = useQuery(async () => {
    const [evs, cals] = await Promise.all([DB.list('events'), DB.list('calendars')]);
    const color = Object.fromEntries(cals.map((c) => [c.id, c.color]));
    let hol = [];
    try { hol = (await api('holidays')).items; } catch { /* offline */ }
    const end = addDays(start, 7);
    const occ = expandAll(evs, start, end).map((o) => ({ ...o, color: color[o.calendar_id] || 'c1' }));
    const h = expandAll(hol.filter((x) => !x.observance).map((x) => ({ ...x, all_day: 1 })), start, end).map((o) => ({ ...o, holiday: true, color: 'c4' }));
    return [...occ, ...h].sort((a, b) => a.occStart - b.occStart).slice(0, 7);
  }, [today], ['events', 'calendars']);

  const tasks = useQuery(() => DB.list('tasks', { where: { done: { ne: 1 } }, order: 'due_date,due_time,priority desc' }), [], ['tasks']);
  const fin = useQuery(async () => {
    const [b, rec] = await Promise.all([api('fin:budgets', now.getFullYear(), now.getMonth() + 1), api('fin:recap', now.getFullYear())]);
    return { budgets: b, month: rec.months[now.getMonth()] };
  }, [today], ['fin_tx', 'fin_budgets', 'fin_categories']);
  const habits = useQuery(async () => {
    const [hs, logs] = await Promise.all([DB.list('habits', { where: { archived: { ne: 1 } }, order: 'sort' }), DB.list('habit_logs', { where: { date: today } })]);
    return hs.map((x) => ({ ...x, done: logs.some((l) => l.habit_id === x.id) }));
  }, [today], ['habits', 'habit_logs']);
  const recentNotes = useQuery(() => DB.list('notes', { order: 'pinned desc,updated_at desc', limit: 4 }), [], ['notes']);
  const brief = useQuery(() => api('brief'), [today], ['events', 'tasks', 'fin_tx']);

  const [quotes, setQuotes] = useState(null);
  const [news, setNews] = useState(null);
  useEffect(() => {
    let alive = true;
    const loadQ = () => DB.list('watchlist', { order: 'sort', limit: 5 }).then((w) => api('market:quotes', w.map((x) => x.symbol)).then((q) => q.map((x, i) => ({ ...x, label: tickerLabel(w[i]) })))).then((q) => alive && setQuotes(q)).catch(() => {});
    const loadN = () => Promise.allSettled([api('news:list', 'fin'), api('news:list', 'id')]).then(([a, b]) => alive && setNews([...(a.value?.items || []).slice(0, 3), ...(b.value?.items || []).slice(0, 2)]));
    loadQ(); loadN();
    const t = setInterval(loadQ, 120000);
    const t2 = setInterval(loadN, 15 * 60000);
    return () => { alive = false; clearInterval(t); clearInterval(t2); };
  }, []);

  const [quick, setQuick] = useState('');
  const addTask = async () => {
    if (!quick.trim()) return;
    const p = parseQuickTask(quick);
    await DB.save('tasks', { ...p, done: 0, reminder_min: p.due_time ? 0 : -1, sort: Date.now() });
    setQuick('');
    app.toast(T('Tugas ditambahkan') + (p.due_date ? ` · ${p.due_date}${p.due_time ? ' ' + p.due_time : ''}` : ''));
  };

  const todayTasks = (tasks.data || []).filter((t) => !t.due_date || t.due_date <= today).slice(0, 6);
  const overdue = (tasks.data || []).filter((t) => t.due_date && t.due_date < today).length;
  const todayEvents = (agenda.data || []).filter((o) => toLocalDate(o.occStart) === today && !o.holiday).length;
  const b = brief.data;
  const totalBudget = (fin.data?.budgets || []).reduce((s, x) => s + (x.budget || 0), 0);
  const spent = (fin.data?.budgets || []).filter((x) => x.budget > 0).reduce((s, x) => s + (x.spent || 0), 0);
  const usedPct = totalBudget ? Math.round((spent / totalBudget) * 100) : 0;

  return (
    <div className="page">
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div className="col grow" style={{ gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{greeting(now)}{T(", Dani")}</h1>
          <span className="mut">{T('{n} agenda hari ini', { n: todayEvents })} · {T('{n} tugas', { n: todayTasks.length })}{overdue ? ' ' + T('({n} terlambat)', { n: overdue }) : ''} · {T('{n} kebiasaan belum dicentang', { n: habits.data ? habits.data.filter((h) => !h.done).length : 0 })}</span>
        </div>
        <button className="btn" onClick={() => app.nav('notes', { newNote: Date.now() })}><Icon name="plus" size="sm" />{T("Catatan|add")}</button>
        <button className="btn" onClick={() => app.nav('fin', { newTx: Date.now() })}><Icon name="plus" size="sm" />{T("Transaksi|add")}</button>
        <button className="btn pri" onClick={() => app.nav('cal', { newEvent: Date.now() })}><Icon name="bell" size="sm" />{T("Pengingat baru")}</button>
      </div>

      <div className="grid-auto">
        <WeatherCard />

        <section className="card pad col" style={{ gap: 12 }}>
          <div className="row"><h2 className="h2 grow">{T("Agenda 7 hari")}</h2><button className="btn sm" onClick={() => app.nav('cal')}>{T("Kalender")}</button></div>
          {agenda.data?.length === 0 && <div className="empty">{T("Belum ada agenda minggu ini.")}</div>}
          {(agenda.data || []).map((o) => (
            <button key={o.key} className="row" onClick={() => app.nav('cal', { date: toLocalDate(o.occStart) })} onContextMenu={(e) => openMenu(e, [
              { label: T('Buka di kalender'), icon: 'cal', run: () => app.nav('cal', { date: toLocalDate(o.occStart) }) },
              !o.holiday && { label: T('Edit acara…'), icon: 'edit', run: () => app.nav('cal', { date: toLocalDate(o.occStart), eventId: o.id }) }
            ])} style={{ gap: 12, alignItems: 'flex-start', border: 0, background: 'transparent', textAlign: 'left', padding: 0, color: 'var(--text)' }}>
              <div className="col" style={{ width: 50, flex: 'none', alignItems: 'center', padding: '5px 0', borderRadius: 10, background: toLocalDate(o.occStart) === today ? 'var(--accent)' : 'var(--surface2)', color: toLocalDate(o.occStart) === today ? 'var(--on-accent)' : 'var(--text)', gap: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{DOW_ID[o.occStart.getDay()].slice(0, 3).toUpperCase()}</span>
                <span className="num" style={{ fontSize: 17, fontWeight: 800 }}>{o.occStart.getDate()}</span>
              </div>
              <div className="col grow" style={{ gap: 2 }}>
                <span className="row" style={{ gap: 6, fontWeight: 700 }}><span className={`dot k-${o.color}`} /> <span className="ellipsis">{o.title}</span></span>
                <span className="mut" style={{ fontSize: 13 }}>{o.all_day ? T("Seharian") : `${fmtTime(o.occStart)}–${fmtTime(o.occEnd)}`}{o.holiday ? T(" · libur nasional") : ''}{o.reminder_min >= 0 ? ' · ' + T('pengingat {n} mnt', { n: o.reminder_min }) : ''}</span>
              </div>
            </button>
          ))}
        </section>

        <section className="card pad col" style={{ gap: 10 }}>
          <div className="row"><h2 className="h2 grow">{T("Ringkasan hari ini")}</h2><Icon name="bolt" size="sm" /></div>
          {!b ? <div className="skeleton" style={{ height: 100 }} /> : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>{b.events.length ? T('{n} agenda, pertama {t}', { n: b.events.length, t: `${b.events[0].time} ${b.events[0].title}` }) : T("Tidak ada agenda hari ini")}</li>
              <li>{T('{n} tugas jatuh tempo', { n: b.tasksToday })}{b.overdue ? ', ' + T('{n} terlambat', { n: b.overdue }) : ''}</li>
              {b.weather && <li>{T("Cuaca")} {b.weather.temp}° {b.weather.text.toLowerCase()}{b.weather.popMax != null ? ', ' + T('peluang hujan {n}%', { n: b.weather.popMax }) : ''}{b.weather.popMax >= 60 ? T(" — bawa payung") : ''}</li>}
              <li>{b.budget.cap ? T('Sisa anggaran bulan ini {v}', { v: rupiah(b.budget.left) }) : T("Anggaran bulan ini belum diatur")}{b.budget.over.length ? ` · ${T('lewat batas:')} ${b.budget.over.join(', ')}` : ''}</li>
            </ul>
          )}
          <div className="divider" />
          <div className="col" style={{ gap: 6 }}>
            <span className="lbl">{T("Kebiasaan hari ini")}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {(habits.data || []).map((h) => (
                <button key={h.id} className={`chip ${h.done ? 'on' : ''}`} onClick={() => (h.done ? DB.remove('habit_logs', `${h.id}|${today}`) : DB.save('habit_logs', { id: `${h.id}|${today}`, habit_id: h.id, date: today }))}>
                  {h.done && <Icon name="check" size="sm" />}{h.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card pad col" style={{ gap: 8 }}>
          <div className="row"><h2 className="h2 grow">{T("Tugas")}</h2><span className="chip">{todayTasks.length} {T("hari ini")}</span></div>
          <div className="row">
            <label className="sr" htmlFor="home-task">{T("Tugas baru")}</label>
            <input id="home-task" className="field" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder={T("mis. revisi bab 3 besok 09.00 #TA")} />
            <button className="btn pri" aria-label={T("Tambah tugas")} onClick={addTask}><Icon name="plus" size="sm" /></button>
          </div>
          {todayTasks.length === 0 && <div className="empty">{T("Tidak ada tugas untuk hari ini.")}</div>}
          {todayTasks.map((t) => (
            <div key={t.id} className="task" onContextMenu={(e) => openMenu(e, taskItems(app, t, { onEdit: (x) => app.nav('focus', { taskId: x.id }) }))}>
              <button className="chk" aria-label={T('Selesaikan {t}', { t: t.title })} onClick={() => DB.save('tasks', { id: t.id, done: 1, done_at: new Date().toISOString() })}><Icon name="check" size="sm" /></button>
              <span className="t grow ellipsis">{t.priority === 2 && <Icon name="flag" size="sm" className="prio-2" />} {t.title}</span>
              {t.due_date && <span className={`mut num ${t.due_date < today ? 'dn' : ''}`} style={{ fontSize: 12 }}>{t.due_date < today ? T("terlambat") : t.due_time ? t.due_time.replace(':', '.') : T("hari ini")}</span>}
              {t.tag && <span className="chip">#{t.tag}</span>}
            </div>
          ))}
          <button className="btn" style={{ marginTop: 'auto' }} onClick={() => { app.focus.start(); app.nav('focus'); }}><Icon name="play" size="sm" />{T('Mulai fokus {n} menit', { n: app.settings.focusMin || 25 })}</button>
        </section>

        <section className="card pad col" style={{ gap: 12 }}>
          <div className="row"><h2 className="h2 grow">{T("Keuangan bulan ini")}</h2><button className="btn sm" onClick={() => app.nav('fin')}>{T("Detail")}</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <div className="col" style={{ gap: 2 }}><span className="lbl">{T("Pemasukan")}</span><span className="num up" style={{ fontSize: 19, fontWeight: 800 }}>{rupiah(fin.data?.month?.in)}</span></div>
            <div className="col" style={{ gap: 2 }}><span className="lbl">{T("Pengeluaran")}</span><span className="num dn" style={{ fontSize: 19, fontWeight: 800 }}>{rupiah(fin.data?.month?.out)}</span></div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ fontSize: 13 }}><span className="grow" style={{ fontWeight: 600 }}>{T("Anggaran terpakai")}</span><span className="num mut">{totalBudget ? T('{n}% dari {v}', { n: usedPct, v: rupiah(totalBudget, { short: true }) }) : T("belum diatur")}</span></div>
            <div className="bar"><span className={usedPct > 100 ? 'over' : usedPct > 85 ? 'warn' : ''} style={{ width: Math.min(100, usedPct) + '%' }} /></div>
          </div>
          {(fin.data?.budgets || []).filter((x) => x.budget > 0 && x.spent > x.budget * 0.85).slice(0, 3).map((x) => (
            <div key={x.category_id} className="row" style={{ fontSize: 13 }}><Icon name="info" size="sm" className="dn" /><span className="grow">{x.name}</span><span className="num mut">{rupiah(x.spent, { short: true })} / {rupiah(x.budget, { short: true })}</span></div>
          ))}
        </section>

        <section className="card pad col" style={{ gap: 10 }}>
          <div className="row"><h2 className="h2 grow">{T("Pasar")}</h2><span className="chip">{T("tertunda ±10–15 mnt")}</span></div>
          {!quotes && <div className="skeleton" style={{ height: 140 }} />}
          {(quotes || []).map((q) => (
            <button key={q.symbol} className="row" onClick={() => app.nav('market', { symbol: q.symbol })} style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--text)', textAlign: 'left' }}>
              <div className="col" style={{ width: 96, gap: 0 }}><span style={{ fontWeight: 700 }} className="ellipsis">{q.label}</span><span className="mut ellipsis" style={{ fontSize: 12 }}>{q.symbol}</span></div>
              <div className="grow"><Sparkline data={q.spark} up={(q.change || 0) >= 0} height={30} /></div>
              <div className="col" style={{ width: 100, alignItems: 'flex-end', gap: 0 }}>
                {q.error ? <span className="mut" style={{ fontSize: 12 }}>{T("gagal")}</span> : <><span className="num" style={{ fontWeight: 700 }}>{num(q.price, q.price > 1000 ? 0 : 2)}</span><span className={`num ${q.change >= 0 ? 'up' : 'dn'}`} style={{ fontSize: 12, fontWeight: 700 }}>{pct(q.changePct)}</span></>}
              </div>
            </button>
          ))}
        </section>

        <section className="card pad col" style={{ gap: 6 }}>
          <div className="row"><h2 className="h2 grow">{T("Berita terbaru")}</h2><button className="btn sm" onClick={() => app.nav('market', { tab: 'news' })}>{T("Semua")}</button></div>
          {!news && <div className="skeleton" style={{ height: 140 }} />}
          {news?.length === 0 && <div className="empty">{T("Berita tidak bisa dimuat.")}</div>}
          {(news || []).map((n) => (
            <a key={n.id} href={n.link} onClick={(e) => { e.preventDefault(); api('shell:open', n.link); }} onContextMenu={(e) => openMenu(e, newsItems(app, n))} className="col" style={{ gap: 2, textDecoration: 'none', color: 'var(--text)', padding: '8px', margin: '0 -8px', borderRadius: 10 }}>
              <span style={{ fontWeight: 600, lineHeight: 1.4 }}>{n.title}</span>
              <span className="mut" style={{ fontSize: 12 }}>{n.source} · {timeAgo(n.date)}</span>
            </a>
          ))}
        </section>

        <section className="card pad col" style={{ gap: 6 }}>
          <div className="row"><h2 className="h2 grow">{T("Catatan terbaru")}</h2><button className="btn sm" onClick={() => app.nav('notes')}>{T("Buka")}</button></div>
          {recentNotes.data?.length === 0 && <div className="empty">{T("Belum ada catatan.")}</div>}
          {(recentNotes.data || []).map((n) => (
            <button key={n.id} className="note-item" onClick={() => app.nav('notes', { noteId: n.id })} onContextMenu={(e) => openMenu(e, noteItems(app, n, { onOpen: (x) => app.nav('notes', { noteId: x.id }) }))}>
              <span className="row" style={{ fontWeight: 700, gap: 6 }}>{n.pinned ? <Icon name="pinned" size="sm" /> : null}<span className="ellipsis">{n.title || T("Tanpa judul")}</span></span>
              <span className="mut ellipsis" style={{ fontSize: 12 }}>{(n.plain || '').slice(0, 90) || '—'}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
