import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import Icon from './components/Icon.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import LockScreen from './components/LockScreen.jsx';
import { Modal } from './components/ui.jsx';
import { api, on, AppCtx, useNow, DB, useQuery, useMobile, isAndroid } from './lib/api.js';
import { useFocusTimer, useFocusLeft, mmss } from './lib/focus.js';
import { fmtDateLong, pad, toLocalDate, expandAll } from '../shared/recur.js';
import Home from './pages/Home.jsx';

const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Notes = lazy(() => import('./pages/Notes.jsx'));
const Finance = lazy(() => import('./pages/Finance.jsx'));
const Market = lazy(() => import('./pages/Market.jsx'));
const Focus = lazy(() => import('./pages/Focus.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Clipboard = lazy(() => import('./pages/Clipboard.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Guide = lazy(() => import('./pages/Guide.jsx'));
import Tour from './components/Tour.jsx';
import QuickBot from './components/QuickBot.jsx';
import Resizer, { usePanelWidth } from './components/Resizer.jsx';
import { T } from './lib/i18n.js';

const NAV = [
  { k: 'home', label: T("Beranda"), icon: 'home' },
  { k: 'cal', label: T("Kalender"), icon: 'cal' },
  { k: 'notes', label: T("Catatan"), icon: 'note' },
  { k: 'fin', label: T("Keuangan"), icon: 'wallet' },
  { k: 'market', label: T("Market & Berita"), icon: 'chart' },
  { k: 'focus', label: T("Fokus & Tugas"), icon: 'timer' },
  { k: 'projects', label: T("Proyek"), icon: 'project' },
  { k: 'clip', label: T("Clipboard"), icon: 'clip' }
];
const TITLES = { home: T('Beranda'), cal: T('Kalender'), notes: T('Catatan'), fin: T('Keuangan'), market: T('Market & Berita'), focus: T('Fokus & Tugas'), projects: T('Proyek'), clip: T('Riwayat Clipboard'), settings: T('Pengaturan'), guide: T('Panduan') };

export default function App() {
  const [settings, setSettings] = useState(null);
  const [dark, setDarkState] = useState(false);
  const setDark = (d) => { document.documentElement.classList.toggle('dark', !!d); setDarkState(!!d); };
  const [page, setPage] = useState('home');
  const [params, setParams] = useState({});
  const [palette, setPalette] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [pinSet, setPinSet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [tour, setTour] = useState(null); // index of the guided-tour step, or null
  const now = useNow(60000); // minute resolution: the seconds clock lives in <Clock/> only
  const focus = useFocusTimer(settings);
  const lastActive = useRef(Date.now());
  const mobile = useMobile();
  const android = isAndroid();
  const [more, setMore] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('mobile', mobile); }, [mobile]);

  const loadSettings = useCallback(() => api('settings:all').then(setSettings), []);
  useEffect(() => {
    loadSettings();
    api('theme:get').then((t) => setDark(t.dark));
    api('pin:status').then((s) => { setPinSet(s.set); if (s.set) setLocked(true); });
    api('reminder:pending').then((list) => list.forEach((p) => pushToast({ kind: 'reminder', ...p })));
    api('nav:pending').then((p) => { if (p?.nav) nav(p.nav, p); else if (p?.reminder) nav('cal', { date: p.date }); });
    const offs = [
      on('theme:changed', (t) => setDark(t.dark)),
      on('db:changed', (t) => { if (t.includes('settings')) { loadSettings(); api('pin:status').then((s) => setPinSet(s.set)); } }),
      on('nav', (p) => { if (p?.nav) nav(p.nav, p); else if (p?.reminder) nav('cal', { date: p.date }); }),
      on('reminder:fire', (p) => pushToast({ kind: 'reminder', ...p })),
      on('gsheet:event', (ev) => {
        if (ev.added || ev.updated) pushToast(T('Google Sheets: {a} transaksi baru, {u} diperbarui', { a: ev.added, u: ev.updated }));
        else if (ev.error && !ev.quiet) pushToast({ text: T('Impor Google Sheets gagal. Lihat Pengaturan → Google Sheets.'), error: true });
        else if (!ev.error && !ev.quiet) pushToast(ev.linked ? T('Google Sheets tersinkron · {n} baris cocok dengan transaksi yang sudah ada', { n: ev.linked }) : T('Google Sheets sudah tersinkron, tidak ada transaksi baru'));
      }),
      on('sync:event', (ev) => {
        if (ev.type === 'synced' && !ev.quiet) pushToast(T('Sinkron selesai · {n} perubahan masuk', { n: ev.result?.received || 0 }));
        if (ev.type === 'error' && !ev.quiet) pushToast({ text: ev.error === 'UNPAIRED' ? T('Laptop menolak: HP ini sudah diputus di laptop. Hubungkan ulang.') : T('Laptop tidak terjangkau. Pastikan satu Wi-Fi dan sinkron di laptop aktif.'), error: true });
      }),
      on('power:lock', () => setLocked((l) => l || pinRef.current)),
      on('update:status', (u) => { if (u.state === 'ready' && updToast.current !== u.version) { updToast.current = u.version; pushToast(T('Pembaruan {v} siap. Pasang dari Pengaturan → Umum.', { v: u.version })); } })
    ];
    return () => offs.forEach((f) => f());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pinRef = useRef(false); pinRef.current = pinSet;
  const updToast = useRef(null);


  // idle auto-lock
  useEffect(() => {
    const mark = () => { lastActive.current = Date.now(); };
    ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((e) => window.removeEventListener(e, mark));
  }, []);
  useEffect(() => {
    const m = Number(settings?.lockAfterMin) || 0;
    if (pinSet && m > 0 && !locked && Date.now() - lastActive.current > m * 60000) setLocked(true);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = useCallback((p, prm = {}) => { setPage(p); setParams({ ...prm, _t: Date.now() }); }, []);
  const pushToast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    const item = typeof t === 'string' ? { id, text: t } : { ...t, id, refId: t.id };
    setToasts((x) => [...x.slice(-4), item]);
    if (item.kind !== 'reminder') setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), item.ms || 3500);
  }, []);
  const dropToast = (id) => setToasts((x) => x.filter((y) => y.id !== id));
  const confirm = useCallback((text, opts = {}) => new Promise((resolve) => setConfirmState({ text, ...opts, resolve })), []);
  const setSetting = useCallback(async (k, v) => { setSettings((s) => ({ ...s, [k]: v })); await api('settings:set', k, v); }, []);
  const toggleTheme = useCallback(() => { setDark(!dark); setSetting('theme', dark ? 'light' : 'dark'); }, [dark, setSetting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e) => {
      if (locked) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if ((e.ctrlKey || e.metaKey) && /^[1-8]$/.test(e.key)) { e.preventDefault(); nav(NAV[Number(e.key) - 1].k); }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); nav('settings'); }
      if (e.key === 'F1') { e.preventDefault(); nav('guide'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && pinSet) { e.preventDefault(); setLocked(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [locked, pinSet, nav]);

  // sidebar badges: today's events + open tasks due today
  const today = toLocalDate(now);
  const badges = useQuery(async () => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const evs = await DB.list('events');
    const occ = expandAll(evs, start, new Date(start.getTime() + 86400000));
    const tasks = await DB.list('tasks', { where: { done: { ne: 1 }, due_date: { lte: today } } });
    return { cal: occ.length, focus: tasks.length };
  }, [today], ['events', 'tasks']);

  const sidebarW = usePanelWidth('sidebar', 236, 190, 340, { settings, setSetting });
  const ctx = useMemo(() => ({ settings, setSetting, dark, toggleTheme, nav, page, params, toast: pushToast, confirm, focus, pinSet, lock: () => setLocked(true), reloadSettings: loadSettings, startTour: (i = 0) => setTour(i), mobile, android }), [settings, setSetting, dark, toggleTheme, nav, page, params, pushToast, confirm, focus, pinSet, loadSettings, mobile, android]);

  // Android back button (src/android/bridge.js): a page may handle it first (e.g. note -> list), then back to Beranda
  useEffect(() => {
    window.__dsaBack = () => { if (window.__dsaPageBack?.()) return true; if (more) { setMore(false); return true; } if (page !== 'home') { nav('home'); return true; } return false; };
    return () => { window.__dsaBack = null; };
  }, [page, more, nav]);

  useEffect(() => {
    // the tour points at the desktop sidebar; on a phone the bottom bar explains itself
    if (settings && !settings.tourSeen && !locked && tour == null) { if (!mobile) setTour(0); setSetting('tourSeen', true); }
  }, [!!settings, settings?.tourSeen, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><div className="logo">D</div></div>;

  const Page = { home: Home, cal: Calendar, notes: Notes, fin: Finance, market: Market, focus: Focus, projects: Projects, clip: Clipboard, settings: Settings, guide: Guide }[page] || Home;

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`shell ${mobile ? 'is-mobile' : ''}`}>
        {!mobile && <><nav className="sidebar" aria-label={T("Menu utama")} style={{ width: sidebarW.width }}>
          <div className="brand">
            <div className="logo">D</div>
            <div className="col" style={{ gap: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{T("D'Super App")}</span>
              <span className="mut" style={{ fontSize: 12 }}>{T("Ruang kerja pribadi")}</span>
            </div>
          </div>
          <div className="col" style={{ gap: 2 }}>
            {NAV.map((n, i) => (
              <button key={n.k} className={`nav ${page === n.k ? 'on' : ''}`} onClick={() => nav(n.k)} title={`${n.label} (Ctrl+${i + 1})`}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {badges.data?.[n.k] > 0 && <span className="chip badge" style={{ padding: '1px 8px' }}>{badges.data[n.k]}</span>}
              </button>
            ))}
          </div>
          <div className="col" style={{ marginTop: 'auto', gap: 8 }}>
            {(focus.running || focus.left < focus.total) && <FocusMini focus={focus} onClick={() => nav('focus')} />}
            <button data-tour="nav-guide" className={`nav ${page === 'guide' ? 'on' : ''}`} onClick={() => nav('guide')} title={T("Panduan (F1)")}><Icon name="book" /><span>{T("Panduan")}</span></button>
            <button className={`nav ${page === 'settings' ? 'on' : ''}`} onClick={() => nav('settings')}><Icon name="gear" /><span>{T("Pengaturan")}</span></button>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn grow" onClick={toggleTheme} title={T("Ganti tema")}>
                <Icon name={dark ? 'sun' : 'moon'} size="sm" />{dark ? T("Terang") : T("Gelap")}
              </button>
              {pinSet && <button className="btn" aria-label={T("Kunci aplikasi (Ctrl+L)")} title={T("Kunci (Ctrl+L)")} onClick={() => setLocked(true)}><Icon name="lock" size="sm" /></button>}
            </div>
          </div>
        </nav>

        <Resizer panel={sidebarW} className="edge" label={T('Ubah lebar menu')} /></>}
        <div className="main">
          <header className="topbar">
            <div className="title">
              <span style={{ fontWeight: 800, fontSize: 19 }}>{TITLES[page]}</span>
              {!mobile && <Clock />}
            </div>
            {mobile ? (
              <button className="icb" aria-label={T("Cari apa saja…")} onClick={() => setPalette(true)}><Icon name="search" /></button>
            ) : (
              <button className="searchbox" onClick={() => setPalette(true)}>
                <Icon name="search" size="sm" />
                <span className="grow">{T("Cari apa saja…")}</span>
                <span className="kbd">Ctrl K</span>
              </button>
            )}
            {!android && <button data-tour="quick" className="icb" title={T("Catatan cepat (Ctrl+Shift+Space)")} aria-label={T("Catatan cepat")} onClick={() => api('win:quick')}><Icon name="bolt" /></button>}
            {!android && !mobile && <button className="icb" title={T("Widget mini")} aria-label={T("Widget mini")} onClick={() => api('win:widget')}><Icon name="widget" /></button>}
            <button className="icb" aria-label={T("Ganti tema")} onClick={toggleTheme}><Icon name={dark ? 'sun' : 'moon'} /></button>
          </header>
          <div className="content">
            <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 200 }} /></div>}>
              <Page key={page} />
            </Suspense>
          </div>
          {mobile && <BottomNav page={page} nav={nav} badges={badges.data} more={more} setMore={setMore} />}
        </div>
      </div>
      {mobile && more && <MoreSheet page={page} nav={(k) => { setMore(false); nav(k); }} onClose={() => setMore(false)} dark={dark} toggleTheme={toggleTheme} pinSet={pinSet} lock={() => { setMore(false); setLocked(true); }} focus={focus} android={android} />}

      {!locked && <QuickBot />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="card toast" role="status">
            {t.kind === 'reminder' ? (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <div className="logo" style={{ width: 22, height: 22, fontSize: 12, borderRadius: 6 }}>D</div>
                  <span className="mut grow" style={{ fontSize: 12, fontWeight: 600 }}>{t.late ? T("Pengingat terlewat") : T("Pengingat")}</span>
                  <button className="icb sm" aria-label={T("Tutup")} onClick={() => dropToast(t.id)}><Icon name="x" size="sm" /></button>
                </div>
                <div className="col" style={{ gap: 2 }}>
                  <strong>{t.title}</strong>
                  <span className="mut" style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{t.body}</span>
                </div>
                <div className="row">
                  <button className="btn sm grow" onClick={() => { api('reminder:snooze', t.logId, 10); dropToast(t.id); }}>{T("Tunda 10 mnt")}</button>
                  <button className="btn sm grow" onClick={() => { dropToast(t.id); nav(t.type === 'task' ? 'focus' : 'cal', { date: t.date }); }}>{T("Lihat")}</button>
                  <button className="btn sm pri grow" onClick={() => { api('reminder:dismiss', t.logId); if (t.type === 'task') DB.save('tasks', { id: t.refId, done: 1, done_at: new Date().toISOString() }); dropToast(t.id); }}>{T("Selesai")}</button>
                </div>
              </>
            ) : (
              <div className="row"><Icon name={t.error ? 'info' : 'check'} size="sm" /><span className="grow">{t.text}</span></div>
            )}
          </div>
        ))}
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {confirmState && (
        <Modal title={confirmState.title || T("Konfirmasi")} width={420} onClose={() => { confirmState.resolve(false); setConfirmState(null); }}
          footer={<>
            <button className="btn" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>{T("Batal")}</button>
            <button className={`btn pri ${confirmState.danger ? 'danger' : ''}`} style={confirmState.danger ? { background: 'var(--neg)', borderColor: 'var(--neg)', color: '#fff' } : undefined} onClick={() => { confirmState.resolve(true); setConfirmState(null); }}>{confirmState.ok || T("Ya")}</button>
          </>}>
          <p style={{ margin: 0 }}>{confirmState.text}</p>
        </Modal>
      )}
      {tour != null && !locked && <Tour index={tour} setIndex={setTour} nav={nav} onClose={() => setTour(null)} />}
      {locked && <LockScreen onUnlock={() => { setLocked(false); lastActive.current = Date.now(); }} />}
    </AppCtx.Provider>
  );
}

