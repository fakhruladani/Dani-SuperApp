import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/api.js';
import { T } from '../lib/i18n.js';

// Draggable panel widths. usePanelWidth keeps the width per panel in settings.layout (saved when a
// drag ends, so the database is not written on every mouse move). <Resizer> is the vertical handle.
const clampTo = (v, min, max) => Math.round(Math.max(min, Math.min(max, v)));

export function usePanelWidth(key, def, min, max, appOverride) {
  const ctxApp = useApp();
  const app = appOverride || ctxApp;
  const saved = app?.settings?.layout?.[key];
  const [width, setWidth] = useState(() => clampTo(saved ?? def, min, max));
  useEffect(() => { if (saved != null) setWidth(clampTo(saved, min, max)); }, [saved, min, max]);
  const commit = (v) => { const layout = { ...(app.settings?.layout || {}) }; if (v === def) delete layout[key]; else layout[key] = v; app.setSetting('layout', layout); };
  return { width, def, min, max, set: (v) => setWidth(clampTo(v, min, max)), commit: (v) => commit(clampTo(v, min, max)) };
}

/** side="left": the panel sits left of the handle (drag right = wider); side="right": the panel is on the right. */
export default function Resizer({ panel, side = 'left', label = T('Ubah lebar panel'), className = '' }) {
  const drag = useRef(null);
  const [active, setActive] = useState(false);
  const dir = side === 'left' ? 1 : -1;
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: panel.width, last: panel.width };
    setActive(true);
    document.body.classList.add('resizing');
  };
  const move = (e) => {
    if (!drag.current) return;
    const w = clampTo(drag.current.w + (e.clientX - drag.current.x) * dir, panel.min, panel.max);
    drag.current.last = w;
    panel.set(w);
  };
  const up = () => {
    if (!drag.current) return;
    panel.commit(drag.current.last);
    drag.current = null;
    setActive(false);
    document.body.classList.remove('resizing');
  };
  const key = (e) => {
    const step = e.shiftKey ? 48 : 16;
    let w = null;
    if (e.key === 'ArrowLeft') w = panel.width - step * dir;
    if (e.key === 'ArrowRight') w = panel.width + step * dir;
    if (e.key === 'Home') w = panel.min;
    if (e.key === 'End') w = panel.max;
    if (w == null) return;
    e.preventDefault();
    panel.set(w);
    panel.commit(w);
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={panel.width} aria-valuemin={panel.min} aria-valuemax={panel.max} tabIndex={0}
      title={T('Geser untuk mengubah lebar · klik dua kali untuk ukuran awal')}
      className={`resizer ${active ? 'on' : ''} ${className}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onDoubleClick={() => { panel.set(panel.def); panel.commit(panel.def); }} onKeyDown={key} />
  );
}
