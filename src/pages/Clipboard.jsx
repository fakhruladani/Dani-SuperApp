import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Switch } from '../components/ui.jsx';
import { api, DB, useApp, useQuery } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';

export default function Clipboard() {
  const app = useApp();
  const items = useQuery(() => DB.list('clipboard', { order: 'pinned desc,updated_at desc', limit: 200 }), [], ['clipboard']);
  const [q, setQ] = useState('');
  const on = !!app.settings.clipboardEnabled;
  const shown = (items.data || []).filter((c) => !q || c.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <section className="card pad col" style={{ gap: 12 }}>
        <div className="row wrap">
          <Switch on={on} onChange={(v) => app.setSetting('clipboardEnabled', v)} label="Aktifkan riwayat clipboard" />
          <div className="col grow" style={{ gap: 0 }}>
            <strong>Riwayat clipboard {on ? 'aktif' : 'nonaktif'}</strong>
            <span className="mut" style={{ fontSize: 13 }}>Menyimpan 100 teks terakhir yang kamu salin, terenkripsi di laptop. Matikan saat menyalin kata sandi atau data rahasia.</span>
          </div>
          <button className="btn danger" onClick={async () => { if (await app.confirm('Hapus semua riwayat yang tidak disematkan?', { danger: true, ok: 'Hapus' })) await DB.removeWhere('clipboard', { pinned: { ne: 1 } }); }}><Icon name="trash" size="sm" />Bersihkan</button>
        </div>
        <label className="sr" htmlFor="cq">Cari</label>
        <input id="cq" className="field" placeholder="Cari di riwayat…" value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length === 0 && <div className="empty">{on ? 'Belum ada yang tersalin.' : 'Aktifkan untuk mulai menyimpan riwayat.'}</div>}
        {shown.map((c) => (
          <div key={c.id} className="task" style={{ alignItems: 'flex-start' }}>
            <button className="grow" onClick={async () => { await api('clipboard:write', c.text); app.toast('Disalin ke clipboard'); }} style={{ border: 0, background: 'transparent', textAlign: 'left', color: 'var(--text)', padding: 0, minWidth: 0 }} title="Klik untuk menyalin">
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflow: 'hidden', fontSize: 13.5 }}>{c.text}</div>
              <span className="mut" style={{ fontSize: 11 }}>{timeAgo(new Date(c.updated_at).getTime())} · {c.text.length} karakter</span>
            </button>
            <button className={`icb sm ${c.pinned ? 'on' : ''}`} aria-label={c.pinned ? 'Lepas sematan' : 'Sematkan'} onClick={() => DB.save('clipboard', { id: c.id, pinned: c.pinned ? 0 : 1 })}><Icon name="pinned" size="sm" /></button>
            <button className="icb sm" aria-label="Simpan sebagai catatan" onClick={async () => { const n = await DB.save('notes', { title: c.text.slice(0, 40), content: JSON.stringify({ type: 'doc', content: c.text.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) }), plain: c.text, ink: '[]', pinned: 0 }); app.nav('notes', { noteId: n.id }); }}><Icon name="note" size="sm" /></button>
            <button className="icb sm" aria-label="Hapus" onClick={() => DB.remove('clipboard', c.id)}><Icon name="trash" size="sm" /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
