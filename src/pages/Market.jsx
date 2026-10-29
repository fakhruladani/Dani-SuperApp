import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, AreaSeries, HistogramSeries, LineSeries, ColorType } from 'lightweight-charts';
import Icon from '../components/Icon.jsx';
import { Seg, Sparkline, Spinner, Modal, Field } from '../components/ui.jsx';
import { api, DB, useApp, useQuery, themeColors } from '../lib/api.js';
import { num, pct, timeAgo } from '../lib/format.js';
import { tickerLabel } from './Home.jsx';
import { T } from '../lib/i18n.js';
import Resizer, { usePanelWidth } from '../components/Resizer.jsx';
import { openMenu } from '../components/ContextMenu.jsx';
import { newsItems, copyText } from '../lib/menus.js';

const RANGES = [['1d', '1H'], ['5d', '5H'], ['1mo', '1B'], ['3mo', '3B'], ['6mo', '6B'], ['1y', '1T'], ['5y', '5T']];
const digits = (p) => (p == null ? 2 : p >= 1000 ? 2 : p >= 10 ? 2 : 4);

function sma(bars, n) {
  const out = [];
  let sum = 0;
  bars.forEach((b, i) => { sum += b.close; if (i >= n) sum -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time, value: sum / n }); });
  return out;
}

