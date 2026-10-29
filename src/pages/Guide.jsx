import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useApp } from '../lib/api.js';
import { GUIDE, SHORTCUTS, TOUR } from '../lib/guide.js';
import { T } from '../lib/i18n.js';
import Resizer, { usePanelWidth } from '../components/Resizer.jsx';

export default function Guide() {
  const app = useApp();
  const navW = usePanelWidth('guideNav', 250, 200, 420);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const sections = useMemo(() => GUIDE.map((s) => {
    if (!query) return s;
    const hitSection = `${s.title} ${s.where} ${s.intro}`.toLowerCase().includes(query);
    const items = s.items.filter(([t, d]) => hitSection || `${t} ${d}`.toLowerCase().includes(query));
    return items.length ? { ...s, items } : null;
  }).filter(Boolean), [query]);
  const jump = (id) => document.getElementById('guide-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const tourIndex = (page) => Math.max(0, TOUR.findIndex((t) => t.page === page));

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <section className="card pad row wrap" style={{ gap: 16, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
        <div className="col grow" style={{ gap: 4, minWidth: 260 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{T("Panduan Dani SuperApp")}</h1>
          <span style={{ color: 'var(--accent-text)' }}>{T("Semua fitur, letaknya, dan cara memakainya. Buka kapan saja dengan F1.")}</span>
        </div>
        <button className="btn pri" onClick={() => app.startTour(0)}><Icon name="play" size="sm" />{T("Mulai tur singkat")}</button>
      </section>

      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <aside className="card guide-nav" style={{ width: navW.width }}>
          <label className="sr" htmlFor="guide-q">{T("Cari di panduan")}</label>
          <input id="guide-q" className="field" placeholder={T("Cari fitur, mis. pengingat")} value={q} onChange={(e) => setQ(e.target.value)} />
          <nav className="col" style={{ gap: 2 }} aria-label={T("Daftar isi panduan")}>
            {sections.map((s) => <button key={s.id} className="nav" onClick={() => jump(s.id)}><Icon name={s.icon} size="sm" /><span className="ellipsis">{s.title}</span></button>)}
            {!query && <button className="nav" onClick={() => jump('pintasan')}><Icon name="bolt" size="sm" /><span>{T("Pintasan keyboard")}</span></button>}
          </nav>
        </aside>
        <Resizer panel={navW} className="guide-resizer" label={T('Ubah lebar daftar isi')} />

        <div className="col grow" style={{ gap: 16, minWidth: 0 }}>
          {sections.length === 0 && <div className="card pad empty">{T("Tidak ada yang cocok dengan “")}{q}{T("”. Coba kata lain, misalnya “backup” atau “pena”.")}</div>}
          {sections.map((s) => (
            <section key={s.id} id={'guide-' + s.id} className="card pad col" style={{ gap: 12, scrollMarginTop: 16 }}>
              <div className="row wrap">
                <span className="guide-ic"><Icon name={s.icon} /></span>
                <div className="col grow" style={{ gap: 0 }}>
                  <h2 className="h2">{s.title}</h2>
                  <span className="mut" style={{ fontSize: 13 }}>{T("Letak:")} {s.where}</span>
                </div>
                {TOUR.some((t) => t.page === s.open.page) && s.id !== 'mulai' && <button className="btn sm" onClick={() => app.startTour(tourIndex(s.open.page))}><Icon name="play" size="sm" />{T("Tunjukkan")}</button>}
                <button className="btn sm pri" onClick={() => app.nav(s.open.page, s.open.params || {})}><Icon name="external" size="sm" />{T("Buka")}</button>
              </div>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{s.intro}</p>
              <dl className="guide-list">
                {s.items.map(([t, d]) => (
                  <div key={t} className="guide-row"><dt>{t}</dt><dd>{d}</dd></div>
                ))}
              </dl>
            </section>
          ))}
          {!query && (
            <section id="guide-pintasan" className="card pad col" style={{ gap: 12, scrollMarginTop: 16 }}>
              <div className="row"><span className="guide-ic"><Icon name="bolt" /></span><h2 className="h2 grow">{T("Pintasan keyboard")}</h2></div>
              <div className="guide-keys">
                {SHORTCUTS.map(([k, d]) => <div key={k} className="row" style={{ gap: 10 }}><span className="kbd" style={{ fontSize: 12, padding: '3px 8px' }}>{k}</span><span>{d}</span></div>)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
