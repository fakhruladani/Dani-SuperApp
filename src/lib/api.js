import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';

const bridge = window.dsa;
export const api = (name, ...args) => bridge.invoke(name, ...args);
export const on = (event, cb) => bridge.on(event, cb);

export const DB = {
  list: (t, o) => api('db:list', t, o),
  get: (t, id) => api('db:get', t, id),
  save: (t, row) => api('db:upsert', t, row),
  remove: (t, id) => api('db:remove', t, id),
  removeWhere: (t, w) => api('db:removeWhere', t, w)
};

/** Run an async loader and re-run it whenever one of `tables` changes in the DB. */
export function useQuery(loader, deps = [], tables = []) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null });
  const ref = useRef(loader);
  ref.current = loader;
  const run = useCallback(() => {
    let alive = true;
    Promise.resolve(ref.current()).then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (error) => alive && setState((s) => ({ data: s.data, loading: false, error }))
    );
    return () => { alive = false; };
  }, []);
  useEffect(() => run(), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tables.length) return undefined;
    return on('db:changed', (changed) => { if (changed.some((t) => tables.includes(t))) run(); });
  }, [tables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: run };
}

/** Live clock. Re-syncs on resume / visibility so it always matches the system clock. */
export function useNow(resolution = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t;
    const tick = () => {
      setNow(new Date());
      const ms = Date.now();
      t = setTimeout(tick, resolution - (ms % resolution) + 5);
    };
    tick();
    const off = on('power:resume', () => { clearTimeout(t); tick(); });
    const vis = () => { if (!document.hidden) { clearTimeout(t); tick(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); off(); document.removeEventListener('visibilitychange', vis); };
  }, [resolution]);
  return now;
}

export function useDebounced(fn, ms) {
  const t = useRef();
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => () => clearTimeout(t.current), []);
  return useCallback((...a) => { clearTimeout(t.current); t.current = setTimeout(() => f.current(...a), ms); }, [ms]);
}

// ---------- app-wide context (settings, toasts, navigation) ----------
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/** Resolve theme CSS variables to real colors (needed for canvas/SVG chart libraries). */
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue('--' + n).trim();
  return { pos: g('pos'), neg: g('neg'), accent: g('accent'), text: g('text'), muted: g('muted'), border: g('border'), surface: g('surface'), surface2: g('surface2'), bg: g('bg'), c: [g('c1'), g('c2'), g('c3'), g('c4'), g('c6'), g('c7'), g('c8'), g('c5')] };
}
