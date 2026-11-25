// Settings → Google Sheets: transactions written to a Google Sheet (e.g. by a WhatsApp assistant)
// are imported into Keuangan. The sheet stays private; an Apps Script web app answers with a key.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Switch, Field } from './ui.jsx';
import { api, on, useApp } from '../lib/api.js';
import { rupiah, timeAgo } from '../lib/format.js';
import { toLocalDate } from '../../shared/recur.js';
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
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState('');
  const [st, setSt] = useState(null);
  const [guide, setGuide] = useState(!saved.url);
  const load = () => api('gsheet:status').then(setSt);
  useEffect(() => { load(); return on('gsheet:event', load); }, []);
  const dirty = f.url !== (saved.url || '') || f.key !== (saved.key || '') || f.since !== (saved.since || '') || f.auto !== (saved.auto !== false);

  const runTest = async () => {
    setBusy('test'); setTest(null);
    try { setTest({ ok: true, ...(await api('gsheet:test', f.url, f.key, f.since)) }); }
    catch (e) { setTest({ ok: false, error: gsheetError(e) }); }
    finally { setBusy(''); }
  };
  const save = async () => { await app.setSetting('gsheet', { url: f.url.trim(), key: f.key.trim(), since: f.since, auto: f.auto }); app.toast(T('Pengaturan Google Sheets disimpan')); load(); };
  const importNow = async () => { setBusy('import'); try { await api('gsheet:import'); } finally { setBusy(''); load(); } };

  const last = st?.last;
  return (
    <>
      <Row title={T('Impor transaksi dari Google Sheets')} desc={T('Setiap baris di sheet (Waktu, Keterangan, Nominal, Jenis, Kategori) masuk ke Keuangan sebagai transaksi. Cocok untuk mencatat lewat asisten chat. Sheet tetap privat: aplikasi membacanya lewat Apps Script dengan kunci rahasia.')} />
      <div className="col" style={{ gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setGuide(!guide)}><Icon name="book" size="sm" />{guide ? T('Sembunyikan cara memasang') : T('Cara memasang (sekali saja)')}</button>
        {guide && (
          <div className="col" style={{ gap: 8 }}>
            <ol className="mut" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
              <li>{T('Buka sheet-nya, menu Extensions → Apps Script.')}</li>
              <li>{T('Hapus isi Code.gs, tempel kode dari tombol di bawah, lalu Simpan.')}</li>
              <li>{T('Pilih fungsi "setup", klik Run, izinkan akses. Kunci rahasia muncul di Execution log.')}</li>
              <li>{T('Deploy → New deployment → Web app. Execute as: Me, Who has access: Anyone. Salin Web app URL.')}</li>
              <li>{T('Tempel URL dan kunci di bawah, klik Tes, lalu Simpan.')}</li>
            </ol>
            <span className="mut" style={{ fontSize: 12 }}>{T('"Anyone" hanya berarti URL itu boleh dipanggil. Tanpa kunci yang benar, jawabannya kosong; isi sheet tidak terbuka untuk umum. Apps Script juga mengisi kolom ID agar baris yang sama tidak terimpor dua kali.')}</span>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { api('clipboard:write', SCRIPT); app.toast(T('Kode Apps Script disalin')); }}><Icon name="copy" size="sm" />{T('Salin kode Apps Script')}</button>
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <Field label={T('Web app URL')}><input className="field" placeholder="https://script.google.com/macros/s/…/exec" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} spellCheck={false} /></Field>
        <Field label={T('Kunci rahasia')}>
          <div className="row">
            <input className="field grow" type={showKey ? 'text' : 'password'} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} spellCheck={false} autoComplete="off" />
            <button className="icb" aria-label={showKey ? T('Sembunyikan kunci') : T('Tampilkan kunci')} onClick={() => setShowKey(!showKey)}><Icon name="key" size="sm" /></button>
          </div>
        </Field>
        <div className="row wrap" style={{ gap: 16 }}>
          <Field label={T('Impor mulai tanggal')}><input type="date" className="field" value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} style={{ width: 170 }} /></Field>
          <label className="row" style={{ gap: 8, fontSize: 13, alignSelf: 'flex-end', minHeight: 38 }}><Switch on={f.auto} onChange={(v) => setF({ ...f, auto: v })} label={T('Impor otomatis')} />{T('Otomatis: saat aplikasi dibuka dan tiap 5 menit')}</label>
        </div>
        <span className="mut" style={{ fontSize: 12 }}>{T('Baris sebelum tanggal ini dilewati, misalnya data uji coba.')}</span>
        <div className="row wrap">
          <button className="btn" disabled={!f.url || !f.key || !!busy} onClick={runTest}><Icon name={busy === 'test' ? 'refresh' : 'search'} size="sm" className={busy === 'test' ? 'spin' : ''} />{T('Tes')}</button>
          <button className="btn pri" disabled={!dirty || !f.url || !f.key} onClick={save}>{T('Simpan')}</button>
          <button className="btn" disabled={!saved.url || dirty || !!busy} onClick={importNow}><Icon name="download" size="sm" className={busy === 'import' ? 'spin' : ''} />{T('Impor sekarang')}</button>
        </div>
        {test && !test.ok && <span style={{ color: 'var(--neg)', fontSize: 13 }}>{test.error}</span>}
        {test?.ok && <TestResult t={test} />}
      </div>
      <Row title={T('Impor terakhir')} desc={!last ? T('Belum pernah.') : last.error ? `${timeAgo(last.at)} · ${gsheetError(last.error)}` : `${timeAgo(last.at)} · ${T('{a} baru, {u} diperbarui', { a: last.added, u: last.updated })}${last.skipped ? ' · ' + T('{n} baris dilewati', { n: last.skipped }) : ''}`} />
      <Row title={T('Aturan impor')} desc={T('Baris yang sama tidak pernah masuk dua kali. Transaksi yang kamu ubah di aplikasi tidak ditimpa sheet, dan yang kamu hapus tidak muncul lagi. Koreksi di sheet ikut masuk selama transaksinya belum kamu ubah di aplikasi. Aplikasi tidak pernah mengubah sheet.')} />
    </>
  );
}

function TestResult({ t }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <span style={{ fontSize: 13 }}><Icon name="check" size="sm" /> {T('Terhubung ke "{s}": {n} baris terbaca, {a} akan ditambahkan, {u} diperbarui.', { s: t.sheet, n: t.total, a: t.counts.add, u: t.counts.update })}</span>
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
                  <td><span className="chip">{x.action === 'add' ? T('baru') : x.action === 'update' ? T('berubah') : T('sudah ada')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
