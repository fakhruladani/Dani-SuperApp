import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Icon from './Icon.jsx';
import { Modal, Seg, Field } from './ui.jsx';
import Resizer, { usePanelWidth } from './Resizer.jsx';
import { openMenu } from './ContextMenu.jsx';
import { api, DB, useApp, useQuery, themeColors } from '../lib/api.js';
import { rupiah, parseAmount } from '../lib/format.js';
import { wealthMatrix, parseWealthTable, assetKey } from '../../shared/wealth.js';
import { toLocalDate, parseLocal, fmtDateLong, MONTH_SHORT, addDays } from '../../shared/recur.js';
import { T } from '../lib/i18n.js';

// Total Wealth as a spreadsheet: one row per date, one column per account, total per row,
// and a chart of the total over time (x axis proportional to the real dates).

const fmtNum = (v) => (v == null ? '' : (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('id-ID'));
const parseCell = (s) => (String(s).trim() === '' ? null : (/^\s*[-−]/.test(String(s)) ? -1 : 1) * parseAmount(s));
const shortDate = (d, withYear) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${withYear ? " '" + String(d.getFullYear()).slice(2) : ''}`;
const pctText = (p) => (p == null ? '' : ` (${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%)`);
// distinct hues for the stacked chart (theme colors repeat warm tones)
const STACK = ['#2459D6', '#E8590C', '#0F9D58', '#9333EA', '#DB2777', '#0891B2', '#CA8A04', '#64748B', '#DC2626', '#4F46E5', '#65A30D', '#0D9488'];
const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** One editable value. Empty = no value on this date (the previous value carries forward, shown faded). */
function Cell({ cell, onCommit, id }) {
  const own = cell.row ? Number(cell.row.value) : null;
  const [txt, setTxt] = useState(fmtNum(own));
  useEffect(() => { setTxt(fmtNum(own)); }, [own]);
  const commit = () => {
    const v = parseCell(txt);
    if (v === own) return;
    onCommit(v);
  };
  return (
    <input id={id} inputMode="numeric" className={`cell num ws-cell ${cell.carried ? 'carried' : ''}`} value={txt}
      placeholder={cell.carried ? fmtNum(cell.value) : ''}
      title={cell.carried ? T('Sama dengan tanggal sebelumnya. Ketik untuk mengisi nilai baru.') : undefined}
      onChange={(e) => { const neg = /^\s*[-−]/.test(e.target.value); const n = parseAmount(e.target.value); setTxt(e.target.value.trim() === '' ? '' : n ? (neg ? '-' : '') + n.toLocaleString('id-ID') : neg ? '-' : '0'); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); moveFocus(e.currentTarget, e.shiftKey ? -1 : 1, 'row'); }
        if (e.key === 'Escape') { setTxt(fmtNum(own)); e.currentTarget.blur(); }
      }}
      style={{ color: cell.row && own < 0 ? 'var(--neg)' : undefined }} />
  );
}

// Enter moves down a row, like a spreadsheet
function moveFocus(el, dir) {
  const td = el.closest('td'); const tr = td?.parentElement;
  if (!tr) return;
  const i = [...tr.children].indexOf(td);
  const next = (dir > 0 ? tr.nextElementSibling : tr.previousElementSibling)?.children[i]?.querySelector('input');
  next?.focus();
  next?.select?.();
}

function ColumnModal({ initial, categories, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ name: initial.name || '', category: initial.category || '' });
  const isNew = !initial.key;
  const save = async () => {
    const name = f.name.trim(), category = f.category.trim();
    if (!name) { app.toast({ text: T('Nama akun wajib diisi'), error: true }); return; }
    const cols = (app.settings.wealthCols || []).slice();
    const key = assetKey({ name, category });
    if (isNew) {
      if (cols.some((c) => assetKey(c) === key) || initial.existing?.has(key)) { app.toast({ text: T('Akun ini sudah ada'), error: true }); return; }
      cols.push({ name, category });
    } else {
      const i = cols.findIndex((c) => assetKey(c) === initial.key);
      if (i >= 0) cols[i] = { name, category }; else cols.push({ name, category });
      if (key !== initial.key) await api('wealth:renameCol', { name: initial.name, category: initial.category }, { name, category });
    }
    await app.setSetting('wealthCols', cols.filter((c, j) => cols.findIndex((x) => assetKey(x) === assetKey(c)) === j));
    onClose();
  };
  return (
    <Modal title={isNew ? T('Akun baru') : T('Edit akun')} width={440} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{T('Batal')}</button>
      <button className="btn pri" onClick={save}>{T('Simpan')}</button>
    </>}>
      <Field label={T('Nama akun / kolom')}><input className="field" autoFocus value={f.name} placeholder={T('mis. Bank Jago/Gopay')} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
      <Field label={T('Kategori (opsional)')} hint={T('Untuk rincian per kategori, mis. Bank, E-wallet, Investasi, Utang.')}>
        <input className="field" list="ws-cats" value={f.category} placeholder={T('mis. Investasi')} onChange={(e) => setF({ ...f, category: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <datalist id="ws-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
    </Modal>
  );
}

function ImportModal({ onClose }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [order, setOrder] = useState('auto');
  const p = useMemo(() => parseWealthTable(text, order), [text, order]);
  const fromClipboard = async () => setText(await api('clipboard:read'));
  const fromFile = async () => { try { const t = await api('file:readText'); if (t != null) setText(t); } catch (e) { app.toast({ text: errText(e), error: true }); } };
  const run = async () => {
    const cells = p.rows.flatMap((r) => Object.entries(r.values).map(([name, value]) => ({ date: r.date, name, category: '', value })));
    const n = await api('wealth:import', cells);
    const cols = (app.settings.wealthCols || []).slice();
    for (const name of p.columns) if (!cols.some((c) => assetKey(c) === assetKey({ name, category: '' }))) cols.push({ name, category: '' });
    await app.setSetting('wealthCols', cols);
    app.toast(T('{n} nilai diimpor dari {r} tanggal', { n, r: p.rows.length }));
    onClose();
  };
  const sample = p.rows.slice(0, 3);
  return (
    <Modal title={T('Impor dari spreadsheet')} width={720} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{T('Batal')}</button>
      <button className="btn pri" disabled={!p.rows.length} onClick={run}>{T('Impor {n} tanggal', { n: p.rows.length })}</button>
    </>}>
      <span className="mut" style={{ fontSize: 13, lineHeight: 1.5 }}>{T('Salin tabel dari Google Sheets/Excel (kolom pertama tanggal, kolom lain akun), lalu tempel di sini. Kolom Total dilewati karena dihitung otomatis. Nilai di tanggal yang sama akan ditimpa.')}</span>
      <div className="row wrap">
        <button className="btn sm" onClick={fromClipboard}><Icon name="paste" size="sm" />{T('Tempel dari clipboard')}</button>
        <button className="btn sm" onClick={fromFile}><Icon name="upload" size="sm" />{T('Pilih file CSV…')}</button>
        <span className="grow" />
        <Seg label={T('Format tanggal')} value={order} onChange={setOrder} options={[{ value: 'auto', label: T('Otomatis') }, { value: 'dmy', label: 'D/M/Y' }, { value: 'mdy', label: 'M/D/Y' }]} />
      </div>
      <textarea className="field" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Tanggal\tBank Jago/Gopay\tBank BNI\tCash\n1/3/2026\tRp1.430.807\tRp1.050.789\tRp439.400'} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
      {text.trim() && (
        <div className="col" style={{ gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {T('Terbaca: {r} tanggal, {c} akun', { r: p.rows.length, c: p.columns.length })} · {T('format tanggal')} {p.order === 'mdy' ? 'M/D/Y' : 'D/M/Y'}
            {p.skipped ? <span className="dn"> · {T('{n} baris dilewati (tanggal tidak valid)', { n: p.skipped })}</span> : null}
          </span>
          {sample.length > 0 && (
            <div style={{ overflow: 'auto', maxHeight: 160, border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>{T('Tanggal')}</th>{p.columns.map((c) => <th key={c} className="r">{c}</th>)}</tr></thead>
                <tbody>{sample.map((r) => <tr key={r.date}><td className="num">{fmtDateLong(parseLocal(r.date))}</td>{p.columns.map((c) => <td key={c} className="r num">{fmtNum(r.values[c])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TrendChart({ m, C }) {
  const app = useApp();
  const [range, setRange] = useState(app.settings.wealthRange || 'all');
  const [mode, setMode] = useState(app.settings.wealthChart || 'total');
  const last = m.snaps.at(-1)?.date;
  const cutoff = !last || range === 'all' ? null : toLocalDate(addDays(parseLocal(last), -{ '3m': 92, '6m': 183, '1y': 366 }[range]));
  const shown = m.snaps.filter((s) => !cutoff || s.date >= cutoff);
  const data = shown.map((s) => {
    const o = { t: parseLocal(s.date).getTime(), date: s.date, total: s.total, delta: s.delta, pct: s.pct };
    m.columns.forEach((c) => { o[c.key] = Math.max(0, s.cells[c.key].value || 0); });
    return o;
  });
  const spanYears = data.length > 1 && new Date(data[0].t).getFullYear() !== new Date(data.at(-1).t).getFullYear();
  // tick at the real snapshot dates, thinned so labels do not collide
  const step = Math.max(1, Math.ceil(data.length / 8));
  const ticks = data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d) => d.t);
  const domain = data.length === 1 ? [data[0].t - 86400000 * 15, data[0].t + 86400000 * 15] : ['dataMin', 'dataMax'];
  const first = shown[0], end = shown.at(-1);
  const growth = first && end && shown.length > 1 ? end.total - first.total : null;
  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="card" style={{ padding: '8px 12px', fontSize: 13, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontWeight: 700 }}>{fmtDateLong(parseLocal(d.date))}</div>
        <div className="num" style={{ fontSize: 16, fontWeight: 800 }}>{rupiah(d.total)}</div>
        {d.delta != null && <div className={`num ${d.delta >= 0 ? 'up' : 'dn'}`} style={{ fontWeight: 700 }}>{rupiah(d.delta, { sign: true })}{pctText(d.pct)}</div>}
        {mode === 'stack' && m.columns.filter((c) => d[c.key]).map((c) => <div key={c.key} className="row mut" style={{ gap: 12, fontSize: 12 }}><span className="grow">{c.name}</span><span className="num">{fmtNum(d[c.key])}</span></div>)}
      </div>
    );
  };
  return (
    <section className="card pad col" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="col grow" style={{ gap: 0 }}>
          <h2 className="h2">{T('Perkembangan total kekayaan')}</h2>
          {growth != null && <span className={`num ${growth >= 0 ? 'up' : 'dn'}`} style={{ fontSize: 13, fontWeight: 700 }}>{rupiah(growth, { sign: true })}{pctText(first.total ? (growth / Math.abs(first.total)) * 100 : null)} <span className="mut" style={{ fontWeight: 500 }}>{T('dari {a} ke {b}', { a: shortDate(parseLocal(first.date), true), b: shortDate(parseLocal(end.date), true) })}</span></span>}
        </div>
        <Seg label={T('Jenis grafik')} value={mode} onChange={(v) => { setMode(v); app.setSetting('wealthChart', v); }} options={[{ value: 'total', label: T('Total') }, { value: 'stack', label: T('Per akun') }]} />
        <Seg label={T('Rentang')} value={range} onChange={(v) => { setRange(v); app.setSetting('wealthRange', v); }} options={[{ value: '3m', label: T('3 bln') }, { value: '6m', label: T('6 bln') }, { value: '1y', label: T('1 thn') }, { value: 'all', label: T('Semua') }]} />
      </div>
      {data.length === 0 ? <div className="empty" style={{ height: 220, display: 'grid', placeItems: 'center' }}>{T('Grafik muncul setelah ada data di tabel.')}</div> : (
        <div style={{ height: 250 }} data-chart="wealth">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="wsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.28} /><stop offset="100%" stopColor={C.accent} stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={(t) => shortDate(new Date(t), spanYears)} stroke={C.muted} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis stroke={C.muted} tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={(v) => rupiah(v, { short: true }).replace('Rp ', '')} domain={mode === 'total' ? ['auto', 'auto'] : [0, 'auto']} />
              <Tooltip content={tip} cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} />
              {mode === 'total'
                ? <Area type="linear" dataKey="total" stroke={C.accent} strokeWidth={2.5} fill="url(#wsFill)" dot={{ r: 3.5, fill: C.accent, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                : m.columns.map((c, i) => <Area key={c.key} type="linear" dataKey={c.key} name={c.name} stackId="s" stroke={STACK[i % STACK.length]} fill={STACK[i % STACK.length]} fillOpacity={0.6} strokeWidth={1.5} isAnimationActive={false} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {mode === 'stack' && data.length > 0 && (
        <div className="row wrap" style={{ gap: 12, fontSize: 12 }}>
          {m.columns.map((c, i) => <span key={c.key} className="row" style={{ gap: 6 }}><span className="dot" style={{ background: STACK[i % STACK.length] }} />{c.name}</span>)}
          {m.columns.some((c) => m.snaps.some((s) => (s.cells[c.key].value || 0) < 0)) && <span className="mut">{T('Utang tidak ditumpuk di grafik ini.')}</span>}
        </div>
      )}
    </section>
  );
}

export default function WealthSheet() {
  const app = useApp();
  const sideW = usePanelWidth('wealthSide', 320, 260, 520);
  const C = useMemo(() => themeColors(), [app.dark]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useQuery(() => DB.list('wealth'), [], ['wealth']);
  const m = useMemo(() => wealthMatrix(rows.data || [], app.settings.wealthCols || []), [rows.data, app.settings.wealthCols]);
  const [colModal, setColModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const scrollRef = useRef();
  const prevCount = useRef(0);
  const err = (e) => app.toast({ text: errText(e), error: true });

  // keep the newest date in view (the sheet grows downwards, like the spreadsheet)
  useLayoutEffect(() => {
    if (m.snaps.length > prevCount.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    prevCount.current = m.snaps.length;
  }, [m.snaps.length]);

  const setCell = async (date, col, v) => {
    const cur = m.snaps.find((s) => s.date === date)?.cells[col.key]?.row;
    if (v == null) { if (cur) await DB.remove('wealth', cur.id); return; }
    await api('wealth:import', [{ date, name: col.name, category: col.category, value: v }]).catch(err);
  };
  const newDate = async (date = toLocalDate(new Date())) => {
    if (!m.columns.length) { setColModal({}); return; }
    if (m.snaps.some((s) => s.date === date)) { app.toast(T('Tanggal {d} sudah ada di tabel', { d: fmtDateLong(parseLocal(date)) })); return; }
    const n = await api('wealth:snapshot', date);
    if (!n) await setCell(date, m.columns[0], 0); // nothing to copy yet: start the row with the first account
    setTimeout(() => document.querySelector(`[data-date-row="${date}"] input.ws-cell`)?.focus(), 150);
  };
  const moveCol = async (key, dir) => {
    const cols = m.columns.map(({ name, category }) => ({ name, category }));
    const i = m.columns.findIndex((c) => c.key === key), j = i + dir;
    if (i < 0 || j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    await app.setSetting('wealthCols', cols);
  };
  const deleteCol = async (col) => {
    if (!(await app.confirm(T('Hapus kolom “{t}” beserta semua nilainya?', { t: col.name }), { danger: true, ok: T('Hapus') }))) return;
    await api('wealth:deleteCol', col);
    await app.setSetting('wealthCols', (app.settings.wealthCols || []).filter((c) => assetKey(c) !== col.key));
  };
  const deleteDate = async (date) => {
    if (!(await app.confirm(T('Hapus semua nilai tanggal {d}?', { d: fmtDateLong(parseLocal(date)) }), { danger: true, ok: T('Hapus') }))) return;
    await api('wealth:deleteDate', date);
  };
  const colMenu = (e, c, i) => openMenu(e, [
    { label: T('Edit akun…'), icon: 'edit', run: () => setColModal(c) },
    { label: T('Geser ke kiri'), icon: 'left', disabled: i === 0, run: () => moveCol(c.key, -1) },
    { label: T('Geser ke kanan'), icon: 'right', disabled: i === m.columns.length - 1, run: () => moveCol(c.key, 1) },
    '-',
    { label: T('Hapus kolom'), icon: 'trash', danger: true, run: () => deleteCol(c) }
  ]);
  const rowMenu = (e, s) => {
    if (e.target.closest('input.ws-cell')) return; // cells keep the text menu
    openMenu(e, [
      { label: T('Salin total'), icon: 'copy', run: () => { api('clipboard:write', String(s.total)); app.toast(T('Disalin ke clipboard')); } },
      { label: T('Tanggal baru dari baris ini (hari ini)'), icon: 'duplicate', run: () => newDate() },
      '-',
      { label: T('Hapus baris tanggal ini'), icon: 'trash', danger: true, run: () => deleteDate(s.date) }
    ]);
  };

  // summary from the newest row
  const lastS = m.snaps.at(-1), prevS = m.snaps.at(-2), firstS = m.snaps[0];
  const best = m.snaps.reduce((b, s) => (!b || s.total > b.total ? s : b), null);
  const worst = m.snaps.reduce((b, s) => (!b || s.total < b.total ? s : b), null);
  const byCat = useMemo(() => {
    if (!lastS) return [];
    const g = new Map();
    for (const c of m.columns) {
      const v = lastS.cells[c.key].value;
      if (v == null) continue;
      const name = c.category || c.name;
      const k = name.toLowerCase();
      const e = g.get(k) || { name, total: 0, n: 0 };
      e.total += v; e.n += 1;
      g.set(k, e);
    }
    return [...g.values()].sort((a, b) => b.total - a.total);
  }, [lastS, m.columns]);
  const categories = [...new Set(m.columns.map((c) => c.category).filter(Boolean))];

  return (
    <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
      <div className="col" style={{ flex: '1 1 0', minWidth: 0, gap: 16 }}>
        <TrendChart m={m} C={C} />
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="row wrap" style={{ padding: '12px 16px', gap: 8 }}>
            <h2 className="h2 grow">{T('Lembar kekayaan')}</h2>
            <button className="btn sm" onClick={() => setImportOpen(true)}><Icon name="upload" size="sm" />{T('Impor / tempel')}</button>
            <button className="btn sm" onClick={() => setColModal({ existing: new Set(m.columns.map((c) => c.key)) })}><Icon name="plus" size="sm" />{T('Akun')}</button>
            <button className="btn sm pri" onClick={() => newDate()}><Icon name="cal" size="sm" />{T('Tanggal baru')}</button>
          </div>
          {m.columns.length === 0 ? (
            <div className="empty" style={{ padding: '30px 16px' }}>
              <p style={{ margin: '0 0 12px' }}>{T('Buat kolom untuk tiap akun (bank, e-wallet, cash, saham, reksa dana…), lalu tambah baris per tanggal. Atau tempel tabel dari spreadsheet.')}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn pri" onClick={() => setColModal({ existing: new Set() })}><Icon name="plus" size="sm" />{T('Akun pertama')}</button>
                <button className="btn" onClick={() => setImportOpen(true)}><Icon name="upload" size="sm" />{T('Impor / tempel')}</button>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} style={{ overflow: 'auto', maxHeight: 'max(320px, calc(100vh - 260px))' }}>
              <table className="tbl ws-table">
                <thead>
                  <tr>
                    <th className="ws-sticky">{T('Tanggal')}</th>
                    {m.columns.map((c, i) => (
                      <th key={c.key} className="r">
                        <button className="ws-colhead" onClick={() => setColModal(c)} onContextMenu={(e) => colMenu(e, c, i)} title={T('Klik untuk edit, klik kanan untuk opsi')}>
                          {c.category && <span className="ws-cat">{c.category}</span>}
                          <span>{c.name}</span>
                        </button>
                      </th>
                    ))}
                    <th className="r">{T('Total')}</th>
                    <th className="r">{T('Perubahan')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {m.snaps.length === 0 && <tr><td colSpan={m.columns.length + 4} className="mut">{T('Belum ada tanggal. Klik “Tanggal baru”.')}</td></tr>}
                  {m.snaps.map((s) => (
                    <tr key={s.date} data-date-row={s.date} onContextMenu={(e) => rowMenu(e, s)}>
                      <td className="ws-sticky"><input type="date" className="cell num" aria-label={T('Tanggal')} value={s.date} onChange={(e) => e.target.value && e.target.value !== s.date && api('wealth:moveDate', s.date, e.target.value).catch(err)} style={{ width: 132 }} /></td>
                      {m.columns.map((c) => <td key={c.key} className="r ws-td"><Cell cell={s.cells[c.key]} onCommit={(v) => setCell(s.date, c, v)} /></td>)}
                      <td className={`r num ${s.total < 0 ? 'dn' : ''}`} style={{ fontWeight: 800 }}>{rupiah(s.total)}</td>
                      <td className={`r num ${s.delta == null ? 'mut' : s.delta >= 0 ? 'up' : 'dn'}`} style={{ fontSize: 13, fontWeight: 600 }}>{s.delta == null ? '—' : <>{rupiah(s.delta, { sign: true })}<div style={{ fontSize: 11, fontWeight: 500 }}>{pctText(s.pct).trim()}</div></>}</td>
                      <td style={{ width: 1, padding: '6px 8px' }}><button className="icb sm" aria-label={T('Hapus baris tanggal ini')} onClick={() => deleteDate(s.date)}><Icon name="trash" size="sm" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mut" style={{ padding: '10px 16px', fontSize: 12, lineHeight: 1.5 }}>{T('Satu baris = posisi semua akun pada satu tanggal. “Tanggal baru” menyalin nilai terakhir, jadi cukup ubah yang berubah. Sel kosong (abu-abu miring) memakai nilai tanggal sebelumnya. Utang ditulis negatif, mis. -1.200.000.')}</div>
        </section>
      </div>
      <Resizer panel={sideW} side="right" label={T('Ubah lebar panel ringkasan')} />
      <aside className="col" style={{ flex: 'none', width: sideW.width, gap: 16, alignSelf: 'flex-start' }}>
        <section className="card pad col" style={{ gap: 6, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <span className="lbl" style={{ color: 'var(--accent-text)' }}>{T('Total kekayaan bersih')}</span>
          <span className={`num ${lastS?.total < 0 ? 'dn' : ''}`} style={{ fontSize: 30, fontWeight: 800 }}>{rupiah(lastS?.total || 0)}</span>
          {lastS && <span className="mut" style={{ fontSize: 12 }}>{T('per {d}', { d: fmtDateLong(parseLocal(lastS.date)) })}</span>}
          {prevS && <span className={`num ${lastS.delta >= 0 ? 'up' : 'dn'}`} style={{ fontSize: 13, fontWeight: 700 }}>{rupiah(lastS.delta, { sign: true })}{pctText(lastS.pct)} <span className="mut" style={{ fontWeight: 500 }}>{T('sejak')} {shortDate(parseLocal(prevS.date), true)}</span></span>}
        </section>
        {m.snaps.length > 1 && (
          <section className="card pad col" style={{ gap: 8, fontSize: 13 }}>
            <div className="row"><span className="grow mut">{T('Sejak awal pencatatan')}</span><span className={`num ${lastS.total - firstS.total >= 0 ? 'up' : 'dn'}`} style={{ fontWeight: 700 }}>{rupiah(lastS.total - firstS.total, { sign: true })}</span></div>
            <div className="row"><span className="grow mut">{T('Tertinggi')} · {shortDate(parseLocal(best.date), true)}</span><span className="num" style={{ fontWeight: 700 }}>{rupiah(best.total)}</span></div>
            <div className="row"><span className="grow mut">{T('Terendah')} · {shortDate(parseLocal(worst.date), true)}</span><span className="num" style={{ fontWeight: 700 }}>{rupiah(worst.total)}</span></div>
            <div className="row"><span className="grow mut">{T('Jumlah pencatatan')}</span><span className="num" style={{ fontWeight: 700 }}>{m.snaps.length}</span></div>
          </section>
        )}
        <section className="card pad col" style={{ gap: 12 }}>
          <h2 className="h2">{categories.length ? T('Per kategori') : T('Per akun')}</h2>
          {byCat.length === 0 && <span className="mut" style={{ fontSize: 13 }}>{T('Belum ada data.')}</span>}
          {byCat.map((c, i) => (
            <div key={c.name} className="col" style={{ gap: 5 }}>
              <div className="row" style={{ fontSize: 13, gap: 8 }}>
                <span className="dot" style={{ background: C.c[i % C.c.length] }} />
                <span className="grow ellipsis" style={{ fontWeight: 600 }}>{c.name}{c.n > 1 && <span className="mut" style={{ fontWeight: 500 }}> · {c.n}</span>}</span>
                <span className={`num ${c.total < 0 ? 'dn' : ''}`} style={{ fontWeight: 700 }}>{rupiah(c.total)}</span>
                <span className="num mut" style={{ width: 40, textAlign: 'right' }}>{c.total > 0 && lastS.assets ? Math.round((c.total / lastS.assets) * 100) + '%' : ''}</span>
              </div>
              <div className="bar"><span style={{ width: (lastS.assets ? Math.min(100, Math.round((Math.abs(c.total) / lastS.assets) * 100)) : 0) + '%', background: C.c[i % C.c.length] }} /></div>
            </div>
          ))}
          {lastS && <>
            <div className="row" style={{ fontSize: 13, paddingTop: 10, borderTop: '1px solid var(--border)' }}><span className="grow mut">{T('Aset')}</span><span className="num" style={{ fontWeight: 700 }}>{rupiah(lastS.assets)}</span></div>
            <div className="row" style={{ fontSize: 13 }}><span className="grow mut">{T('Utang')}</span><span className="num dn" style={{ fontWeight: 700 }}>{rupiah(lastS.debts)}</span></div>
          </>}
        </section>
      </aside>
      {colModal && <ColumnModal initial={colModal} categories={categories} onClose={() => setColModal(null)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
