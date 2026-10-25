import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { wmo } from '../../shared/weather.js';

export function Modal({ title, onClose, children, footer, width = 560, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', k, true);
    const first = ref.current?.querySelector('input, textarea, select, button.pri');
    first?.focus();
    return () => window.removeEventListener('keydown', k, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} ref={ref}>
        {title != null && (
          <div className="modal-h">
            <h2 className="h2 grow">{title}</h2>
            <button className="icb sm" aria-label="Tutup" onClick={onClose}><Icon name="x" size="sm" /></button>
          </div>
        )}
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={`tab ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Sparkline({ data, up, height = 36, className = '' }) {
  if (!data || data.length < 2) return <svg viewBox="0 0 120 36" style={{ width: '100%', height }} aria-hidden="true" />;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 120},${max === min ? 18 : 33 - ((v - min) / (max - min)) * 30}`).join(' ');
  return (
    <svg viewBox="0 0 120 36" preserveAspectRatio="none" style={{ width: '100%', height }} aria-hidden="true" className={className}>
      <polyline className="sp" points={pts} style={{ stroke: up ? 'var(--pos)' : 'var(--neg)' }} />
    </svg>
  );
}

export function WeatherIcon({ code, size = 'lg', style }) {
  return <Icon name={wmo(code)[1]} size={size} style={style} />;
}

export function Empty({ icon = 'info', children }) {
  return <div className="empty"><Icon name={icon} /><div style={{ marginTop: 6 }}>{children}</div></div>;
}

export function Spinner({ size = 'sm' }) { return <Icon name="refresh" size={size} className="spin" />; }

export function Field({ label, children, hint }) {
  return (
    <label className="flabel">
      <span>{label}</span>
      {children}
      {hint && <small className="mut" style={{ fontWeight: 500 }}>{hint}</small>}
    </label>
  );
}

export const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
export function ColorPick({ value, onChange }) {
  return (
    <div className="row" role="radiogroup" aria-label="Warna">
      {COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={'Warna ' + c} className={`sw ${value === c ? 'on' : ''}`} onClick={() => onChange(c)}>
          <i className={`k-${c}`} style={{ background: 'var(--k)' }} />
        </button>
      ))}
    </div>
  );
}
