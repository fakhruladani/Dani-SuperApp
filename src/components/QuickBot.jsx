import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useApp } from '../lib/api.js';
import { parseAmount, rupiah } from '../lib/format.js';
import { COMMANDS, findCommand } from '../lib/commands.js';
import { T } from '../lib/i18n.js';

// Small assistant in the bottom-right corner. Not AI: "/" opens the commands, each command asks
// its steps one by one (buttons or a short input), shows a summary, then saves into the app.

const bot = (text, extra = {}) => ({ from: 'bot', text, ...extra });
const me = (text) => ({ from: 'me', text });

export default function QuickBot() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(() => [bot(T('Halo! Ketik / atau klik tombol / untuk memilih perintah.'))]);
  const [flow, setFlow] = useState(null); // { cmd, i, ctx, labels, opts, mode, done }
  const [text, setText] = useState('');
  const [slash, setSlash] = useState(false);
  const [sel, setSel] = useState(0);
  const listRef = useRef();
  const inputRef = useRef();
  const flowRef = useRef(flow); flowRef.current = flow;

  const push = (...m) => setMsgs((x) => [...x, ...m].slice(-80));
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, flow, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open, flow?.i, flow?.mode]);
  // Ctrl+/ toggles the assistant
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal, .ctx-menu')) setOpen(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const step = flow && !flow.done ? flow.cmd.steps[flow.i] : null;
  const cmds = COMMANDS.filter((c) => !text.startsWith('/') || ('/' + c.id).startsWith(text.toLowerCase().trim()) || c.label.toLowerCase().startsWith(text.slice(1).toLowerCase().trim()));
  const showSlash = slash || (text.startsWith('/') && !step?.multiline);

  // ask the next step that applies (from index i); none left -> summary
  const ask = async (cmd, i, ctx, labels) => {
    let j = i;
    while (j < cmd.steps.length && cmd.steps[j].when && !cmd.steps[j].when(ctx)) j++;
    if (j >= cmd.steps.length) {
      setFlow({ cmd, i: j, ctx, labels, done: true });
      push(bot(T('Cek dulu sebelum disimpan:'), { summary: cmd.summary(ctx, labels) }));
      return;
    }
    const s = cmd.steps[j];
    let opts = null;
    if (s.type === 'choice') {
      opts = await s.options(ctx, app);
      if (!opts.length) { push(bot(s.empty ? s.empty() : T('Tidak ada pilihan.'))); setFlow(null); return; }
      if (s.autoSingle && opts.length === 1) { labels = { ...labels, [s.key]: opts[0].label }; return ask(cmd, j + 1, { ...ctx, [s.key]: opts[0].value }, labels); }
    }
    push(bot(s.ask(ctx)));
    setFlow({ cmd, i: j, ctx, labels, opts, mode: null });
  };

  const start = (cmd) => {
    setText(''); setSlash(false); setSel(0);
    if (flowRef.current && !flowRef.current.saved) push(bot(T('Perintah sebelumnya dibatalkan.'), { muted: true }));
    push(me('/' + cmd.id));
    ask(cmd, 0, {}, {});
  };
  const answer = (value, label) => {
    const f = flowRef.current;
    if (!f || f.done || f.busy) return;
    const s = f.cmd.steps[f.i];
    if (value === '__date' || value === '__time') { setFlow({ ...f, mode: value === '__date' ? 'date' : 'time' }); return; }
    setText('');
    push(me(label));
    flowRef.current = { ...f, busy: true };
    setFlow(flowRef.current);
    ask(f.cmd, f.i + 1, { ...f.ctx, [s.key]: value }, { ...f.labels, [s.key]: label });
  };
  const cancel = () => { setFlow(null); setText(''); push(bot(T('Dibatalkan.'), { muted: true })); };
  const save = async () => {
    const f = flowRef.current;
    if (!f?.done || f.busy) return;
    flowRef.current = { ...f, busy: true };
    setFlow(flowRef.current);
    try {
      const r = await f.cmd.run(f.ctx, app);
      setFlow(null);
      push(bot('✓ ' + r.text, { ok: true, nav: r.nav }));
    } catch (e) {
      setFlow({ ...f, busy: false });
      push(bot(T('Gagal menyimpan: {e}', { e: String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }), { error: true }));
    }
  };

  const submit = () => {
    const t = text.trim();
    if (showSlash) {
      const c = findCommand(t) || cmds[sel] || cmds[0];
      if (c) start(c);
      return;
    }
    if (!step) {
      if (!t) return;
      const c = findCommand(t);
      if (c) start(c); else { push(me(t), bot(T('Perintah tidak dikenal. Ketik / untuk melihat daftar perintah.'))); setText(''); }
      return;
    }
    if (flow.mode === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) answer(t, T('Tanggal {d}', { d: t })); return; }
    if (flow.mode === 'time') { if (/^\d{2}:\d{2}$/.test(t)) answer(t, t.replace(':', '.')); return; }
    if (step.type === 'choice') {
      const low = t.toLowerCase().replace(/^#/, '');
      const o = flow.opts.find((x) => x.label.toLowerCase().replace(/^#/, '') === low) || (!step.allowText && t && flow.opts.find((x) => x.label.toLowerCase().startsWith(low)));
      if (o && !o.value?.toString().startsWith('__')) answer(o.value, o.label);
      else if (step.allowText && t) answer(t.replace(/\s|#/g, ''), '#' + t.replace(/\s|#/g, ''));
      return;
    }
    if (step.type === 'number') {
      const n = (step.signed && /^\s*[-−]/.test(t) ? -1 : 1) * parseAmount(t);
      if (!/\d/.test(t) || (!n && !step.signed)) { push(bot(T('Masukkan angka, mis. 35000.'), { muted: true })); return; }
      answer(n, rupiah(n));
      return;
    }
    if (!t && !step.optional) return;
    answer(t, t || T('(dilewati)'));
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (showSlash) { setSlash(false); if (text.startsWith('/')) setText(''); } else setOpen(false); return; }
    if (showSlash && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSel((x) => (x + (e.key === 'ArrowDown' ? 1 : -1) + cmds.length) % Math.max(1, cmds.length)); return; }
    if (e.key === 'Enter' && !(step?.multiline && e.shiftKey && !showSlash)) { e.preventDefault(); submit(); }
  };
  const onChange = (v) => {
    setText(v);
    setSel(0);
    if (v === '/' && !step?.multiline) setSlash(true);
    else if (!v.startsWith('/')) setSlash(false);
  };

  const formatNumber = step?.type === 'number' && !flow.mode;
  const inputType = flow?.mode === 'date' ? 'date' : flow?.mode === 'time' ? 'time' : 'text';
  const placeholder = flow?.mode === 'date' ? '' : step?.placeholder ? step.placeholder(flow.ctx) : step?.type === 'choice' ? T('Pilih di atas, atau ketik lalu Enter') : flow?.done ? T('Klik Simpan atau Batal') : T('Ketik / untuk perintah…');

  return (
    <>
      {open && (
        <section className="qb card" role="dialog" aria-label={T('Asisten input cepat')}>
          <header className="qb-head">
            <span className="qb-logo"><Icon name="chat" size="sm" /></span>
            <div className="col grow" style={{ gap: 0 }}>
              <strong style={{ fontSize: 14 }}>{T('Input cepat')}</strong>
              <span className="mut" style={{ fontSize: 11 }}>{T('Ketik / untuk perintah · Ctrl+/ buka-tutup')}</span>
            </div>
            <button className="icb sm" aria-label={T('Bersihkan percakapan')} title={T('Bersihkan percakapan')} onClick={() => { setMsgs([bot(T('Halo! Ketik / atau klik tombol / untuk memilih perintah.'))]); setFlow(null); }}><Icon name="erase" size="sm" /></button>
            <button className="icb sm" aria-label={T('Tutup')} onClick={() => setOpen(false)}><Icon name="x" size="sm" /></button>
          </header>

          <div className="qb-list" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`qb-msg ${m.from} ${m.muted ? 'muted' : ''} ${m.error ? 'err' : ''} ${m.ok ? 'ok' : ''}`}>
                <div className="qb-bubble">
                  {m.text}
                  {m.summary && (
                    <dl className="qb-sum">{m.summary.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                  )}
                  {m.nav && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => app.nav(m.nav[0], m.nav[1])}><Icon name="external" size="sm" />{T('Lihat')}</button>}
                </div>
              </div>
            ))}
            {!flow && !showSlash && (
              <div className="qb-chips">
                {COMMANDS.map((c) => <button key={c.id} className="chip" onClick={() => start(c)}>/{c.id}</button>)}
              </div>
            )}
          </div>

          {step && step.type === 'choice' && !flow.mode && !flow.busy && (
            <div className="qb-opts">
              {flow.opts.map((o) => <button key={String(o.value)} className="btn sm" onClick={() => answer(o.value, o.label)}>{o.label}</button>)}
            </div>
          )}
          {step?.optional && !flow.mode && <div className="qb-opts"><button className="btn sm ghost" onClick={() => answer('', T('(dilewati)'))}>{T('Lewati')}</button></div>}
          {flow?.done && (
            <div className="qb-opts">
              <button className="btn sm pri" onClick={save}><Icon name="check" size="sm" />{T('Simpan')}</button>
              <button className="btn sm" onClick={cancel}>{T('Batal')}</button>
            </div>
          )}

          {showSlash && (
            <div className="qb-slash" role="listbox" aria-label={T('Perintah')}>
              {cmds.length === 0 && <span className="mut" style={{ padding: 8, fontSize: 13 }}>{T('Tidak ada perintah yang cocok.')}</span>}
              {cmds.map((c, i) => (
                <button key={c.id} role="option" aria-selected={i === sel} className={`qb-cmd ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => start(c)}>
                  <Icon name={c.icon} size="sm" />
                  <span className="col grow" style={{ gap: 0, alignItems: 'flex-start' }}><strong>/{c.id}</strong><span className="mut" style={{ fontSize: 12 }}>{c.desc}</span></span>
                </button>
              ))}
            </div>
          )}

          <footer className="qb-foot">
            <button className={`qb-slashbtn ${showSlash ? 'on' : ''}`} aria-label={T('Daftar perintah')} title={T('Daftar perintah')} onClick={() => { setSlash(!showSlash); if (showSlash && text.startsWith('/')) setText(''); inputRef.current?.focus(); }}>/</button>
            {step?.multiline && !flow.mode
              ? <textarea ref={inputRef} className="field qb-input" rows={3} value={text} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
              : <input ref={inputRef} className="field qb-input" type={inputType} inputMode={formatNumber ? 'numeric' : undefined} value={text} placeholder={placeholder}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (formatNumber && !v.startsWith('/')) { const neg = step.signed && /^\s*[-−]/.test(v); const n = parseAmount(v); onChange(v === '' ? '' : (neg ? '-' : '') + (n ? n.toLocaleString('id-ID') : '')); }
                    else onChange(v);
                  }} onKeyDown={onKey} disabled={flow?.done} />}
            {flow && !flow.done && <button className="icb sm" aria-label={T('Batalkan perintah')} title={T('Batalkan perintah')} onClick={cancel}><Icon name="x" size="sm" /></button>}
            <button className="icb sm pri" aria-label={T('Kirim')} onClick={submit} disabled={flow?.done}><Icon name="right" size="sm" /></button>
          </footer>
        </section>
      )}
      <button className={`qb-fab ${open ? 'on' : ''}`} aria-label={open ? T('Tutup input cepat') : T('Buka input cepat (Ctrl+/)')} title={T('Input cepat (Ctrl+/)')} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'x' : 'chat'} />
      </button>
    </>
  );
}
