// Settings → Sinkron. Laptop: switch the local sync server on, show the pairing QR code, list paired
// phones. Phone: scan the laptop's QR code, sync now, list paired laptops.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Switch, Modal } from './ui.jsx';
import { api, on, useApp } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { T } from '../lib/i18n.js';

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function Row({ title, desc, children }) {
  return (
    <div className="row wrap" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div className="col grow" style={{ gap: 2, minWidth: 220 }}><strong style={{ fontSize: 14 }}>{title}</strong>{desc && <span className="mut" style={{ fontSize: 13 }}>{desc}</span>}</div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export default function SyncPanel() {
  const app = useApp();
  const [st, setSt] = useState(null);
  const load = () => api('sync:status').then(setSt);
  useEffect(() => { load(); return on('sync:event', () => load()); }, []);
  if (!st) return null;
  return app.android ? <PhoneSync st={st} reload={load} /> : <LaptopSync st={st} reload={load} />;
}

// ---------- laptop ----------
function LaptopSync({ st, reload }) {
  const app = useApp();
  const [pair, setPair] = useState(null);
  const unpair = async (p) => { if (await app.confirm(T('Putuskan {n}? HP itu tidak bisa sinkron lagi sampai dihubungkan ulang.', { n: p.name || 'HP' }), { danger: true, ok: T('Putuskan') })) { await api('sync:unpair', p.id); reload(); } };
  return (
    <>
      <Row title={T('Sinkron dengan HP')} desc={T('HP dan laptop harus di Wi-Fi atau hotspot yang sama. Data dikirim langsung antar perangkat, terenkripsi, tanpa cloud. Sinkron dimulai dari HP: saat aplikasi di HP dibuka dan tiap menit selama terbuka.')}>
        <label className="row" style={{ gap: 8, fontSize: 13 }}>
          <Switch on={st.enabled} onChange={async (v) => { await api('sync:setEnabled', v); reload(); }} label={T('Sinkron dengan HP')} />
          {st.enabled ? (st.running ? T('Aktif') : T('Tidak berjalan')) : T('Mati')}
        </label>
      </Row>
      {st.error && <Row title={T('Server sinkron gagal berjalan')} desc={st.error} />}
      <Row title={T('Hubungkan HP')} desc={T('Tampilkan kode QR, lalu scan dari D\'Super App di HP: Pengaturan → Sinkron → Scan QR laptop.')}>
        <button className="btn pri" onClick={async () => { try { setPair(await api('sync:pairStart')); reload(); } catch (e) { app.toast({ text: errText(e), error: true }); } }}><Icon name="link" size="sm" />{T('Tampilkan kode QR')}</button>
      </Row>
      <Row title={T('HP yang terhubung')} desc={st.peers.length ? null : T('Belum ada.')}>{null}</Row>
      {st.peers.map((p) => (
        <div key={p.id} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <Icon name="bolt" />
          <span className="col grow" style={{ gap: 0 }}><strong>{p.name || 'HP'}</strong><span className="mut" style={{ fontSize: 12 }}>{p.last_sync ? T('Sinkron terakhir {t}', { t: timeAgo(new Date(p.last_sync).getTime()) }) : T('Belum pernah sinkron')}</span></span>
          <button className="btn sm danger" onClick={() => unpair(p)}>{T('Putuskan')}</button>
        </div>
      ))}
      <Row title={T('Kalau HP tidak menemukan laptop')} desc={T('Saat pertama aktif, Windows bisa menanyakan izin jaringan: pilih Izinkan. Jaringan Wi-Fi sebaiknya berprofil Pribadi (Private), bukan Publik. Wi-Fi kantor/kampus sering memblokir koneksi antar perangkat; pakai hotspot HP sebagai gantinya.')} />
      {pair && <PairModal pair={pair} onClose={() => { api('sync:pairStop'); setPair(null); reload(); }} />}
    </>
  );
}

function PairModal({ pair, onClose }) {
  const app = useApp();
  const [svg, setSvg] = useState('');
  const [left, setLeft] = useState(pair.until - Date.now());
  useEffect(() => { import('qrcode').then((Q) => Q.toString(pair.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })).then(setSvg); }, [pair.code]);
  useEffect(() => { const t = setInterval(() => setLeft(pair.until - Date.now()), 1000); return () => clearInterval(t); }, [pair.until]);
  useEffect(() => on('sync:event', (ev) => { if (ev.type === 'paired') { app.toast(T('{n} terhubung. Sinkron pertama berjalan…', { n: ev.name || 'HP' })); onClose(); } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (left <= 0) onClose(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = Math.max(0, Math.floor(left / 60000)), ss = Math.max(0, Math.floor(left / 1000) % 60);
  return (
    <Modal title={T('Hubungkan HP')} width={460} onClose={onClose}>
      <ol className="mut" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        <li>{T('Sambungkan HP ke Wi-Fi atau hotspot yang sama dengan laptop.')}</li>
        <li>{T('Di HP buka D\'Super App → Pengaturan → Sinkron → Scan QR laptop.')}</li>
        <li>{T('Arahkan kamera ke kode ini.')}</li>
      </ol>
      <div className="qr-box" aria-label={T('Kode QR untuk menghubungkan HP')} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="row mut" style={{ fontSize: 12, justifyContent: 'space-between' }}>
        <span>{pair.name} · {pair.addrs.join(', ') || T('tidak ada jaringan')}</span>
        <span className="num">{T('Berlaku {t}', { t: `${mm}:${String(ss).padStart(2, '0')}` })}</span>
      </div>
      {!pair.addrs.length && <span style={{ color: 'var(--neg)', fontSize: 13 }}>{T('Laptop belum tersambung ke jaringan mana pun.')}</span>}
      <button className="btn sm ghost" onClick={() => { api('clipboard:write', pair.code); app.toast(T('Kode disalin. Kirim ke HP lalu pilih "Tempel kode".')); }}><Icon name="copy" size="sm" />{T('Salin kode (kalau kamera tidak bisa)')}</button>
    </Modal>
  );
}

// ---------- phone ----------
function PhoneSync({ st, reload }) {
  const app = useApp();
  const [scan, setScan] = useState(false);
  const [paste, setPaste] = useState(null);
  const [busy, setBusy] = useState(false);
  const pairWith = async (code) => {
    setScan(false); setPaste(null); setBusy(true);
    try { await api('sync:pair', code); app.toast(T('Terhubung dan tersinkron dengan laptop')); }
    catch (e) { app.toast({ text: /not a D'Super|unsupported/.test(errText(e)) ? T('Itu bukan kode QR D\'Super App.') : T('Laptop tidak terjangkau. Pastikan satu Wi-Fi, sinkron di laptop aktif, dan kode QR masih terbuka.'), error: true }); }
    finally { setBusy(false); reload(); }
  };
  const now = async () => { setBusy(true); try { await api('sync:now'); } finally { setBusy(false); reload(); } };
  const unpair = async (p) => { if (await app.confirm(T('Putuskan {n}? Data di HP ini tetap ada.', { n: p.name || 'laptop' }), { danger: true, ok: T('Putuskan') })) { await api('sync:unpair', p.id); reload(); } };
  const status = st.syncing || busy ? T('Menyinkronkan…') : st.lastError === 'OFFLINE' ? T('Laptop tidak terjangkau (beda jaringan, laptop mati, atau sinkron di laptop dimatikan).') : st.lastError === 'UNPAIRED' ? T('Laptop menolak: HP ini sudah diputus di laptop. Hubungkan ulang.') : st.lastAt ? T('Tersinkron {t}', { t: timeAgo(st.lastAt) }) : '';
  return (
    <>
      <Row title={T('Sinkron dengan laptop')} desc={T('Satu aplikasi di HP dan laptop: perubahan di salah satunya ikut ke yang lain saat keduanya di Wi-Fi atau hotspot yang sama. Langsung antar perangkat, terenkripsi, tanpa cloud.')} />
      {st.peers.map((p) => (
        <div key={p.id} className="col" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
          <div className="row">
            <Icon name="widget" />
            <span className="col grow" style={{ gap: 0 }}><strong>{p.name || 'Laptop'}</strong><span className="mut" style={{ fontSize: 12 }}>{status || (p.last_sync ? T('Sinkron terakhir {t}', { t: timeAgo(new Date(p.last_sync).getTime()) }) : '')}</span></span>
          </div>
          <div className="row">
            <button className="btn pri grow" disabled={busy || st.syncing} onClick={now}><Icon name="refresh" size="sm" className={busy || st.syncing ? 'spin' : ''} />{T('Sinkron sekarang')}</button>
            <button className="btn danger" onClick={() => unpair(p)}>{T('Putuskan')}</button>
          </div>
        </div>
      ))}
      <Row title={st.peers.length ? T('Hubungkan laptop lain') : T('Hubungkan ke laptop')} desc={T('Di laptop: Pengaturan → Sinkron HP → Tampilkan kode QR. Saat pertama kali, isi awal HP ini diganti dengan data laptop.')}>
        <button className="btn pri" disabled={busy} onClick={() => setScan(true)}><Icon name="search" size="sm" />{T('Scan QR laptop')}</button>
        <button className="btn" disabled={busy} onClick={() => setPaste('')}>{T('Tempel kode')}</button>
      </Row>
      {scan && <QrScanner onResult={pairWith} onClose={() => setScan(false)} />}
      {paste != null && (
        <Modal title={T('Tempel kode')} width={440} onClose={() => setPaste(null)} footer={<button className="btn pri" disabled={!paste.trim()} onClick={() => pairWith(paste.trim())}>{T('Hubungkan')}</button>}>
          <textarea className="field" rows={4} autoFocus placeholder="dsa-sync:…" value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Modal>
      )}
    </>
  );
}

/** Camera + jsQR. Resolves with the first dsa-sync: code it sees. */
function QrScanner({ onResult, onClose }) {
  const video = useRef();
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream = null, raf = 0, alive = true, jsQR = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (!alive) return;
      const v = video.current;
      if (v && v.readyState >= 2 && jsQR) {
        const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 480;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data?.startsWith('dsa-sync:')) { alive = false; onResult(code.data); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) return;
        video.current.srcObject = stream;
        await video.current.play();
        tick();
      } catch (e) { setErr(/NotAllowed|Permission/i.test(String(e?.name || e)) ? T('Izin kamera ditolak. Izinkan kamera untuk D\'Super App di pengaturan Android, atau pakai "Tempel kode".') : T('Kamera tidak bisa dibuka: {e}', { e: String(e?.message || e) })); }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={T('Scan QR laptop')} width={460} onClose={onClose}>
      {err ? <span style={{ color: 'var(--neg)', fontSize: 13 }}>{err}</span> : (
        <div className="qr-cam"><video ref={video} playsInline muted /><span className="qr-frame" /></div>
      )}
      <span className="mut" style={{ fontSize: 13 }}>{T('Arahkan kamera ke kode QR di layar laptop.')}</span>
    </Modal>
  );
}
