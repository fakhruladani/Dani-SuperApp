import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Switch, Seg, Field, Modal, Spinner } from '../components/ui.jsx';
import { api, useApp, useQuery } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';

function Row({ title, desc, children }) {
  return (
    <div className="row wrap" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div className="col grow" style={{ gap: 2, minWidth: 240 }}><strong style={{ fontSize: 14 }}>{title}</strong>{desc && <span className="mut" style={{ fontSize: 13 }}>{desc}</span>}</div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

function Location() {
  const app = useApp();
  const loc = app.settings.location || {};
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api('place:search', q).then(setRes, () => setRes([])), 350);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (p) => { app.setSetting('location', { name: p.name, lat: p.lat, lon: p.lon, manual: true }); setQ(''); setRes([]); app.toast('Lokasi diperbarui'); };
  const detect = async () => {
    setBusy('gps');
    const viaGps = () => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, { timeout: 9000, maximumAge: 300000 }));
    try {
      const c = await viaGps();
      const name = await api('place:reverse', c.latitude, c.longitude);
      app.setSetting('location', { name, lat: c.latitude, lon: c.longitude, manual: false });
      app.toast('Lokasi terdeteksi: ' + name);
    } catch {
      try {
        const ip = await api('place:ip');
        app.setSetting('location', { ...ip, manual: false });
        app.toast('Lokasi Windows tidak tersedia — memakai perkiraan dari IP: ' + ip.name);
      } catch { app.toast({ text: 'Gagal mendeteksi lokasi', error: true }); }
    }
    setBusy('');
  };
  return (
    <Row title="Lokasi untuk cuaca" desc={`Sekarang: ${loc.name || '—'}${loc.manual === false ? ' (terdeteksi otomatis)' : ''}`}>
      <div className="col" style={{ gap: 6, position: 'relative' }}>
        <div className="row">
          <label className="sr" htmlFor="loc-q">Cari kota/kecamatan</label>
          <input id="loc-q" className="field" placeholder="Cari kota / kecamatan…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <button className="btn" onClick={detect} disabled={!!busy}>{busy ? <Spinner /> : <Icon name="pin" size="sm" />}Deteksi</button>
        </div>
        {res.length > 0 && (
          <div className="card col" style={{ position: 'absolute', top: 44, left: 0, width: 360, zIndex: 5, padding: 6, gap: 2, boxShadow: 'var(--shadow-lg)' }}>
            {res.map((p, i) => <button key={i} className="pal-item" onClick={() => pick(p)}><Icon name="pin" size="sm" /><span className="col" style={{ gap: 0 }}><strong>{p.name}</strong><span className="mut" style={{ fontSize: 12 }}>{p.detail}</span></span></button>)}
          </div>
        )}
      </div>
    </Row>
  );
}

