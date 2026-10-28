import { useEffect, useLayoutEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { TOUR } from '../lib/guide.js';
import { T } from '../lib/i18n.js';

// Guided tour: opens each page, dims the screen and highlights one element with an explanation card.
export default function Tour({ index, setIndex, nav, onClose }) {
  const step = TOUR[index];
  const [rect, setRect] = useState(null);

  useEffect(() => { nav(step.page); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // find the element after the page has rendered, and follow it if the window resizes
  useLayoutEffect(() => {
    // keep measuring briefly: pages load lazily and the layout settles after the first paint
    let n = 0, scrolled = false;
    const measure = () => {
      const el = document.querySelector(step.sel);
      if (!el) { if (n > 20) setRect(null); return; }
      if (!scrolled) { el.scrollIntoView({ block: 'nearest' }); scrolled = true; }
      const r = el.getBoundingClientRect();
      setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    setRect(null);
    const iv = setInterval(() => { n += 1; measure(); if (n > 25) clearInterval(iv); }, 120);
    window.addEventListener('resize', measure);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') index < TOUR.length - 1 ? setIndex(index + 1) : onClose();
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [index, setIndex, onClose]);

  const pad = 6;
  const W = 340;
  let card = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const below = rect.top + rect.height + pad + 12;
    const fitsBelow = below + 190 < window.innerHeight;
    const fitsRight = rect.left + rect.width + pad + 12 + W < window.innerWidth;
    if (rect.height > window.innerHeight * 0.6 && fitsRight) card = { left: rect.left + rect.width + pad + 12, top: Math.max(16, Math.min(rect.top + 16, window.innerHeight - 220)) };
    else if (rect.height > window.innerHeight * 0.6) card = { left: Math.max(16, rect.left + 16), top: Math.max(16, rect.top + 16) };
    else card = { left: Math.min(Math.max(16, rect.left), window.innerWidth - W - 16), top: fitsBelow ? below : Math.max(16, rect.top - pad - 200) };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={T('Tur {i} dari {n}: {t}', { i: index + 1, n: TOUR.length, t: step.title })}>
      {rect ? (
        <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : <div className="tour-dim" />}
      <div className="card tour-card" style={{ ...card, width: W }}>
        <div className="row"><span className="lbl grow">{T("Tur")} {index + 1}/ {TOUR.length}</span><button className="icb sm" aria-label={T("Tutup tur")} onClick={onClose}><Icon name="x" size="sm" /></button></div>
        <strong style={{ fontSize: 16 }}>{step.title}</strong>
        <span style={{ lineHeight: 1.55 }}>{step.body}</span>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn sm ghost" onClick={onClose}>{T("Lewati")}</button>
          <span className="grow" />
          {index > 0 && <button className="btn sm" onClick={() => setIndex(index - 1)}><Icon name="left" size="sm" />{T("Kembali")}</button>}
          <button className="btn sm pri" autoFocus onClick={() => (index < TOUR.length - 1 ? setIndex(index + 1) : onClose())}>{index < TOUR.length - 1 ? T("Berikutnya") : T("Selesai")}{index < TOUR.length - 1 && <Icon name="right" size="sm" />}</button>
        </div>
      </div>
    </div>
  );
}
