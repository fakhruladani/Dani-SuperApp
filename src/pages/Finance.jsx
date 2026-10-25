import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Legend, PieChart, Pie, Cell } from 'recharts';
import Icon from '../components/Icon.jsx';
import { Modal, Seg, Field } from '../components/ui.jsx';
import { api, DB, useApp, useQuery, themeColors } from '../lib/api.js';
import { rupiah, parseAmount, formatAmountInput } from '../lib/format.js';
import { MONTH_ID, MONTH_SHORT, pad, toLocalDate } from '../../shared/recur.js';


function AmountInput({ value, onChange, className = 'field', ...rest }) {
  const [txt, setTxt] = useState(value ? Number(value).toLocaleString('id-ID') : '');
  useEffect(() => { setTxt(value ? Number(value).toLocaleString('id-ID') : ''); }, [value]);
  return <input inputMode="numeric" className={className} value={txt} onChange={(e) => { const f = formatAmountInput(e.target.value); setTxt(f); onChange?.(parseAmount(f), false); }} onBlur={() => onChange?.(parseAmount(txt), true)} {...rest} />;
}

export function TxModal({ initial, cats, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ date: toLocalDate(new Date()), kind: 'out', amount: 0, description: '', note: '', category_id: '', ...initial });
  const list = cats.filter((c) => c.kind === f.kind && !c.archived);
  useEffect(() => { if (!list.find((c) => c.id === f.category_id)) setF((x) => ({ ...x, category_id: list[0]?.id || '' })); }, [f.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (again) => {
    if (!f.amount) { app.toast({ text: 'Nominal wajib diisi', error: true }); return; }
    await DB.save('fin_tx', f);
    app.toast('Transaksi disimpan');
    if (again) setF({ ...f, id: undefined, amount: 0, description: '', note: '' }); else onClose();
  };
  return (
    <Modal title={f.id ? 'Edit transaksi' : 'Transaksi baru'} onClose={onClose} width={480} footer={<>
      {f.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { await DB.remove('fin_tx', f.id); onClose(); }}>Hapus</button>}
      {!f.id && <button className="btn" onClick={() => save(true)}>Simpan & tambah lagi</button>}
      <button className="btn pri" onClick={() => save(false)}>Simpan</button>
    </>}>
      <Seg value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'out', label: 'Pengeluaran' }, { value: 'in', label: 'Pemasukan' }]} label="Jenis" />
      <Field label="Nominal (Rp)"><AmountInput value={f.amount} onChange={(amount) => setF((x) => ({ ...x, amount }))} style={{ fontSize: 22, fontWeight: 800 }} onKeyDown={(e) => e.key === 'Enter' && save(false)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Tanggal"><input type="date" className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Kategori"><select className="field" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <Field label="Keterangan"><input className="field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="mis. Makan siang" /></Field>
      <Field label="Catatan (opsional)"><input className="field" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Modal>
  );
}

