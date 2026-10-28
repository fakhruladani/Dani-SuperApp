import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { api, useApp } from '../lib/api.js';

const TYPE = { note: ['note', 'Catatan'], event: ['cal', 'Acara'], task: ['check', 'Tugas'], tx: ['wallet', 'Transaksi'] };

export default function CommandPalette({ onClose }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [idx, setIdx] = useState(0);

  const commands = useMemo(() => [
    { title: 'Buka Beranda', icon: 'home', run: () => app.nav('home') },
    { title: 'Buka Kalender', icon: 'cal', run: () => app.nav('cal') },
    { title: 'Buat acara / pengingat baru', icon: 'bell', run: () => app.nav('cal', { newEvent: Date.now() }) },
    { title: 'Buat catatan baru', icon: 'note', run: () => app.nav('notes', { newNote: Date.now() }) },
    { title: 'Sticky note baru (jendela mengambang)', icon: 'widget', run: () => api('sticky:new') },
    { title: 'Tambah transaksi', icon: 'wallet', run: () => app.nav('fin', { newTx: Date.now() }) },
    { title: 'Rekap keuangan tahunan', icon: 'table', run: () => app.nav('fin', { tab: 'recap' }) },
    { title: 'Market & berita', icon: 'chart', run: () => app.nav('market') },
    { title: 'Fokus & tugas', icon: 'timer', run: () => app.nav('focus') },
    { title: 'Riwayat clipboard', icon: 'clip', run: () => app.nav('clip') },
    { title: 'Pengaturan', icon: 'gear', run: () => app.nav('settings') },
    { title: 'Panduan fitur (F1)', icon: 'book', run: () => app.nav('guide') },
    { title: 'Mulai tur aplikasi', icon: 'play', run: () => app.startTour(0) },
    { title: app.dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap', icon: app.dark ? 'sun' : 'moon', run: () => app.toggleTheme() },
    { title: 'Mulai sesi fokus', icon: 'play', run: () => { app.focus.start(); app.nav('focus'); } },
    { title: 'Tampilkan widget mini', icon: 'widget', run: () => api('win:widget') },
    { title: 'Backup sekarang', icon: 'download', run: async () => { await api('backup:now'); app.toast('Backup dibuat'); } },
    ...(app.pinSet ? [{ title: 'Kunci aplikasi', icon: 'lock', run: () => app.lock() }] : [])
  ], [app]);

  useEffect(() => {
    let alive = true;
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api('search', q).then((r) => alive && setRes(r)), 120); // debounce typing
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const cmds = commands.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  const items = [
    ...res.map((r) => ({ title: r.title, sub: `${TYPE[r.type][1]} · ${r.sub || ''}`, icon: TYPE[r.type][0], run: () => open(r) })),
    ...cmds.map((c) => ({ ...c, sub: 'Perintah' }))
  ];

  function open(r) {
    if (r.type === 'note') app.nav('notes', { noteId: r.id });
    if (r.type === 'event') app.nav('cal', { date: (r.date || '').slice(0, 10), eventId: r.id });
    if (r.type === 'task') app.nav('focus', { taskId: r.id });
    if (r.type === 'tx') app.nav('fin', { year: Number(r.date.slice(0, 4)), month: Number(r.date.slice(5, 7)) });
  }

  const choose = (it) => { onClose(); it.run(); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && items[idx]) choose(items[idx]);
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-label="Cari & perintah">
        <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Icon name="search" />
          <label className="sr" htmlFor="pal-q">Cari</label>
          <input id="pal-q" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={key} placeholder="Cari catatan, acara, tugas, transaksi, atau ketik perintah…" style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--text)' }} />
          <span className="kbd">Esc</span>
        </div>
        <div style={{ padding: 8, maxHeight: 420, overflow: 'auto' }} role="listbox">
          {items.length === 0 && <div className="empty">Tidak ada hasil untuk “{q}”.</div>}
          {items.map((it, i) => (
            <button key={i} role="option" aria-selected={i === idx} className={`pal-item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => choose(it)}>
              <Icon name={it.icon} />
              <span className="col grow" style={{ gap: 0 }}>
                <span className="ellipsis" style={{ fontWeight: 600 }}>{it.title}</span>
                <span className="mut ellipsis" style={{ fontSize: 12 }}>{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
