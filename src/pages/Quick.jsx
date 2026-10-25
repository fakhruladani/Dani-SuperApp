import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Seg } from '../components/ui.jsx';
import { api, DB, on } from '../lib/api.js';
import { parseQuickTask, toLocalDate, pad } from '../../shared/recur.js';
import { parseAmount, formatAmountInput } from '../lib/format.js';

export default function Quick() {
  const [mode, setMode] = useState('task');
  const [text, setText] = useState('');
  const [date, setDate] = useState(toLocalDate(new Date()));
  const [time, setTime] = useState(`${pad((new Date().getHours() + 1) % 24)}:00`);
  const [kind, setKind] = useState('out');
  const [amount, setAmount] = useState('');
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  const [done, setDone] = useState('');
  const ref = useRef();

  useEffect(() => {
    DB.list('fin_categories', { order: 'sort' }).then(setCats);
    const off = on('quick:shown', () => { setTimeout(() => ref.current?.focus(), 30); setDone(''); });
    const k = (e) => { if (e.key === 'Escape') api('win:hideSelf'); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => { off(); window.removeEventListener('keydown', k); };
  }, []);
  useEffect(() => { ref.current?.focus(); }, [mode]);
  const list = cats.filter((c) => c.kind === kind && !c.archived);
  useEffect(() => { setCat(list[0]?.id || ''); }, [kind, cats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!text.trim() && mode !== 'tx') return;
    if (mode === 'task') {
      const p = parseQuickTask(text);
      await DB.save('tasks', { ...p, done: 0, reminder_min: p.due_time ? 0 : -1, sort: Date.now() });
      setDone(`Tugas ditambahkan${p.due_date ? ` · ${p.due_date}${p.due_time ? ' ' + p.due_time : ''}` : ''}`);
    } else if (mode === 'note') {
      const lines = text.split('\n');
      await DB.save('notes', { title: lines[0].slice(0, 60), content: JSON.stringify({ type: 'doc', content: lines.slice(1).map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) }), plain: text, ink: '[]', pinned: 0, tag: 'cepat' });
      setDone('Catatan disimpan');
    } else if (mode === 'rem') {
      const [h, m] = time.split(':').map(Number);
      const cal = (await DB.list('calendars', { order: 'sort', limit: 1 }))[0];
      await DB.save('events', { title: text.trim(), start: `${date}T${time}`, end: `${date}T${pad(Math.min(23, h + 1))}:${pad(m)}`, all_day: 0, calendar_id: cal?.id, repeat: 'none', reminder_min: 10 });
      setDone(`Pengingat ${date} ${time} (notifikasi 10 menit sebelum)`);
    } else {
      const a = parseAmount(amount);
      if (!a) return;
      await DB.save('fin_tx', { date: toLocalDate(new Date()), kind, amount: a, description: text, category_id: cat });
      setDone('Transaksi dicatat');
      setAmount('');
    }
    setText('');
    setTimeout(() => api('win:hideSelf'), 900);
  };

  return (
    <div className="win-small" style={{ padding: 16, gap: 12 }}>
      <div className="row drag">
        <div className="logo" style={{ width: 28, height: 28, fontSize: 14, borderRadius: 8 }}>D</div>
        <strong className="grow">Catatan cepat</strong>
        <span className="kbd nodrag">Esc</span>
        <button className="icb sm nodrag" aria-label="Tutup" onClick={() => api('win:hideSelf')}><Icon name="x" size="sm" /></button>
      </div>
      <div className="nodrag"><Seg label="Jenis" value={mode} onChange={setMode} options={[{ value: 'task', label: 'Tugas' }, { value: 'note', label: 'Catatan' }, { value: 'rem', label: 'Pengingat' }, { value: 'tx', label: 'Transaksi' }]} /></div>
      {mode === 'note' ? (
        <textarea ref={ref} className="field" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Baris pertama jadi judul… (Ctrl+Enter untuk simpan)" onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && submit()} aria-label="Isi catatan" />
      ) : (
        <input ref={ref} className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="Teks"
          placeholder={mode === 'task' ? 'mis. kirim revisi ke dosen besok 10.00 #TA' : mode === 'rem' ? 'Judul pengingat' : 'Keterangan, mis. makan siang'} style={{ fontSize: 16, minHeight: 46 }} />
      )}
      {mode === 'rem' && (
        <div className="row"><input type="date" className="field" aria-label="Tanggal" value={date} onChange={(e) => setDate(e.target.value)} /><input type="time" className="field" aria-label="Jam" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      )}
      {mode === 'tx' && (
        <div className="row">
          <select className="field" aria-label="Jenis" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 130 }}><option value="out">Keluar</option><option value="in">Masuk</option></select>
          <input className="field num" aria-label="Nominal" inputMode="numeric" placeholder="Rp 0" value={amount} onChange={(e) => setAmount(formatAmountInput(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <select className="field" aria-label="Kategori" value={cat} onChange={(e) => setCat(e.target.value)}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
      )}
      {mode === 'task' && text && (() => { const p = parseQuickTask(text); return <span className="mut" style={{ fontSize: 12 }}>→ {p.title}{p.due_date ? ` · ${p.due_date}` : ''}{p.due_time ? ` ${p.due_time}` : ''}{p.tag ? ` · #${p.tag}` : ''}</span>; })()}
      <div className="row" style={{ marginTop: 'auto' }}>
        <span className="grow up" style={{ fontWeight: 600 }}>{done}</span>
        <button className="btn ghost" onClick={() => api('win:show', { nav: mode === 'task' ? 'focus' : mode === 'note' ? 'notes' : mode === 'rem' ? 'cal' : 'fin' })}>Buka aplikasi</button>
        <button className="btn pri" onClick={submit}><Icon name="check" size="sm" />Simpan</button>
      </div>
    </div>
  );
}