function TxRow({ tx, cats, onDelete }) {
  const [r, setR] = useState(tx);
  useEffect(() => setR(tx), [tx]);
  const commit = (patch) => { const next = { ...r, ...patch }; setR(next); DB.save('fin_tx', { id: tx.id, ...patch }); };
  const list = cats.filter((c) => c.kind === r.kind);
  return (
    <tr>
      <td style={{ width: 70 }}><input className="cell num" aria-label="Tanggal" value={r.date.slice(8)} onChange={(e) => setR({ ...r, date: r.date.slice(0, 8) + e.target.value.replace(/\D/g, '').slice(0, 2) })} onBlur={(e) => { const d = Math.min(31, Math.max(1, Number(e.target.value) || 1)); commit({ date: r.date.slice(0, 8) + pad(d) }); }} style={{ width: 44 }} /></td>
      <td><input className="cell" aria-label="Keterangan" value={r.description || ''} onChange={(e) => setR({ ...r, description: e.target.value })} onBlur={() => commit({ description: r.description })} style={{ minWidth: 200 }} /></td>
      <td><select className="cell" aria-label="Kategori" value={r.category_id || ''} onChange={(e) => commit({ category_id: e.target.value })}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
      <td className="r"><AmountInput className="cell num up" aria-label="Masuk" value={r.kind === 'in' ? r.amount : 0} onChange={(v, done) => { if (done && v && (r.kind !== 'in' || v !== r.amount)) { const cat = r.kind !== 'in' ? cats.find((c) => c.kind === 'in')?.id : r.category_id; commit({ kind: 'in', amount: v, category_id: cat }); } }} style={{ textAlign: 'right', width: 130 }} /></td>
      <td className="r"><AmountInput className="cell num dn" aria-label="Keluar" value={r.kind === 'out' ? r.amount : 0} onChange={(v, done) => { if (done && v && (r.kind !== 'out' || v !== r.amount)) { const cat = r.kind !== 'out' ? cats.find((c) => c.kind === 'out')?.id : r.category_id; commit({ kind: 'out', amount: v, category_id: cat }); } }} style={{ textAlign: 'right', width: 130 }} /></td>
      <td style={{ width: 44 }}><button className="icb sm" aria-label="Hapus baris" onClick={() => onDelete(tx)}><Icon name="trash" size="sm" /></button></td>
    </tr>
  );
}