// Seconds clock in its own component, so only this text re-renders every second.
function Clock() {
  const now = useNow(1000);
  return <span className="mut num ellipsis" style={{ fontSize: 12.5 }}>{fmtDateLong(now)} · {pad(now.getHours())}.{pad(now.getMinutes())}.{pad(now.getSeconds())}</span>;
}

function FocusMini({ focus, onClick }) {
  const left = useFocusLeft(focus, 1000);
  return (
    <button className="card" onClick={onClick} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'none', background: 'var(--accent-soft)', borderColor: 'transparent', color: 'var(--accent-text)', textAlign: 'left' }}>
      <Icon name="timer" />
      <span className="col grow" style={{ gap: 0 }}>
        <span style={{ fontWeight: 800 }} className="num">{mmss(left)}</span>
        <span style={{ fontSize: 12 }}>{focus.phase === 'focus' ? T("Sesi fokus") : T("Istirahat")}{focus.running ? '' : T(" · dijeda")}</span>
      </span>
    </button>
  );
}

// ---------- phone layout ----------
const BOTTOM = ['home', 'cal', 'notes', 'fin'];
function BottomNav({ page, nav, badges, more, setMore }) {
  const inMore = !BOTTOM.includes(page);
  return (
    <nav className="bottom-nav" aria-label={T("Menu utama")}>
      {BOTTOM.map((k) => { const n = NAV.find((x) => x.k === k); return (
        <button key={k} className={`bn ${page === k && !more ? 'on' : ''}`} onClick={() => { setMore(false); nav(k); }}>
          <span className="bn-ic"><Icon name={n.icon} />{badges?.[k] > 0 && <span className="bn-badge">{badges[k]}</span>}</span>
          <span>{k === 'fin' ? T('Keuangan') : n.label}</span>
        </button>
      ); })}
      <button className={`bn ${more || inMore ? 'on' : ''}`} aria-expanded={more} onClick={() => setMore(!more)}>
        <span className="bn-ic"><Icon name="more" />{badges?.focus > 0 && <span className="bn-badge">{badges.focus}</span>}</span>
        <span>{T('Lainnya|menu')}</span>
      </button>
    </nav>
  );
}

function MoreSheet({ page, nav, onClose, dark, toggleTheme, pinSet, lock, focus, android }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const items = [...NAV.filter((n) => !BOTTOM.includes(n.k) && !(android && n.k === 'clip')), { k: 'guide', label: T('Panduan'), icon: 'book' }, { k: 'settings', label: T('Pengaturan'), icon: 'gear' }];
  return (
    <div className="sheet-dim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet" role="dialog" aria-label={T('Lainnya|menu')}>
        {(focus.running || focus.left < focus.total) && <FocusMini focus={focus} onClick={() => nav('focus')} />}
        <div className="sheet-grid">
          {items.map((n) => (
            <button key={n.k} className={`sheet-item ${page === n.k ? 'on' : ''}`} onClick={() => nav(n.k)}>
              <Icon name={n.icon} /><span>{n.label}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn grow" onClick={toggleTheme}><Icon name={dark ? 'sun' : 'moon'} size="sm" />{dark ? T("Terang") : T("Gelap")}</button>
          {pinSet && <button className="btn" onClick={lock}><Icon name="lock" size="sm" />{T('Kunci')}</button>}
        </div>
      </div>
    </div>
  );
}