function Security() {
  const app = useApp();
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({ old: '', pin: '', pin2: '' });
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const savePin = async () => {
    setErr('');
    if (modal === 'set' && (f.pin !== f.pin2)) { setErr('PIN konfirmasi tidak sama'); return; }
    try { await api('pin:set', f.old, modal === 'remove' ? '' : f.pin); app.toast(modal === 'remove' ? 'PIN dihapus' : 'PIN disimpan'); setModal(null); setF({ old: '', pin: '', pin2: '' }); }
    catch (e) { setErr(e.message.replace(/^Error invoking remote method 'invoke': Error: /, '')); }
  };
  const showKey = async () => {
    setErr('');
    try { setKey(await api('recovery:key', f.old)); } catch (e) { setErr(e.message.replace(/^Error invoking remote method 'invoke': Error: /, '')); }
  };
  return (
    <>
      <Row title="Kunci aplikasi dengan PIN" desc={app.pinSet ? 'PIN aktif. Aplikasi terkunci saat dibuka, saat Windows dikunci, dan setelah tidak aktif.' : 'Belum ada PIN.'}>
        {app.pinSet ? <><button className="btn" onClick={() => setModal('set')}>Ganti PIN</button><button className="btn danger" onClick={() => setModal('remove')}>Hapus PIN</button></> : <button className="btn pri" onClick={() => setModal('set')}><Icon name="lock" size="sm" />Pasang PIN</button>}
      </Row>
      {app.pinSet && (
        <Row title="Kunci otomatis setelah tidak aktif">
          <select className="field" aria-label="Kunci otomatis" value={app.settings.lockAfterMin || 0} onChange={(e) => app.setSetting('lockAfterMin', Number(e.target.value))} style={{ width: 180 }}>
            <option value={0}>Tidak pernah</option><option value={5}>5 menit</option><option value={15}>15 menit</option><option value={30}>30 menit</option><option value={60}>1 jam</option>
          </select>
        </Row>
      )}
      <Row title="Kunci pemulihan" desc="Data dienkripsi AES-256 dan kuncinya dilindungi akun Windows (DPAPI). Simpan kunci pemulihan ini di tempat aman untuk memulihkan backup di laptop/akun Windows lain.">
        <button className="btn" onClick={() => { setKey(''); setModal('key'); }}><Icon name="key" size="sm" />Tampilkan kunci</button>
      </Row>
      {modal && (
        <Modal title={modal === 'key' ? 'Kunci pemulihan' : modal === 'remove' ? 'Hapus PIN' : 'Atur PIN'} width={440} onClose={() => { setModal(null); setKey(''); setErr(''); }} footer={modal !== 'key' ? <button className="btn pri" onClick={savePin}>Simpan</button> : !key ? <button className="btn pri" onClick={showKey}>Tampilkan</button> : null}>
          {(app.pinSet) && !key && <Field label="PIN sekarang"><input className="field" type="password" inputMode="numeric" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} /></Field>}
          {modal === 'set' && <>
            <Field label="PIN baru (4–8 angka)"><input className="field" type="password" inputMode="numeric" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></Field>
            <Field label="Ulangi PIN baru"><input className="field" type="password" inputMode="numeric" value={f.pin2} onChange={(e) => setF({ ...f, pin2: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></Field>
            <span className="mut" style={{ fontSize: 12 }}>PIN mengunci tampilan aplikasi. Pengingat tetap berjalan walau aplikasi terkunci.</span>
          </>}
          {modal === 'key' && key && <>
            <code style={{ display: 'block', padding: 14, background: 'var(--surface2)', borderRadius: 10, fontSize: 14, wordBreak: 'break-all', lineHeight: 1.7 }}>{key}</code>
            <button className="btn" onClick={() => { api('clipboard:write', key); app.toast('Kunci disalin'); }}><Icon name="copy" size="sm" />Salin</button>
            <span className="mut" style={{ fontSize: 12 }}>Siapa pun yang memegang kunci ini dan file backup bisa membuka datamu. Jangan bagikan.</span>
          </>}
          {modal === 'key' && !key && !app.pinSet && <span className="mut">Klik Tampilkan untuk melihat kunci.</span>}
          {err && <span className="dn" style={{ fontWeight: 600 }}>{err}</span>}
        </Modal>
      )}
    </>
  );
}

function Backup() {
  const app = useApp();
  const info = useQuery(() => api('app:info'), []);
  const list = useQuery(() => api('backup:list'), [], ['settings']);
  const [need, setNeed] = useState(null);
  const [key, setKey] = useState('');
  const restore = async (path, k) => {
    if (!k && !(await app.confirm('Pulihkan data dari backup ini? Data sekarang akan diganti (backup otomatis dibuat dulu).', { ok: 'Pulihkan', danger: true }))) return;
    const r = await api('backup:restore', path || null, k || null);
    if (r.needKey) { setNeed(r.path); return; }
    if (r.error) { app.toast({ text: r.error, error: true }); return; }
    if (r.ok) { setNeed(null); app.toast('Data dipulihkan'); app.reloadSettings(); }
  };
  return (
    <>
      <Row title="Backup otomatis harian" desc={`Folder: ${info.data?.backupDir || '…'} · menyimpan ${app.settings.backupKeep || 14} file terakhir${app.settings['backup.last'] ? ` · terakhir ${timeAgo(new Date(app.settings['backup.last']).getTime())}` : ''}`}>
        <button className="btn" onClick={async () => { await api('backup:now'); list.reload(); app.toast('Backup dibuat'); app.reloadSettings(); }}><Icon name="download" size="sm" />Backup sekarang</button>
        <button className="btn" onClick={async () => { const d = await api('backup:chooseDir'); if (d) { info.reload(); list.reload(); } }}><Icon name="folder" size="sm" />Ganti folder</button>
        <button className="btn ghost" onClick={() => api('backup:openDir')}>Buka folder</button>
      </Row>
      <Row title="Jumlah backup disimpan">
        <select className="field" aria-label="Jumlah backup" value={app.settings.backupKeep || 14} onChange={(e) => app.setSetting('backupKeep', Number(e.target.value))} style={{ width: 140 }}>{[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} file</option>)}</select>
      </Row>
      <Row title="Pulihkan dari backup" desc={`${(list.data || []).length} backup tersedia. Saran: arahkan folder backup ke OneDrive/Google Drive atau flashdisk.`}>
        <button className="btn" onClick={() => restore(null)}><Icon name="upload" size="sm" />Pilih file…</button>
      </Row>
      {(list.data || []).slice(0, 5).map((b) => (
        <div key={b.path} className="row" style={{ padding: '6px 0', fontSize: 13 }}>
          <Icon name="folder" size="sm" className="mut" /><span className="grow num">{b.name}</span><span className="mut">{Math.round(b.size / 1024)} KB · {timeAgo(b.mtime)}</span>
          <button className="btn sm" onClick={() => restore(b.path)}>Pulihkan</button>
        </div>
      ))}
      {need && (
        <Modal title="Butuh kunci pemulihan" width={460} onClose={() => setNeed(null)} footer={<button className="btn pri" onClick={() => restore(need, key)}>Pulihkan</button>}>
          <span>Backup ini dibuat di laptop/akun Windows lain. Masukkan kunci pemulihan dari Pengaturan → Keamanan di perangkat asal.</span>
          <input className="field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="xxxxxxxx-xxxxxxxx-…" aria-label="Kunci pemulihan" />
        </Modal>
      )}
    </>
  );
}

function Feeds() {
  const app = useApp();
  const feeds = useQuery(() => api('news:feeds'), [], ['settings']);
  const [nf, setNf] = useState({ name: '', url: '', cat: 'fin' });
  const save = (list) => app.setSetting('feeds', list);
  const list = feeds.data || [];
  return (
    <>
      {['fin', 'id'].map((cat) => (
        <div key={cat} className="col" style={{ gap: 4, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <strong>{cat === 'fin' ? 'Berita finance' : 'Berita Indonesia'}</strong>
          {list.filter((f) => f.cat === cat).map((f) => (
            <div key={f.id} className="row" style={{ fontSize: 13 }}>
              <Switch on={f.on} onChange={(v) => save(list.map((x) => (x.id === f.id ? { ...x, on: v } : x)))} label={f.name} />
              <span className="grow"><strong>{f.name}</strong> <span className="mut">{f.url}</span></span>
              {f.custom && <button className="icb sm" aria-label={`Hapus ${f.name}`} onClick={() => save(list.filter((x) => x.id !== f.id))}><Icon name="trash" size="sm" /></button>}
            </div>
          ))}
        </div>
      ))}
      <div className="row wrap" style={{ paddingTop: 10 }}>
        <input className="field" placeholder="Nama sumber" aria-label="Nama sumber" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} style={{ width: 170 }} />
        <input className="field" placeholder="https://…/rss" aria-label="URL RSS" value={nf.url} onChange={(e) => setNf({ ...nf, url: e.target.value })} style={{ width: 280 }} />
        <select className="field" aria-label="Kategori" value={nf.cat} onChange={(e) => setNf({ ...nf, cat: e.target.value })} style={{ width: 130 }}><option value="fin">Finance</option><option value="id">Indonesia</option></select>
        <button className="btn" onClick={() => { if (!/^https?:\/\//.test(nf.url) || !nf.name) return; save([...list, { ...nf, id: 'c' + Date.now(), on: true, custom: true }]); setNf({ name: '', url: '', cat: nf.cat }); }}><Icon name="plus" size="sm" />Tambah RSS</button>
        <button className="btn ghost" onClick={async () => save(await api('news:defaultFeeds'))}>Kembalikan default</button>
      </div>
    </>
  );
}

export default function Settings() {
  const app = useApp();
  const s = app.settings;
  const info = useQuery(() => api('app:info'), []);
  const [tab, setTab] = useState('umum');
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <Seg label="Bagian pengaturan" value={tab} onChange={setTab} options={[{ value: 'umum', label: 'Umum' }, { value: 'notif', label: 'Pengingat & fokus' }, { value: 'keamanan', label: 'Keamanan' }, { value: 'backup', label: 'Backup & data' }, { value: 'berita', label: 'Berita & market' }]} />
      <section className="card pad">
        {tab === 'umum' && <>
          <Row title="Tema" desc="Ikuti Windows, atau paksa terang/gelap."><Seg label="Tema" value={s.theme || 'system'} onChange={(v) => app.setSetting('theme', v)} options={[{ value: 'system', label: 'Ikuti sistem' }, { value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} /></Row>
          <Row title="Jalankan saat Windows menyala" desc="Aplikasi mulai tersembunyi di tray, pengingat langsung aktif."><Switch on={s.autostart !== false} onChange={(v) => app.setSetting('autostart', v)} label="Auto-start" /></Row>
          <Row title="Tutup ke tray" desc="Tombol × menyembunyikan jendela; aplikasi tetap berjalan untuk pengingat. Keluar penuh lewat ikon tray."><Switch on={s.closeToTray !== false} onChange={(v) => app.setSetting('closeToTray', v)} label="Tutup ke tray" /></Row>
          <Location />
          <Row title="Pintasan catatan cepat" desc="Membuka jendela kecil dari mana saja untuk mencatat tugas/catatan/transaksi.">
            <select className="field" aria-label="Pintasan" value={s.quickShortcut} onChange={(e) => app.setSetting('quickShortcut', e.target.value)} style={{ width: 240 }}>
              {['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+N', 'CommandOrControl+Shift+Q', 'Alt+Space'].map((k) => <option key={k} value={k}>{k.replace('CommandOrControl', 'Ctrl')}</option>)}
            </select>
          </Row>
          <Row title="Pintasan keyboard" desc="Ctrl+K cari & perintah · Ctrl+1–7 pindah menu · Ctrl+, pengaturan · Ctrl+L kunci · di catatan: Ctrl+B/I/U, Ctrl+Shift+S coret, Ctrl+± zoom" />
        </>}
        {tab === 'notif' && <>
          <Row title="Pengingat default acara baru">
            <select className="field" aria-label="Pengingat default" value={s.reminderDefault ?? 30} onChange={(e) => app.setSetting('reminderDefault', Number(e.target.value))} style={{ width: 200 }}>
              {[[-1, 'Tanpa pengingat'], [0, 'Saat dimulai'], [10, '10 menit sebelum'], [15, '15 menit sebelum'], [30, '30 menit sebelum'], [60, '1 jam sebelum']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Row>
          <Row title="Ringkasan pagi" desc="Notifikasi berisi agenda, tugas, cuaca, dan sisa anggaran. Muncul sekali sehari saat laptop aktif (sampai jam 12.00).">
            <Switch on={s.briefEnabled !== false} onChange={(v) => app.setSetting('briefEnabled', v)} label="Ringkasan pagi" />
            <input type="time" className="field" aria-label="Jam ringkasan" value={s.briefTime || '07:00'} onChange={(e) => app.setSetting('briefTime', e.target.value)} style={{ width: 120 }} />
          </Row>
          <Row title="Durasi Pomodoro (menit)" desc="Fokus · istirahat pendek · istirahat panjang (setiap 4 sesi)">
            {[['focusMin', 25], ['shortMin', 5], ['longMin', 15]].map(([k, d]) => <input key={k} type="number" min={1} max={180} className="field num" aria-label={k} value={s[k] || d} onChange={(e) => app.setSetting(k, Math.max(1, Number(e.target.value) || d))} style={{ width: 80 }} />)}
          </Row>
          <Row title="Tes notifikasi" desc="Pastikan Windows mengizinkan notifikasi dari Dani SuperApp (Pengaturan Windows → Sistem → Notifikasi) dan Focus Assist / Jangan Ganggu tidak aktif.">
            <button className="btn" onClick={() => { try { new Notification('Tes notifikasi', { body: 'Notifikasi Dani SuperApp berfungsi.' }); } catch { app.toast({ text: 'Notifikasi tidak didukung', error: true }); } }}><Icon name="bell" size="sm" />Kirim tes</button>
          </Row>
        </>}
        {tab === 'keamanan' && <Security />}
        {tab === 'backup' && <>
          <Backup />
          <Row title="Lokasi data" desc={`${info.data?.dataDir || ''} · enkripsi kunci via Windows: ${info.data?.encrypted ? 'aktif' : 'tidak tersedia'}`} />
          <Row title="Versi" desc={`Dani SuperApp ${info.data?.version || ''}`} />
        </>}
        {tab === 'berita' && <>
          <Row title="Interval pembaruan market & alert harga">
            <select className="field" aria-label="Interval market" value={s.marketRefreshSec || 120} onChange={(e) => app.setSetting('marketRefreshSec', Number(e.target.value))} style={{ width: 160 }}>{[[60, '1 menit'], [120, '2 menit'], [300, '5 menit'], [900, '15 menit']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Row>
          <Feeds />
        </>}
      </section>
    </div>
  );
}