function Monthly({ year, month, setMonth, cats }) {
  const app = useApp();
  const ym = `${year}-${pad(month)}`;
  const tx = useQuery(() => DB.list('fin_tx', { where: { date: { prefix: ym } }, order: 'date,created_at' }), [ym], ['fin_tx']);
  const budgets = useQuery(() => api('fin:budgets', year, month), [ym], ['fin_tx', 'fin_budgets', 'fin_categories']);
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [nr, setNr] = useState({ day: '', description: '', category_id: '', inn: 0, out: 0 });
  const [editBudget, setEditBudget] = useState(null);

  const rows = (tx.data || []).filter((t) => (!catF || t.category_id === catF) && (!q || (t.description || '').toLowerCase().includes(q.toLowerCase())));
  const tin = (tx.data || []).filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0);
  const tout = (tx.data || []).filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
  const cap = (budgets.data || []).reduce((s, b) => s + (b.budget || 0), 0);
  const spentBudgeted = (budgets.data || []).filter((b) => b.budget > 0).reduce((s, b) => s + b.spent, 0);
  const today = new Date();
  const isCur = today.getFullYear() === year && today.getMonth() + 1 === month;
  const daysLeft = isCur ? new Date(year, month, 0).getDate() - today.getDate() : 0;

  const addRow = async () => {
    const amount = nr.inn || nr.out;
    if (!amount) return;
    const kind = nr.inn ? 'in' : 'out';
    const cat = nr.category_id && cats.find((c) => c.id === nr.category_id && c.kind === kind) ? nr.category_id : cats.find((c) => c.kind === kind && !c.archived)?.id;
    const day = Math.min(new Date(year, month, 0).getDate(), Math.max(1, Number(nr.day) || (isCur ? today.getDate() : 1)));
    await DB.save('fin_tx', { date: `${ym}-${pad(day)}`, description: nr.description, category_id: cat, kind, amount, note: '' });
    setNr({ day: nr.day, description: '', category_id: nr.category_id, inn: 0, out: 0 });
    setTimeout(() => document.getElementById('nr-desc')?.focus(), 50);
  };
  const del = async (t) => { await DB.remove('fin_tx', t.id); app.toast('Baris dihapus'); };

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <div className="seg" style={{ flexWrap: 'nowrap' }}>
          {MONTH_SHORT.map((m, i) => <button key={m} className={`tab ${i + 1 === month ? 'on' : ''}`} onClick={() => setMonth(i + 1)}>{m}</button>)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card stat"><span className="lbl">Pemasukan</span><span className="v num up">{rupiah(tin)}</span><span className="mut" style={{ fontSize: 12 }}>{(tx.data || []).filter((t) => t.kind === 'in').length} transaksi</span></div>
        <div className="card stat"><span className="lbl">Pengeluaran</span><span className="v num dn">{rupiah(tout)}</span><span className="mut" style={{ fontSize: 12 }}>{(tx.data || []).filter((t) => t.kind === 'out').length} transaksi</span></div>
        <div className="card stat"><span className="lbl">Selisih</span><span className="v num">{rupiah(tin - tout)}</span><span className="mut" style={{ fontSize: 12 }}>{tin ? `${Math.round(((tin - tout) / tin) * 100)}% dari pemasukan` : '—'}</span></div>
        <div className="card stat"><span className="lbl">Sisa anggaran</span><span className={`v num ${cap && cap - spentBudgeted < 0 ? 'dn' : ''}`}>{cap ? rupiah(cap - spentBudgeted) : '—'}</span><span className="mut" style={{ fontSize: 12 }}>{cap ? `dari ${rupiah(cap)} (kategori beranggaran)${isCur ? ` · ${daysLeft} hari lagi` : ''}` : 'belum ada anggaran'}</span></div>
      </div>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '999 1 600px', minWidth: 0, overflow: 'hidden' }}>
          <div className="row wrap" style={{ padding: '12px 16px' }}>
            <h2 className="h2 grow">Lembar {MONTH_ID[month - 1]} {year}</h2>
            <label className="sr" htmlFor="fq">Cari</label>
            <input id="fq" className="field" placeholder="Cari keterangan" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
            <label className="sr" htmlFor="fc">Kategori</label>
            <select id="fc" className="field" value={catF} onChange={(e) => setCatF(e.target.value)} style={{ width: 170 }}>
              <option value="">Semua kategori</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.kind === 'in' ? '↑ ' : '↓ '}{c.name}</option>)}
            </select>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 420px)', minHeight: 260 }}>
            <table className="tbl">
              <thead><tr><th>Tgl</th><th>Keterangan</th><th>Kategori</th><th className="r">Masuk</th><th className="r">Keluar</th><th /></tr></thead>
              <tbody>
                {rows.map((t) => <TxRow key={t.id} tx={t} cats={cats} onDelete={del} />)}
                <tr style={{ background: 'var(--accent-soft)' }}>
                  <td><input className="cell num" aria-label="Tanggal baru" placeholder={isCur ? String(today.getDate()) : '1'} value={nr.day} onChange={(e) => setNr({ ...nr, day: e.target.value.replace(/\D/g, '').slice(0, 2) })} style={{ width: 44 }} /></td>
                  <td><input id="nr-desc" className="cell" aria-label="Keterangan baru" placeholder="+ Ketik transaksi baru…" value={nr.description} onChange={(e) => setNr({ ...nr, description: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addRow()} /></td>
                  <td><select className="cell" aria-label="Kategori baru" value={nr.category_id} onChange={(e) => setNr({ ...nr, category_id: e.target.value })}><option value="">(otomatis)</option>{cats.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.kind === 'in' ? '↑ ' : '↓ '}{c.name}</option>)}</select></td>
                  <td className="r"><AmountInput className="cell num" aria-label="Masuk baru" placeholder="0" value={nr.inn} onChange={(v) => setNr((x) => ({ ...x, inn: v, out: v ? 0 : x.out }))} onKeyDown={(e) => e.key === 'Enter' && addRow()} style={{ textAlign: 'right', width: 130 }} /></td>
                  <td className="r"><AmountInput className="cell num" aria-label="Keluar baru" placeholder="0" value={nr.out} onChange={(v) => setNr((x) => ({ ...x, out: v, inn: v ? 0 : x.inn }))} onKeyDown={(e) => e.key === 'Enter' && addRow()} style={{ textAlign: 'right', width: 130 }} /></td>
                  <td><button className="icb sm" aria-label="Tambah baris" onClick={addRow}><Icon name="plus" size="sm" /></button></td>
                </tr>
              </tbody>
              <tfoot><tr><td colSpan={3}>Total {MONTH_ID[month - 1]}</td><td className="r num up">{rupiah(tin)}</td><td className="r num dn">{rupiah(tout)}</td><td /></tr></tfoot>
            </table>
          </div>
        </section>
        <section className="card pad col" style={{ flex: '1 1 300px', gap: 12 }}>
          <div className="row"><h2 className="h2 grow">Anggaran {MONTH_SHORT[month - 1]}</h2><span className="mut" style={{ fontSize: 12 }}>klik angka untuk ubah</span></div>
          {(budgets.data || []).map((b) => {
            const p = b.budget ? Math.round((b.spent / b.budget) * 100) : 0;
            return (
              <div key={b.category_id} className="col" style={{ gap: 5 }}>
                <div className="row" style={{ fontSize: 13 }}>
                  <span className="grow" style={{ fontWeight: 600 }}>{b.name}</span>
                  {editBudget === b.category_id ? (
                    <AmountInput className="field num" autoFocus value={b.budget} style={{ width: 130, minHeight: 30, padding: '2px 8px', textAlign: 'right' }} onChange={async (v, done) => {
                      if (!done) return;
                      if (b.override_id) await DB.save('fin_budgets', { id: b.override_id, amount: v }); else await DB.save('fin_budgets', { year, month, category_id: b.category_id, amount: v });
                      setEditBudget(null);
                    }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
                  ) : (
                    <button className="btn sm ghost num" onClick={() => setEditBudget(b.category_id)} title={b.overridden ? 'Anggaran khusus bulan ini' : 'Anggaran default kategori'}>
                      {rupiah(b.spent, { short: true })} / {b.budget ? rupiah(b.budget, { short: true }) : '—'}{b.overridden ? ' *' : ''}
                    </button>
                  )}
                </div>
                {b.budget > 0 && <div className="bar"><span className={p > 100 ? 'over' : p > 85 ? 'warn' : ''} style={{ width: Math.min(100, p) + '%' }} /></div>}
              </div>
            );
          })}
          <span className="mut" style={{ fontSize: 12 }}>* anggaran khusus bulan ini. Default per kategori diatur di tab “Kategori & anggaran”.</span>
        </section>
      </div>
    </>
  );
}