function PriceChart({ symbol, range, type, showMA }) {
  const app = useApp();
  const box = useRef();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    api('market:chart', symbol, range).then((d) => alive && setData(d), (e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [symbol, range]);

  useEffect(() => {
    if (!data || !box.current) return undefined;
    const C = themeColors();
    const intraday = range === '1d' || range === '5d';
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: C.surface }, textColor: C.muted, fontFamily: 'Plus Jakarta Sans Variable, sans-serif', attributionLogo: false },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: 0 },
      localization: { locale: 'id-ID', priceFormatter: (p) => num(p, digits(p)) }
    });
    const off = data.meta.gmtoffset || 0;
    const bars = data.bars.map((b) => ({ ...b, time: b.time + off }));
    const up = bars.length > 1 && bars[bars.length - 1].close >= bars[0].open;
    let main;
    if (type === 'candle') {
      main = chart.addSeries(CandlestickSeries, { upColor: C.pos, downColor: C.neg, borderVisible: false, wickUpColor: C.pos, wickDownColor: C.neg });
      main.setData(bars);
    } else {
      const col = up ? C.pos : C.neg;
      main = chart.addSeries(AreaSeries, { lineColor: col, topColor: col + '55', bottomColor: col + '05', lineWidth: 2 });
      main.setData(bars.map((b) => ({ time: b.time, value: b.close })));
    }
    if (bars.some((b) => b.volume)) {
      const vol = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, color: C.muted + '55', lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: (b.close >= b.open ? C.pos : C.neg) + '55' })));
    }
    if (showMA) {
      chart.addSeries(LineSeries, { color: C.accent, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(sma(bars, 20));
      chart.addSeries(LineSeries, { color: C.c[1], lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(sma(bars, 50));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, type, showMA, app.dark, range]);

  if (err) return <div className="empty" style={{ height: 380 }}>{T("Grafik gagal dimuat:")} {err}</div>;
  return (
    <div style={{ position: 'relative', height: 380 }}>
      {!data && <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

function News({ initialCat = 'fin' }) {
  const app = useApp();
  const [cat, setCat] = useState(initialCat);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const saved = useQuery(() => DB.list('news_saved', { order: 'created_at desc' }), [], ['news_saved']);
  const load = (c, force) => {
    if (c === 'saved') return;
    setLoading(true);
    api('news:list', c, force).then((d) => setData((x) => ({ ...x, [c]: d })), () => setData((x) => ({ ...x, [c]: { items: [], errors: ['semua'] } }))).finally(() => setLoading(false));
  };
  useEffect(() => { load(cat, false); setSrc(''); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => load(cat, false), 15 * 60000); return () => clearInterval(t); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedIds = new Set((saved.data || []).map((s) => s.id));
  const items = cat === 'saved' ? (saved.data || []).map((s) => ({ ...s, date: new Date(s.pub_date).getTime() })) : data[cat]?.items || [];
  const sources = [...new Set(items.map((i) => i.source))];
  const shown = items.filter((i) => (!src || i.source === src) && (!q || i.title.toLowerCase().includes(q.toLowerCase())));
  const toggleSave = (n) => (savedIds.has(n.link) ? DB.remove('news_saved', n.link) : DB.save('news_saved', { id: n.link, title: n.title, link: n.link, source: n.source, pub_date: new Date(n.date).toISOString() }).then(() => app.toast(T("Disimpan untuk dibaca nanti"))));

  return (
    <section className="card pad col" style={{ gap: 12 }}>
      <div className="row wrap">
        <Seg label={T("Kategori berita")} value={cat} onChange={setCat} options={[{ value: 'fin', label: T("Finance") }, { value: 'id', label: T("Indonesia") }, { value: 'saved', label: `${T('Disimpan')} (${saved.data?.length || 0})` }]} />
        <span className="grow" />
        <label className="sr" htmlFor="nq">{T("Cari berita")}</label>
        <input id="nq" className="field" placeholder={T("Cari judul…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        {cat !== 'saved' && <button className="btn" onClick={() => load(cat, true)}>{loading ? <Spinner /> : <Icon name="refresh" size="sm" />}{T("Muat ulang")}</button>}
      </div>
      {sources.length > 1 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip ${!src ? 'on' : ''}`} onClick={() => setSrc('')}>{T("Semua sumber")}</button>
          {sources.map((s) => <button key={s} className={`chip ${src === s ? 'on' : ''}`} onClick={() => setSrc(s)}>{s}</button>)}
        </div>
      )}
      {cat !== 'saved' && data[cat]?.errors?.length > 0 && <span className="mut" style={{ fontSize: 12 }}>{T("Sumber gagal dimuat:")} {data[cat].errors.join(', ')}</span>}
      {cat !== 'saved' && !data[cat] && <div className="skeleton" style={{ height: 300 }} />}
      {data[cat] && shown.length === 0 && <div className="empty">{T("Tidak ada berita.")}</div>}
      {cat === 'saved' && shown.length === 0 && <div className="empty">{T("Belum ada berita yang disimpan. Klik ikon penanda pada berita.")}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0 20px' }}>
        {shown.map((n) => (
          <div key={n.link} className="news-item" onContextMenu={(e) => openMenu(e, newsItems(app, n, { saved: savedIds.has(n.link), toggleSave }))}>
            {n.img ? <img className="news-thumb" src={n.img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <div className="news-thumb">{n.source.split(' ')[0].slice(0, 7).toUpperCase()}</div>}
            <a href={n.link} onClick={(e) => { e.preventDefault(); api('shell:open', n.link); }} className="col grow" style={{ gap: 4, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}>
              <span style={{ fontWeight: 700, lineHeight: 1.4 }}>{n.title}</span>
              {n.summary && <span className="mut" style={{ fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.summary}</span>}
              <span className="mut" style={{ fontSize: 12 }}>{n.source} · {timeAgo(n.date)}</span>
            </a>
            <button className={`icb sm ${savedIds.has(n.link) ? 'on' : ''}`} aria-label={savedIds.has(n.link) ? T("Hapus dari simpanan") : T("Simpan untuk dibaca nanti")} onClick={() => toggleSave(n)}><Icon name="bookmark" size="sm" /></button>
          </div>
        ))}
      </div>
      <span className="mut" style={{ fontSize: 12 }}>{T(
        "Sumber RSS bisa diatur di Pengaturan → Berita. Klik judul untuk membuka di browser."
      )}</span>
    </section>
  );
}

export default function Market() {
  const app = useApp();
  const sideW = usePanelWidth('marketSide', 320, 260, 520);
  const [tab, setTab] = useState(app.params.tab || 'market');
  const wl = useQuery(() => DB.list('watchlist', { order: 'sort' }), [], ['watchlist']);
  const alerts = useQuery(() => DB.list('price_alerts', { order: 'created_at desc' }), [], ['price_alerts']);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [sel, setSel] = useState(app.params.symbol || null);
  const [range, setRange] = useState('1mo');
  const [ctype, setCtype] = useState('candle');
  const [ma, setMa] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [alertForm, setAlertForm] = useState({ op: 'above', price: '' });

  const symbols = useMemo(() => (wl.data || []).map((w) => w.symbol), [wl.data]);
  const load = () => {
    if (!symbols.length) return;
    setLoading(true);
    api('market:quotes', symbols).then((qs) => { setQuotes(Object.fromEntries(qs.map((q) => [q.symbol, q]))); setUpdated(Date.now()); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, Math.max(60, app.settings.marketRefreshSec || 120) * 1000); return () => clearInterval(t); }, [symbols.join(','), app.settings.marketRefreshSec]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sel && symbols.length) setSel(symbols[0]); }, [symbols, sel]);
  useEffect(() => { if (app.params.symbol) { setSel(app.params.symbol); setTab('market'); } if (app.params.tab) setTab(app.params.tab); }, [app.params._t]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = sel ? quotes[sel] : null;
  const selName = (wl.data || []).find((w) => w.symbol === sel)?.name || q?.name || sel;
  const symAlerts = (alerts.data || []).filter((a) => a.symbol === sel);
  const addAlert = async () => {
    const price = Number(String(alertForm.price).replace(/\./g, '').replace(',', '.'));
    if (!price) return;
    await DB.save('price_alerts', { symbol: sel, op: alertForm.op, price, active: 1 });
    setAlertForm({ ...alertForm, price: '' });
    app.toast(T("Alert harga dibuat"));
  };

  return (
    <div className="page">
      <div className="row wrap">
        <Seg label={T("Tab")} value={tab} onChange={setTab} options={[{ value: 'market', label: T("Pasar") }, { value: 'news', label: T("Berita") }]} />
        <span className="grow" />
        {tab === 'market' && <>
          <span className="chip">{T("Yahoo Finance · tertunda ±10–15 mnt")}{updated ? ` · ${timeAgo(updated)}` : ''}</span>
          <button className="btn" onClick={load}>{loading ? <Spinner /> : <Icon name="refresh" size="sm" />}{T("Muat ulang")}</button>
          <button className="btn pri" onClick={() => setAddOpen(true)}><Icon name="plus" size="sm" />{T("Simbol")}</button>
        </>}
      </div>

      {tab === 'news' && <News />}

      {tab === 'market' && (
        <>
          <div data-tour="tickers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {(wl.data || []).map((w) => {
              const x = quotes[w.symbol];
              const upx = (x?.change || 0) >= 0;
              return (
                <button key={w.symbol} className={`card tick ${sel === w.symbol ? 'on' : ''}`} onClick={() => setSel(w.symbol)} onContextMenu={(e) => openMenu(e, [
                  { label: T('Buka grafik'), icon: 'chart', run: () => setSel(w.symbol) },
                  { label: T('Salin simbol'), icon: 'copy', run: () => copyText(app, w.symbol) },
                  { label: T('Buka di Yahoo Finance'), icon: 'external', run: () => api('shell:open', 'https://finance.yahoo.com/quote/' + encodeURIComponent(w.symbol)) },
                  '-',
                  { label: T('Hapus dari watchlist'), icon: 'trash', danger: true, run: async () => { if (await app.confirm(T('Hapus {t} dari watchlist?', { t: w.symbol }), { danger: true, ok: T('Hapus') })) { await DB.remove('watchlist', w.symbol); if (sel === w.symbol) setSel(null); } } }
                ])}>
                  <div className="row"><span style={{ fontWeight: 800 }} className="grow ellipsis">{tickerLabel(w)}</span>{x && !x.error && <span className={`num ${upx ? 'up' : 'dn'}`} style={{ fontSize: 13, fontWeight: 700 }}>{pct(x.changePct)}</span>}</div>
                  {!x ? <div className="skeleton" style={{ height: 26 }} /> : x.error ? <span className="mut" style={{ fontSize: 13 }}>{T("Data tidak tersedia")}</span> : <span className="num" style={{ fontSize: 20, fontWeight: 800 }}>{num(x.price, digits(x.price))}</span>}
                  <Sparkline data={x?.spark} up={upx} height={32} />
                  <span className="mut ellipsis" style={{ fontSize: 12 }}>{/[\^=-]/.test(w.symbol) ? w.symbol : w.name}{x?.currency ? ` · ${x.currency}` : ''}{x?.stale ? T(" · offline") : ''}</span>
                </button>
              );
            })}
          </div>

          {sel && (
            <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
              <section className="card pad col" style={{ flex: '1 1 0', minWidth: 0, gap: 12, alignSelf: 'flex-start' }}>
                <div className="row wrap">
                  <div className="col grow" style={{ gap: 2 }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{selName} <span className="mut" style={{ fontSize: 14, fontWeight: 600 }}>{sel}</span></span>
                    {q && !q.error && <span className="num"><strong style={{ fontSize: 18 }}>{num(q.price, digits(q.price))}</strong> <span className={q.change >= 0 ? 'up' : 'dn'} style={{ fontWeight: 700 }}>{q.change >= 0 ? '+' : '−'}{num(Math.abs(q.change), digits(q.price))} ({pct(q.changePct)})</span> <span className="mut" style={{ fontSize: 12 }}>· H {num(q.dayHigh, digits(q.price))} · L {num(q.dayLow, digits(q.price))} · {q.exchange}</span></span>}
                  </div>
                  <Seg label={T("Rentang")} value={range} onChange={setRange} options={RANGES.map(([v, l]) => ({ value: v, label: l }))} />
                  <Seg label={T("Jenis grafik")} value={ctype} onChange={setCtype} options={[{ value: 'candle', label: 'Candle' }, { value: 'line', label: T("Garis") }]} />
                  <button className={`btn sm ${ma ? 'pri' : ''}`} onClick={() => setMa(!ma)} title={T("Moving average 20 & 50")}>MA 20/50</button>
                </div>
                <PriceChart symbol={sel} range={range} type={ctype} showMA={ma} />
              </section>
              <Resizer panel={sideW} side="right" label={T('Ubah lebar panel alert')} />
              <section className="card pad col" style={{ flex: 'none', width: sideW.width, gap: 12, alignSelf: 'flex-start' }}>
                <h2 className="h2">{T("Alert harga")} {sel.replace('.JK', '')}</h2>
                <div className="row">
                  <label className="sr" htmlFor="al-op">{T("Kondisi")}</label>
                  <select id="al-op" className="field" value={alertForm.op} onChange={(e) => setAlertForm({ ...alertForm, op: e.target.value })} style={{ width: 130 }}><option value="above">{T("Naik ke ≥")}</option><option value="below">{T("Turun ke ≤")}</option></select>
                  <label className="sr" htmlFor="al-p">{T("Harga")}</label>
                  <input id="al-p" className="field num" inputMode="decimal" placeholder={q?.price ? num(q.price, digits(q.price)) : T("harga")} value={alertForm.price} onChange={(e) => setAlertForm({ ...alertForm, price: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addAlert()} />
                  <button className="btn pri" onClick={addAlert} aria-label={T("Tambah alert")}><Icon name="bell" size="sm" /></button>
                </div>
                {symAlerts.length === 0 && <span className="mut" style={{ fontSize: 13 }}>{T(
                    "Belum ada alert. Notifikasi muncul saat harga menyentuh batas (dicek tiap"
                  )} {Math.round((app.settings.marketRefreshSec || 120) / 60)} {T("menit).")}</span>}
                {symAlerts.map((a) => (
                  <div key={a.id} className="task">
                    <Icon name="bell" size="sm" className={a.active ? '' : 'mut'} />
                    <span className="grow num">{a.op === 'above' ? '≥ ' : '≤ '}{num(a.price, digits(a.price))}</span>
                    <span className="chip">{a.active ? T("aktif") : `${T('terpicu')} ${a.triggered_at ? timeAgo(new Date(a.triggered_at).getTime()) : ''}`}</span>
                    {!a.active && <button className="icb sm" aria-label={T("Aktifkan lagi")} onClick={() => DB.save('price_alerts', { id: a.id, active: 1, triggered_at: null })}><Icon name="refresh" size="sm" /></button>}
                    <button className="icb sm" aria-label={T("Hapus alert")} onClick={() => DB.remove('price_alerts', a.id)}><Icon name="trash" size="sm" /></button>
                  </div>
                ))}
                <div className="divider" />
                <button className="btn danger" onClick={async () => { if (await app.confirm(T('Hapus {t} dari watchlist?', { t: sel }), { danger: true, ok: T("Hapus") })) { await DB.remove('watchlist', sel); setSel(null); } }}><Icon name="trash" size="sm" />{T("Hapus dari watchlist")}</button>
                <span className="mut" style={{ fontSize: 12 }}>{T(
                  "Data dari endpoint publik Yahoo Finance (tidak resmi). Bisa berubah sewaktu-waktu; bukan saran investasi."
                )}</span>
              </section>
            </div>
          )}
        </>
      )}
      {addOpen && <AddSymbol onClose={() => setAddOpen(false)} count={symbols.length} onAdded={(s) => setSel(s)} />}
    </div>
  );
}

function AddSymbol({ onClose, count, onAdded }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => { setBusy(true); api('market:search', q).then(setRes, () => setRes([])).finally(() => setBusy(false)); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const add = async (r) => { await DB.save('watchlist', { id: r.symbol, symbol: r.symbol, name: r.name, sort: count }); onAdded(r.symbol); onClose(); };
  return (
    <Modal title={T("Tambah ke watchlist")} width={520} onClose={onClose}>
      <Field label={T("Cari saham, indeks, kurs, kripto")} hint={T("Contoh: BBRI, TLKM, ^JKSE, EURIDR=X, ETH-USD. Saham BEI berakhiran .JK")}>
        <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && /^[\w^.=-]+$/.test(q.trim())) add({ symbol: q.trim().toUpperCase(), name: q.trim().toUpperCase() }); }} />
      </Field>
      {busy && <Spinner />}
      <div className="col" style={{ gap: 4 }}>
        {res.map((r) => (
          <button key={r.symbol} className="mini-ev" onClick={() => add(r)}>
            <span style={{ fontWeight: 800, width: 90 }}>{r.symbol}</span>
            <span className="grow ellipsis">{r.name}</span>
            <span className="chip">{r.exchange}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
