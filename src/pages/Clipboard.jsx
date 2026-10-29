import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Switch } from '../components/ui.jsx';
import { api, DB, useApp, useQuery } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { T } from '../lib/i18n.js';
import { openMenu } from '../components/ContextMenu.jsx';
import { copyText, clipToNote } from '../lib/menus.js';

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
          <Switch on={on} onChange={(v) => app.setSetting('clipboardEnabled', v)} label={T("Aktifkan riwayat clipboard")} />
          <div className="col grow" style={{ gap: 0 }}>
            <strong>{T("Riwayat clipboard")} {on ? T("aktif") : T("nonaktif")}</strong>
            <span className="mut" style={{ fontSize: 13 }}>{T(
              "Menyimpan 100 teks terakhir yang kamu salin, terenkripsi di laptop. Matikan saat menyalin kata sandi atau data rahasia."
            )}</span>
          </div>
          <button className="btn danger" onClick={async () => { if (await app.confirm(T("Hapus semua riwayat yang tidak disematkan?"), { danger: true, ok: T("Hapus") })) await DB.removeWhere('clipboard', { pinned: { ne: 1 } }); }}><Icon name="trash" size="sm" />{T("Bersihkan")}</button>
        </div>
        <label className="sr" htmlFor="cq">{T("Cari")}</label>
        <input id="cq" className="field" placeholder={T("Cari di riwayat…")} value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length === 0 && <div className="empty">{on ? T("Belum ada yang tersalin.") : T("Aktifkan untuk mulai menyimpan riwayat.")}</div>}
        {shown.map((c) => (
          <div key={c.id} className="task" style={{ alignItems: 'flex-start' }} onContextMenu={(e) => openMenu(e, [
            { label: T('Salin'), icon: 'copy', run: () => copyText(app, c.text) },
            { label: c.pinned ? T('Lepas sematan') : T('Sematkan'), icon: 'pinned', run: () => DB.save('clipboard', { id: c.id, pinned: c.pinned ? 0 : 1 }) },
            { label: T('Simpan sebagai catatan'), icon: 'note', run: () => clipToNote(app, c.text) },
            '-',
            { label: T('Hapus'), icon: 'trash', danger: true, run: () => DB.remove('clipboard', c.id) }
          ])}>
            <button className="grow" onClick={async () => { await api('clipboard:write', c.text); app.toast(T("Disalin ke clipboard")); }} style={{ border: 0, background: 'transparent', textAlign: 'left', color: 'var(--text)', padding: 0, minWidth: 0 }} title={T("Klik untuk menyalin")}>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflow: 'hidden', fontSize: 13.5 }}>{c.text}</div>
              <span className="mut" style={{ fontSize: 11 }}>{timeAgo(new Date(c.updated_at).getTime())} · {T('{n} karakter', { n: c.text.length })}</span>
            </button>
            <button className={`icb sm ${c.pinned ? 'on' : ''}`} aria-label={c.pinned ? T("Lepas sematan") : T("Sematkan")} onClick={() => DB.save('clipboard', { id: c.id, pinned: c.pinned ? 0 : 1 })}><Icon name="pinned" size="sm" /></button>
            <button className="icb sm" aria-label={T("Simpan sebagai catatan")} onClick={() => clipToNote(app, c.text)}><Icon name="note" size="sm" /></button>
            <button className="icb sm" aria-label={T("Hapus")} onClick={() => DB.remove('clipboard', c.id)}><Icon name="trash" size="sm" /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