function Recap({ year, cats, goMonth }) {
  const app = useApp();
  const C = useMemo(() => themeColors(), [app.dark]); // eslint-disable-line react-hooks/exhaustive-deps
  const PIE = C.c;
  const rec = useQuery(() => api('fin:recap', year), [year], ['fin_tx']);
  const prev = useQuery(() => api('fin:recap', year - 1), [year], ['fin_tx']);
  const [catKind, setCatKind] = useState('out');
  const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  if (!rec.data) return <div className="skeleton" style={{ height: 300 }} />;
  const m = rec.data.months;
  const tin = m.reduce((s, x) => s + x.in, 0), tout = m.reduce((s, x) => s + x.out, 0);
  const activeMonths = m.filter((x) => x.in || x.out).length || 1;
  const pin = prev.data ? prev.data.months.reduce((s, x) => s + x.in, 0) : 0;
  const pout = prev.data ? prev.data.months.reduce((s, x) => s + x.out, 0) : 0;
  let cum = 0;
  const chart = m.map((x, i) => { cum += x.in - x.out; return { name: MONTH_SHORT[i], Pemasukan: x.in, Pengeluaran: x.out, Kumulatif: cum }; });
  const catRows = rec.data.categories.filter((c) => c.kind === catKind).sort((a, b) => b.total - a.total);
  const maxCell = Math.max(1, ...catRows.flatMap((c) => c.months));
  const pie = catRows.slice(0, 7).map((c) => ({ name: names[c.category_id] || '—', value: c.total }));
  if (catRows.length > 7) pie.push({ name: 'Lainnya', value: catRows.slice(7).reduce((s, c) => s + c.total, 0) });
  const delta = (a, b) => (b ? `${a >= b ? '+' : '−'}${Math.abs(Math.round(((a - b) / b) * 100))}% vs ${year - 1}` : `tidak ada data ${year - 1}`);
  const tip = { contentStyle: { background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, color: C.text }, itemStyle: { color: C.text }, labelStyle: { color: C.text }, formatter: (v) => rupiah(v) };
  let run = 0;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card stat"><span className="lbl">Pemasukan {year}</span><span className="v num up">{rupiah(tin)}</span><span className="mut" style={{ fontSize: 12 }}>{delta(tin, pin)}</span></div>
        <div className="card stat"><span className="lbl">Pengeluaran {year}</span><span className="v num dn">{rupiah(tout)}</span><span className="mut" style={{ fontSize: 12 }}>{delta(tout, pout)}</span></div>
        <div className="card stat"><span className="lbl">Total selisih</span><span className="v num">{rupiah(tin - tout)}</span><span className="mut" style={{ fontSize: 12 }}>Tingkat tabungan {tin ? Math.round(((tin - tout) / tin) * 100) : 0}%</span></div>
        <div className="card stat"><span className="lbl">Rata-rata pengeluaran</span><span className="v num">{rupiah(tout / activeMonths)}</span><span className="mut" style={{ fontSize: 12 }}>per bulan aktif ({activeMonths} bulan)</span></div>
      </div>
      <section className="card pad col" style={{ gap: 8 }}>
        <h2 className="h2">Arus kas bulanan {year}</h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ left: 10, right: 10, top: 10 }}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="name" stroke={C.muted} tickLine={false} axisLine={false} />
              <YAxis stroke={C.muted} tickLine={false} axisLine={false} tickFormatter={(v) => rupiah(v, { short: true }).replace('Rp ', '')} width={60} />
              <Tooltip {...tip} cursor={{ fill: C.surface2 }} />
              <Legend />
              <Bar dataKey="Pemasukan" fill={C.pos} radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Pengeluaran" fill={C.neg} radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Line dataKey="Kumulatif" stroke={C.accent} strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '999 1 520px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px' }}><h2 className="h2">Rekap per bulan</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Bulan</th><th className="r">Pemasukan</th><th className="r">Pengeluaran</th><th className="r">Selisih</th><th className="r">Saldo kumulatif</th><th className="r">Transaksi</th></tr></thead>
              <tbody>
                {m.map((x, i) => { run += x.in - x.out; return (
                  <tr key={i} onClick={() => goMonth(i + 1)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{MONTH_ID[i]}</td>
                    <td className="r num up">{x.in ? rupiah(x.in) : '—'}</td>
                    <td className="r num dn">{x.out ? rupiah(x.out) : '—'}</td>
                    <td className={`r num ${x.in - x.out < 0 ? 'dn' : ''}`}>{x.in || x.out ? rupiah(x.in - x.out) : '—'}</td>
                    <td className="r num">{rupiah(run)}</td>
                    <td className="r num mut">{x.n || '—'}</td>
                  </tr>
                ); })}
              </tbody>
              <tfoot><tr><td>Total</td><td className="r num up">{rupiah(tin)}</td><td className="r num dn">{rupiah(tout)}</td><td className="r num">{rupiah(tin - tout)}</td><td /><td className="r num">{m.reduce((s, x) => s + x.n, 0)}</td></tr></tfoot>
            </table>
          </div>
        </section>
        <section className="card pad col" style={{ flex: '1 1 320px', gap: 8 }}>
          <div className="row"><h2 className="h2 grow">Komposisi</h2><Seg value={catKind} onChange={setCatKind} options={[{ value: 'out', label: 'Keluar' }, { value: 'in', label: 'Masuk' }]} label="Jenis" /></div>
          {pie.length === 0 ? <div className="empty">Belum ada data.</div> : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke={C.surface}>
                    {pie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {pie.map((p, i) => <div key={p.name} className="row" style={{ fontSize: 13 }}><span className="dot" style={{ background: PIE[i % PIE.length] }} /><span className="grow">{p.name}</span><span className="num mut">{rupiah(p.value, { short: true })} · {Math.round((p.value / (catKind === 'out' ? tout : tin || 1)) * 100)}%</span></div>)}
        </section>
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px' }}><h2 className="h2">{catKind === 'out' ? 'Pengeluaran' : 'Pemasukan'} per kategori × bulan</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Kategori</th>{MONTH_SHORT.map((x) => <th key={x} className="r">{x}</th>)}<th className="r">Total</th><th className="r">Rata²</th></tr></thead>
            <tbody>
              {catRows.length === 0 && <tr><td colSpan={15} className="mut">Belum ada data tahun {year}.</td></tr>}
              {catRows.map((c) => (
                <tr key={c.category_id}>
                  <td style={{ fontWeight: 600 }}>{names[c.category_id] || '(tanpa kategori)'}</td>
                  {c.months.map((v, i) => <td key={i} className="r num" style={{ padding: '6px 6px' }}><span className="heat" style={{ minWidth: 70, background: v ? `color-mix(in srgb, ${catKind === 'out' ? 'var(--neg)' : 'var(--pos)'} ${Math.round(8 + (v / maxCell) * 40)}%, transparent)` : 'transparent' }}>{v ? rupiah(v, { short: true }).replace('Rp ', '') : '·'}</span></td>)}
                  <td className="r num" style={{ fontWeight: 800 }}>{rupiah(c.total, { short: true })}</td>
                  <td className="r num mut">{rupiah(c.total / activeMonths, { short: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Categories({ cats }) {
  const app = useApp();
  const [edit, setEdit] = useState(null);
  const counts = useQuery(async () => { const tx = await DB.list('fin_tx'); const c = {}; tx.forEach((t) => { c[t.category_id] = (c[t.category_id] || 0) + 1; }); return c; }, [], ['fin_tx']);
  const block = (kind) => (
    <section className="card pad col" style={{ flex: '1 1 380px', gap: 6 }}>
      <div className="row"><h2 className="h2 grow">{kind === 'in' ? 'Kategori pemasukan' : 'Kategori pengeluaran & anggaran default'}</h2><button className="btn sm" onClick={() => setEdit({ name: '', kind, budget: 0, sort: cats.length, archived: 0 })}><Icon name="plus" size="sm" />Tambah</button></div>
      {cats.filter((c) => c.kind === kind).map((c) => (
        <div key={c.id} className="task" style={{ opacity: c.archived ? 0.55 : 1 }}>
          <span className="grow" style={{ fontWeight: 600 }}>{c.name}{c.archived ? ' (diarsipkan)' : ''}</span>
          {kind === 'out' && <span className="num mut">{c.budget ? rupiah(c.budget) + '/bln' : 'tanpa anggaran'}</span>}
          <span className="chip">{counts.data?.[c.id] || 0} trx</span>
          <button className="icb sm" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Icon name="edit" size="sm" /></button>
        </div>
      ))}
    </section>
  );
  return (
    <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
      {block('out')}{block('in')}
      {edit && (
        <Modal title={edit.id ? 'Edit kategori' : 'Kategori baru'} width={420} onClose={() => setEdit(null)} footer={<>
          {edit.id && (counts.data?.[edit.id] ? <button className="btn" style={{ marginRight: 'auto' }} onClick={async () => { await DB.save('fin_categories', { id: edit.id, archived: edit.archived ? 0 : 1 }); setEdit(null); }}>{edit.archived ? 'Aktifkan' : 'Arsipkan'}</button>
            : <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { await DB.remove('fin_categories', edit.id); setEdit(null); }}>Hapus</button>)}
          <button className="btn" onClick={() => setEdit(null)}>Batal</button>
          <button className="btn pri" onClick={async () => { if (!edit.name.trim()) return; await DB.save('fin_categories', edit); setEdit(null); app.toast('Kategori disimpan'); }}>Simpan</button>
        </>}>
          <Field label="Nama"><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          {edit.kind === 'out' && <Field label="Anggaran default per bulan (Rp)" hint="Bisa diubah khusus per bulan dari panel anggaran."><AmountInput value={edit.budget} onChange={(budget) => setEdit((x) => ({ ...x, budget }))} /></Field>}
        </Modal>
      )}
    </div>
  );
}

export default function Finance() {
  const app = useApp();
  const now = new Date();
  const [year, setYear] = useState(app.params.year || app.settings.finYear || now.getFullYear());
  const [month, setMonth] = useState(app.params.month || now.getMonth() + 1);
  const [tab, setTab] = useState(app.params.tab || 'month');
  const [txModal, setTxModal] = useState(null);
  const cats = useQuery(() => DB.list('fin_categories', { order: 'sort' }), [], ['fin_categories']);
  const recap = useQuery(() => api('fin:recap', year), [year], ['fin_tx']);

  useEffect(() => {
    if (app.params.newTx) setTxModal({});
    if (app.params.year) setYear(app.params.year);
    if (app.params.month) { setMonth(app.params.month); setTab('month'); }
    if (app.params.tab) setTab(app.params.tab);
  }, [app.params._t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { app.setSetting('finYear', year); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => {
    const s = new Set([...(recap.data?.years || []), now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1, year]);
    return [...s].sort((a, b) => a - b);
  }, [recap.data, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async () => { const n = await api('import:csv'); if (n != null) app.toast(`${n} transaksi diimpor`); };

  return (
    <div className="page">
      <div className="row wrap">
        <div className="row" style={{ gap: 4 }}>
          <button className="icb" aria-label="Tahun sebelumnya" onClick={() => setYear(year - 1)}><Icon name="left" /></button>
          <label className="sr" htmlFor="fy">Tahun</label>
          <select id="fy" className="field num" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto', fontSize: 18, fontWeight: 800, border: 0, background: 'transparent' }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="icb" aria-label="Tahun berikutnya" onClick={() => setYear(year + 1)}><Icon name="right" /></button>
        </div>
        <Seg label="Tampilan keuangan" value={tab} onChange={setTab} options={[{ value: 'month', label: 'Bulanan' }, { value: 'recap', label: 'Rekap tahunan' }, { value: 'cats', label: 'Kategori & anggaran' }]} />
        <span className="grow" />
        <button className="btn" onClick={doImport}><Icon name="upload" size="sm" />Impor CSV</button>
        <button className="btn" onClick={() => api('export:csv', year).then((n) => n != null && app.toast('CSV diekspor'))}><Icon name="download" size="sm" />CSV</button>
        <button className="btn" onClick={() => api('export:xlsx', year).then((p) => p && app.toast('Excel diekspor'))}><Icon name="table" size="sm" />Ekspor Excel {year}</button>
        <button className="btn pri" onClick={() => setTxModal({ date: year === now.getFullYear() && month === now.getMonth() + 1 ? toLocalDate(now) : `${year}-${pad(month)}-01` })}><Icon name="plus" size="sm" />Transaksi</button>
      </div>
      {cats.data && tab === 'month' && <Monthly year={year} month={month} setMonth={setMonth} cats={cats.data} />}
      {cats.data && tab === 'recap' && <Recap year={year} cats={cats.data} goMonth={(m) => { setMonth(m); setTab('month'); }} />}
      {cats.data && tab === 'cats' && <Categories cats={cats.data} />}
      {txModal && cats.data && <TxModal initial={txModal} cats={cats.data} onClose={() => setTxModal(null)} />}
    </div>
  );
}
