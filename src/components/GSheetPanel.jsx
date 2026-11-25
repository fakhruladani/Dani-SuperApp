// Settings → Google Sheets: transactions written to a Google Sheet (e.g. by a WhatsApp assistant)
// are imported into Keuangan. The sheet stays private; an Apps Script web app answers with a key.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Switch, Field } from './ui.jsx';
import { QrScanner } from './SyncPanel.jsx';
import { api, on, useApp } from '../lib/api.js';
import { rupiah, timeAgo } from '../lib/format.js';
import { toLocalDate } from '../../shared/recur.js';
import { parseConnCode, TEMPLATE_URL, GUIDE_URL } from '../../shared/gsheet.js';
import { T } from '../lib/i18n.js';
import SCRIPT from '../../build-res/gsheet-apps-script.gs?raw';

const ERR = {
  URL: () => T('URL harus berupa Web app URL dari Apps Script (https://script.google.com/macros/s/…/exec).'),
  NETWORK: () => T('Tidak bisa menghubungi Google. Periksa koneksi internet.'),
  NOT_JSON: () => T('Google tidak mengirim data. Pastikan Web app di-deploy dengan "Who has access: Anyone" dan URL-nya berakhiran /exec.'),
  KEY: () => T('Kunci salah. Salin lagi kunci dari Execution log Apps Script (fungsi setup).'),
  FORMAT: () => T('Jawaban Apps Script tidak dikenali. Pastikan kodenya sama dengan yang disalin dari sini.'),
  COLUMNS: (m) => T('Kolom wajib tidak ditemukan di baris pertama sheet: {c}. Pakai judul Waktu, Keterangan, Nominal.', { c: m || '' }),
  SCRIPT: () => T('Apps Script mengembalikan galat. Buka Apps Script → Executions untuk detailnya.')
};
const REASON = { DATE: () => T('tanggal tidak terbaca'), DESCRIPTION: () => T('keterangan kosong'), AMOUNT: () => T('nominal tidak terbaca') };
export const gsheetError = (e) => {
  const msg = String(e?.message || e || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const [code, extra] = msg.split(':');
  return (ERR[code] || ERR.SCRIPT)(extra);
};

function Row({ title, desc, children }) {
  return (
    <div className="row wrap" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div className="col grow" style={{ gap: 2, minWidth: 220 }}><strong style={{ fontSize: 14 }}>{title}</strong>{desc && <span className="mut" style={{ fontSize: 13 }}>{desc}</span>}</div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export default function GSheetPanel() {
  const app = useApp();
  const saved = app.settings.gsheet || {};
  const [f, setF] = useState({ url: saved.url || '', key: saved.key || '', since: saved.since || toLocalDate(new Date()), auto: saved.auto !== false });
  const [showKey, setShowKey] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [scan, setScan] = useState(false);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState('');
  const [st, setSt] = useState(null);
  const [guide, setGuide] = useState(!saved.url);
  const load = () => api('gsheet:status').then(setSt);
  useEffect(() => { load(); return on('gsheet:event', load); }, []);
  const dirty = f.url !== (saved.url || '') || f.key !== (saved.key || '') || f.since !== (saved.since || '') || f.auto !== (saved.auto !== false);

  const runTest = async (v = f) => {
    setBusy('test'); setTest(null);
    try { setTest({ ok: true, ...(await api('gsheet:test', v.url, v.key, v.since)) }); }
    catch (e) { setTest({ ok: false, error: gsheetError(e) }); }
    finally { setBusy(''); }
  };
  const applyCode = (raw) => {
    setScan(false);
    const c = parseConnCode(raw);
    if (!c) { setCodeErr(T('Kode tidak dikenali. Salin lagi dari sheet: menu D\'Super App → Hubungkan ke aplikasi.')); return; }
    setCodeErr(''); setCode('');
    const v = { ...f, url: c.url, key: c.key };
    setF(v); runTest(v);
  };
  const save = async () => {
    // rows dated up to today that match a transaction already in the app are linked, not added (no doubles)
    await app.setSetting('gsheet', { url: f.url.trim(), key: f.key.trim(), since: f.since, auto: f.auto, linkUntil: saved.linkUntil || toLocalDate(new Date()) });
    app.toast(T('Pengaturan Google Sheets disimpan')); load();
  };
  const importNow = async () => { setBusy('import'); try { await api('gsheet:import'); } finally { setBusy(''); load(); } };
  const disconnect = async () => {
    if (!(await app.confirm(T('Putuskan Google Sheets? Transaksi yang sudah diimpor tetap ada.'), { danger: true, ok: T('Putuskan') }))) return;
    await app.setSetting('gsheet', { ...saved, url: '', key: '' });
    setF({ ...f, url: '', key: '' }); setTest(null); load();
  };

  const last = st?.last;
  return (
    <>
      <Row title={T('Impor transaksi dari Google Sheets')} desc={T('Setiap baris di sheet (Waktu, Keterangan, Nominal, Jenis, Kategori) masuk ke Keuangan sebagai transaksi. Cocok untuk mencatat lewat asisten chat. Setiap pengguna memakai sheet miliknya sendiri; sheet tetap privat, aplikasi membacanya lewat Apps Script dengan kunci rahasia.')} />
      <div className="col" style={{ gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setGuide(!guide)}><Icon name="book" size="sm" />{guide ? T('Sembunyikan cara menghubungkan') : T('Cara menghubungkan (sekali saja)')}</button>
        {guide && (
          <div className="col" style={{ gap: 8 }}>
            <ol className="mut" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
              <li>{T('Siapkan sheet: buat dari template D\'Super App lalu Make a copy (skrip penghubung sudah ada di dalamnya), atau pakai sheet sendiri: "Salin kode Apps Script", tempel di Extensions → Apps Script, Simpan, lalu muat ulang sheet.')}</li>
              <li>{T('Di Apps Script: Deploy → New deployment → Web app. Execute as: Me, Who has access: Anyone. Izinkan akses, salin Web app URL.')}</li>
              <li>{T('Di sheet: menu D\'Super App → Hubungkan ke aplikasi. Tempel URL tadi, klik Buat kode koneksi.')}</li>
              <li>{T('Tempel kode koneksi di bawah (di HP bisa scan QR-nya), periksa hasil Tes, lalu Simpan.')}</li>
            </ol>
            <span className="mut" style={{ fontSize: 12 }}>{T('Saat mengizinkan akses, Google menampilkan "Google hasn\'t verified this app" karena skripnya milikmu sendiri: pilih Advanced → Go to … (unsafe). "Anyone" hanya berarti URL itu boleh dipanggil; tanpa kunci yang benar jawabannya kosong.')}</span>
            <div className="row wrap">
              <button className="btn sm pri" onClick={() => api('shell:open', TEMPLATE_URL || GUIDE_URL)}><Icon name={TEMPLATE_URL ? 'table' : 'book'} size="sm" />{TEMPLATE_URL ? T('Buat sheet dari template') : T('Panduan lengkap')}</button>
              <button className="btn sm" onClick={() => { api('clipboard:write', SCRIPT); app.toast(T('Kode Apps Script disalin')); }}><Icon name="copy" size="sm" />{T('Salin kode Apps Script')}</button>
            </div>
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <Field label={T('Kode koneksi')}>
          <div className="row">
            <input className="field grow" placeholder="dsa-gs:…" value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(''); if (/^dsa-gs:\S{20,}$/.test(e.target.value.trim())) applyCode(e.target.value); }} spellCheck={false} autoComplete="off" />
            {app.mobile && <button className="btn" onClick={() => setScan(true)}><Icon name="search" size="sm" />{T('Scan QR')}</button>}
          </div>
        </Field>
        {codeErr && <span style={{ color: 'var(--neg)', fontSize: 13 }}>{codeErr}</span>}
        {f.url && !manual && <span className="mut" style={{ fontSize: 12 }}>{T('Terhubung ke: {u}', { u: f.url.replace(/^https:\/\/script\.google\.com\/macros\/s\/(.{6}).*(.{6})\/exec$/, '…/$1…$2/exec') })}</span>}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(!manual)}>{manual ? T('Sembunyikan isian manual') : T('Isi URL dan kunci manual')}</button>
        {manual && <>
          <Field label={T('Web app URL')}><input className="field" placeholder="https://script.google.com/macros/s/…/exec" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} spellCheck={false} /></Field>
          <Field label={T('Kunci rahasia')}>
            <div className="row">
              <input className="field grow" type={showKey ? 'text' : 'password'} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} spellCheck={false} autoComplete="off" />
              <button className="icb" aria-label={showKey ? T('Sembunyikan kunci') : T('Tampilkan kunci')} onClick={() => setShowKey(!showKey)}><Icon name="key" size="sm" /></button>
            </div>
          </Field>
        </>}
        <div className="row wrap" style={{ gap: 16 }}>
          <Field label={T('Impor mulai tanggal')}><input type="date" className="field" value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} style={{ width: 170 }} /></Field>
          <label className="row" style={{ gap: 8, fontSize: 13, alignSelf: 'flex-end', minHeight: 38 }}><Switch on={f.auto} onChange={(v) => setF({ ...f, auto: v })} label={T('Impor otomatis')} />{T('Otomatis: saat aplikasi dibuka dan tiap 5 menit')}</label>
        </div>
        <span className="mut" style={{ fontSize: 12 }}>{T('Baris sebelum tanggal ini dilewati. Baris yang sama persis dengan transaksi yang sudah kamu ketik di aplikasi (tanggal, keterangan, nominal) dihubungkan, tidak ditambah lagi.')}</span>
        <div className="row wrap">
          <button className="btn" disabled={!f.url || !f.key || !!busy} onClick={() => runTest()}><Icon name={busy === 'test' ? 'refresh' : 'search'} size="sm" className={busy === 'test' ? 'spin' : ''} />{T('Tes')}</button>
          <button className="btn pri" disabled={!dirty || !f.url || !f.key} onClick={save}>{T('Simpan')}</button>
          <button className="btn" disabled={!saved.url || dirty || !!busy} onClick={importNow}><Icon name="refresh" size="sm" className={busy === 'import' ? 'spin' : ''} />{T('Sinkron sekarang')}</button>
          {saved.url && <button className="btn danger" onClick={disconnect}>{T('Putuskan')}</button>}
        </div>
        {test && !test.ok && <span style={{ color: 'var(--neg)', fontSize: 13 }}>{test.error}</span>}
        {test?.ok && <TestResult t={test} />}
      </div>
      <Row title={T('Sinkron terakhir')} desc={!last ? T('Belum pernah.') : last.error ? `${timeAgo(last.at)} · ${gsheetError(last.error)}` : `${timeAgo(last.at)} · ${gsheetSummary(last)}`} />
      <Row title={T('Aturan impor')} desc={T('Baris yang sama tidak pernah masuk dua kali. Transaksi yang kamu ubah di aplikasi tidak ditimpa sheet, dan yang kamu hapus tidak muncul lagi. Koreksi di sheet ikut masuk selama transaksinya belum kamu ubah di aplikasi. Aplikasi tidak pernah mengubah isi sheet.')} />
      {scan && <QrScanner prefix="dsa-gs:" title={T('Scan kode koneksi')} hint={T('Arahkan kamera ke QR di dialog "Hubungkan ke aplikasi" pada sheet.')} onResult={applyCode} onClose={() => setScan(false)} />}
    </>
  );
}

