import Icon from '../components/Icon.jsx';
import { WeatherIcon } from '../components/ui.jsx';
import { api, DB, useNow, useQuery } from '../lib/api.js';
import { expandAll, toLocalDate, fmtTime, fmtDateLong, pad } from '../../shared/recur.js';
import { wmo } from '../../shared/weather.js';

export default function Widget() {
  const now = useNow(1000);
  const today = toLocalDate(now);
  const evs = useQuery(async () => {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const all = expandAll(await DB.list('events'), s, new Date(s.getTime() + 2 * 86400000));
    return all.filter((o) => o.occEnd > new Date()).slice(0, 4);
  }, [today, now.getMinutes()], ['events']);
  const tasks = useQuery(() => DB.list('tasks', { where: { done: { ne: 1 } }, order: 'due_date,due_time' }), [], ['tasks']);
  const wx = useQuery(() => api('weather').catch(() => null), [Math.floor(now.getTime() / 900000)]);
  const t = (tasks.data || []).filter((x) => !x.due_date || x.due_date <= today).slice(0, 5);
  return (
    <div className="win-small" style={{ padding: 14, gap: 12, borderRadius: 0 }}>
      <div className="row drag">
        <span className="lbl grow">Dani SuperApp</span>
        <button className="icb sm nodrag" aria-label="Buka aplikasi" onClick={() => api('win:show')}><Icon name="external" size="sm" /></button>
        <button className="icb sm nodrag" aria-label="Tutup widget" onClick={() => api('win:closeSelf')}><Icon name="x" size="sm" /></button>
      </div>
      <div className="col drag" style={{ gap: 0 }}>
        <span className="num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05 }}>{pad(now.getHours())}.{pad(now.getMinutes())}<span className="mut" style={{ fontSize: 20 }}>.{pad(now.getSeconds())}</span></span>
        <span className="mut" style={{ fontSize: 13 }}>{fmtDateLong(now)}</span>
      </div>
      {wx.data && (
        <div className="row" style={{ gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
          <WeatherIcon code={wx.data.current.code} size="" />
          <strong className="num">{Math.round(wx.data.current.temp)}°</strong>
          <span className="grow ellipsis" style={{ fontSize: 13 }}>{wmo(wx.data.current.code)[0]} · {wx.data.location.name}</span>
        </div>
      )}
      <div className="col nodrag" style={{ gap: 6 }}>
        <span className="lbl">Berikutnya</span>
        {(evs.data || []).length === 0 && <span className="mut" style={{ fontSize: 13 }}>Tidak ada agenda.</span>}
        {(evs.data || []).map((o) => (
          <button key={o.key} className="mini-ev" style={{ padding: '7px 10px' }} onClick={() => api('win:show', { nav: 'cal', date: toLocalDate(o.occStart) })}>
            <span className="num mut" style={{ fontSize: 12, width: 44 }}>{toLocalDate(o.occStart) === today ? (o.all_day ? 'Hari ini' : fmtTime(o.occStart)) : 'Besok'}</span>
            <span className="ellipsis grow" style={{ fontWeight: 600, fontSize: 13 }}>{o.title}</span>
          </button>
        ))}
      </div>
      <div className="col nodrag" style={{ gap: 2, overflow: 'auto' }}>
        <span className="lbl">Tugas hari ini</span>
        {t.length === 0 && <span className="mut" style={{ fontSize: 13 }}>Semua beres.</span>}
        {t.map((x) => (
          <div key={x.id} className="task" style={{ minHeight: 34, padding: '4px 6px' }}>
            <button className="chk" aria-label={`Selesaikan ${x.title}`} onClick={() => DB.save('tasks', { id: x.id, done: 1, done_at: new Date().toISOString() })}><Icon name="check" size="sm" /></button>
            <span className="t ellipsis grow" style={{ fontSize: 13 }}>{x.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
