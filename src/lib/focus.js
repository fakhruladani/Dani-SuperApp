import { useEffect, useRef, useState, useCallback } from 'react';
import { api, DB } from './api.js';
import { toLocalDateTime } from '../../shared/recur.js';

export function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i === 2 ? 1046 : 784; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* audio unavailable */ }
}

/** Global Pomodoro timer (survives page switches). Uses absolute end time, so sleep is handled. */
export function useFocusTimer(settings) {
  const dur = useCallback((phase) => 60000 * (phase === 'short' ? (settings?.shortMin || 5) : phase === 'long' ? (settings?.longMin || 15) : (settings?.focusMin || 25)), [settings?.focusMin, settings?.shortMin, settings?.longMin]);
  const [st, setSt] = useState({ phase: 'focus', running: false, endAt: 0, left: 25 * 60000, label: '', count: 0, startedAt: 0 });
  const [, force] = useState(0);
  const stRef = useRef(st); stRef.current = st;

  useEffect(() => { if (!st.running) setSt((s) => ({ ...s, left: dur(s.phase) })); }, [dur]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!st.running) return undefined;
    const t = setInterval(() => {
      const s = stRef.current;
      if (Date.now() >= s.endAt) complete(); else force((x) => x + 1);
    }, 250);
    return () => clearInterval(t);
  }, [st.running]); // eslint-disable-line react-hooks/exhaustive-deps

  function complete() {
    const s = stRef.current;
    beep();
    let next = 'focus', count = s.count;
    if (s.phase === 'focus') {
      count += 1;
      const minutes = Math.round((dur('focus')) / 60000);
      DB.save('focus_sessions', { start: toLocalDateTime(new Date(s.startedAt)), minutes, label: s.label, kind: 'focus' });
      next = count % 4 === 0 ? 'long' : 'short';
      try { new Notification('Sesi fokus selesai', { body: `${minutes} menit${s.label ? ' · ' + s.label : ''}. Waktunya istirahat.` }); } catch { /* */ }
    } else {
      try { new Notification('Istirahat selesai', { body: 'Siap mulai sesi fokus berikutnya?' }); } catch { /* */ }
    }
    api('focus:set', 0);
    setSt({ ...s, phase: next, running: false, endAt: 0, left: dur(next), count });
  }

  const left = st.running ? Math.max(0, st.endAt - Date.now()) : st.left;
  const total = dur(st.phase);
  return {
    ...st, left, total,
    start: () => {
      const endAt = Date.now() + left;
      if (st.phase === 'focus') api('focus:set', endAt);
      setSt({ ...st, running: true, endAt, startedAt: st.startedAt && st.left < total ? st.startedAt : Date.now() });
    },
    pause: () => { api('focus:set', 0); setSt({ ...st, running: false, left, endAt: 0 }); },
    reset: () => { api('focus:set', 0); setSt({ ...st, running: false, left: dur(st.phase), endAt: 0, startedAt: 0 }); },
    setPhase: (phase) => { api('focus:set', 0); setSt({ ...st, phase, running: false, left: dur(phase), endAt: 0, startedAt: 0 }); },
    setLabel: (label) => setSt({ ...st, label }),
    skip: () => complete()
  };
}

export const mmss = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