/** "2 baru, 1 diperbarui" etc. for a finished import. */
export function gsheetSummary(r) {
  const parts = [T('{a} baru, {u} diperbarui', { a: r.added || 0, u: r.updated || 0 })];
  if (r.linked) parts.push(T('{n} dicocokkan dengan transaksi yang sudah ada', { n: r.linked }));
  if (r.skipped) parts.push(T('{n} baris dilewati', { n: r.skipped }));
  return parts.join(' · ');
}

function TestResult({ t }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <span style={{ fontSize: 13 }}><Icon name="check" size="sm" /> {T('Terhubung ke "{s}": {n} baris terbaca, {a} akan ditambahkan, {u} diperbarui.', { s: t.sheet, n: t.total, a: t.counts.add, u: t.counts.update })}{t.counts.link ? ' ' + T('{n} sudah ada di aplikasi (dicocokkan, tidak digandakan).', { n: t.counts.link }) : ''}</span>
      {t.skipped.length > 0 && <span className="mut" style={{ fontSize: 12 }}>{T('Dilewati:')} {t.skipped.slice(0, 6).map((s) => `${T('baris {r}', { r: s.row })} (${(REASON[s.reason] || REASON.DATE)()})`).join(', ')}{t.skipped.length > 6 ? '…' : ''}</span>}
      {t.preview.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ fontSize: 13 }}>
            <thead><tr><th>{T('Tgl')}</th><th>{T('Keterangan')}</th><th className="r">{T('Nominal')}</th><th>{T('Kategori')}</th><th /></tr></thead>
            <tbody>
              {t.preview.map((x) => (
                <tr key={x.id}>
                  <td className="num">{x.date.slice(5)}</td>
                  <td>{x.description}</td>
                  <td className={`r num ${x.kind === 'in' ? 'up' : 'dn'}`}>{x.kind === 'in' ? '+' : '−'}{rupiah(x.amount)}</td>
                  <td>{x.categoryName || '—'}</td>
                  <td><span className="chip">{x.action === 'add' ? T('baru') : x.action === 'update' ? T('berubah') : x.action === 'link' ? T('cocok') : T('sudah ada')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
