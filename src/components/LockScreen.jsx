import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { api, useNow } from '../lib/api.js';
import { fmtDateLong, pad } from '../../shared/recur.js';

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const now = useNow(1000);

  const tryPin = async (p) => {
    if (await api('pin:verify', p)) onUnlock();
    else { setBad(true); setPin(''); setTimeout(() => setBad(false), 400); }
  };
  const press = (d) => {
    const p = (pin + d).slice(0, 8);
    setPin(p);
  };
  useEffect(() => {
    const k = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      if (e.key === 'Enter') tryPin(pin);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="lock" role="dialog" aria-label="Aplikasi terkunci">
      <div className="col" style={{ alignItems: 'center', gap: 22 }}>
        <div className="logo" style={{ width: 56, height: 56, fontSize: 26, borderRadius: 16 }}>D</div>
        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <span className="num" style={{ fontSize: 48, fontWeight: 800 }}>{pad(now.getHours())}.{pad(now.getMinutes())}</span>
          <span className="mut">{fmtDateLong(now)}</span>
        </div>
        <div className="row" style={{ gap: 8 }}><Icon name="lock" size="sm" /><span style={{ fontWeight: 700 }}>Masukkan PIN</span></div>
        <div className={`pin-dots ${bad ? 'shake' : ''}`} aria-live="polite" aria-label={`${pin.length} digit dimasukkan`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'f' : ''} />)}
        </div>
        <div className="pinpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} onClick={() => press(String(d))}>{d}</button>)}
          <button aria-label="Hapus" onClick={() => setPin((p) => p.slice(0, -1))}><Icon name="left" /></button>
          <button onClick={() => press('0')}>0</button>
          <button aria-label="Buka" onClick={() => tryPin(pin)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }}><Icon name="check" /></button>
        </div>
      </div>
    </div>
  );
}
