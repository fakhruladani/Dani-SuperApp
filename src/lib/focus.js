import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

/**
 * Global Pomodoro timer (survives page switches). Uses an absolute end time, so sleep is handled.
 * The returned object only changes on state transitions (start, pause, finish), never per tick,
 * so the whole app does not re-render while the timer runs. Displays use useFocusLeft().
 */
export function useFocusTimer(settings) {
  const dur = useCallback((phase) => 60000 * (phase === 'short' ? (settings?.shortMin || 5) : phase === 'long' ? (settings?.longMin || 15) : (settings?.focusMin || 25)), [settings?.focusMin, settings?.shortMin, settings?.longMin]);
  const [st, setSt] = useState({ phase: 'focus', running: false, endAt: 0, left: 25 * 60000, label: '', count: 0, startedAt: 0 });
  const stRef = useRef(st); stRef.current = st;
  const durRef = useRef(dur); durRef.current = dur;

  useEffect(() => { if (!st.running) setSt((s) => ({ ...s, left: dur(s.phase) })); }, [dur]); // eslint-disable-line react-hooks/exhaustive-deps

  // one timeout to the end time instead of polling every 250 ms
  useEffect(() => {
    if (!st.running) return undefined;
    const t = setTimeout(complete, Math.max(0, st.endAt - Date.now()));
    return () => clearTimeout(t);
  }, [st.running, st.endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  function complete() {
    const s = stRef.current;
    const d = durRef.current;
    beep();
    let next = 'focus', count = s.count;
    if (s.phase === 'focus') {
      count += 1;
      const minutes = Math.round((d('focus')) / 60000);
      DB.save('focus_sessions', { start: toLocalDateTime(new Date(s.startedAt)), minutes, label: s.label, kind: 'focus' });
      next = count % 4 === 0 ? 'long' : 'short';
      try { new Notification('Sesi fokus selesai', { body: `${minutes} menit${s.label ? ' · ' + s.label : ''}. Waktunya istirahat.` }); } catch { /* */ }
    } else {
      try { new Notification('Istirahat selesai', { body: 'Siap mulai sesi fokus berikutnya?' }); } catch { /* */ }
    }
    api('focus:set', 0);
    setSt({ ...s, phase: next, running: false, endAt: 0, left: d(next), count });
  }

  return useMemo(() => {
    const total = dur(st.phase);
    const leftNow = () => (st.running ? Math.max(0, st.endAt - Date.now()) : st.left);
    return {
      ...st, total,
      start: () => {
        const left = leftNow();
        const endAt = Date.now() + left;
        if (st.phase === 'focus') api('focus:set', endAt);
        setSt({ ...st, running: true, endAt, startedAt: st.startedAt && st.left < total ? st.startedAt : Date.now() });
      },
      pause: () => { api('focus:set', 0); setSt({ ...st, running: false, left: leftNow(), endAt: 0 }); },
      reset: () => { api('focus:set', 0); setSt({ ...st, running: false, left: dur(st.phase), endAt: 0, startedAt: 0 }); },
      setPhase: (phase) => { api('focus:set', 0); setSt({ ...st, phase, running: false, left: dur(phase), endAt: 0, startedAt: 0 }); },
      setLabel: (label) => setSt({ ...st, label }),
      skip: () => complete()
    };
  }, [st, dur]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Remaining time that re-renders only the component that displays it. */
export function useFocusLeft(f, ms = 250) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!f.running) return undefined;
    const t = setInterval(() => force((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [f.running, ms]);
  return f.running ? Math.max(0, f.endAt - Date.now()) : f.left;
}

export const mmss = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
