// Slash commands for the quick-input assistant (components/QuickBot.jsx). Not AI: each command is
// a fixed list of steps. A step asks one thing; the answer goes into ctx[step.key].
// Step types: choice (buttons, options()), text, number (rupiah), date, time.
// `when(ctx)` skips a step, `optional` adds a "Lewati" button, summary() lists what will be saved.
import { api, DB } from './api.js';
import { rupiah } from './format.js';
import { toLocalDate, addDays, parseLocal, fmtDateLong, pad } from '../../shared/recur.js';
import { assetKey } from '../../shared/wealth.js';
import { T } from './i18n.js';

const day = (n) => toLocalDate(addDays(new Date(), n));
const nextMonday = () => { const d = new Date(); return toLocalDate(addDays(d, ((8 - d.getDay()) % 7) || 7)); };
export const dateLabel = (d) => (d ? fmtDateLong(parseLocal(d)) : T('Tanpa tanggal'));
const dateChoices = (extra = []) => [
  { label: T('Hari ini'), value: day(0) }, { label: T('Besok'), value: day(1) }, { label: T('Lusa'), value: day(2) },
  { label: T('Senin depan'), value: nextMonday() }, ...extra, { label: T('Pilih tanggal…'), value: '__date' }
];
const pastDateChoices = () => [{ label: T('Hari ini'), value: day(0) }, { label: T('Kemarin'), value: day(-1) }, { label: T('Pilih tanggal…'), value: '__date' }];

export const COMMANDS = [
  {
    id: 'keuangan', icon: 'wallet', label: T('Keuangan'), desc: T('Catat pengeluaran atau pemasukan'),
    steps: [
      { key: 'kind', type: 'choice', ask: () => T('Pengeluaran atau pemasukan?'), options: () => [{ label: T('Pengeluaran'), value: 'out' }, { label: T('Pemasukan'), value: 'in' }] },
      { key: 'category_id', type: 'choice', ask: () => T('Kategorinya?'), options: async (c) => (await DB.list('fin_categories', { where: { kind: c.kind, archived: { ne: 1 } }, order: 'sort' })).map((x) => ({ label: x.name, value: x.id })) },
      { key: 'amount', type: 'number', ask: () => T('Berapa nominalnya?'), placeholder: () => T('mis. 35.000') },
      { key: 'description', type: 'text', optional: true, ask: () => T('Keterangannya? (boleh dilewati)'), placeholder: () => T('mis. Makan siang') },
      { key: 'date', type: 'choice', ask: () => T('Tanggal transaksinya?'), options: pastDateChoices }
    ],
    summary: (c, L) => [[T('Jenis'), c.kind === 'in' ? T('Pemasukan') : T('Pengeluaran')], [T('Kategori'), L.category_id], [T('Nominal'), rupiah(c.amount)], [T('Keterangan'), c.description || '—'], [T('Tanggal'), dateLabel(c.date)]],
    run: async (c) => {
      await DB.save('fin_tx', { date: c.date, kind: c.kind, category_id: c.category_id, amount: c.amount, description: c.description || '' });
      return { text: c.kind === 'in' ? T('Pemasukan dicatat.') : T('Pengeluaran dicatat.'), nav: ['fin', { year: +c.date.slice(0, 4), month: +c.date.slice(5, 7), tab: 'month' }] };
    }
  },
  {
    id: 'tugas', icon: 'check', label: T('Tugas'), desc: T('Tambah tugas dengan tenggat dan prioritas'),
    steps: [
      { key: 'title', type: 'text', ask: () => T('Tugas apa?'), placeholder: () => T('mis. Revisi bab 3') },
      { key: 'due_date', type: 'choice', ask: () => T('Tenggatnya kapan?'), options: () => dateChoices([{ label: T('Tanpa tenggat'), value: '' }]) },
      { key: 'due_time', type: 'choice', when: (c) => !!c.due_date, ask: () => T('Jam berapa?'), options: () => [{ label: T('Tanpa jam'), value: '' }, { label: '09.00', value: '09:00' }, { label: '13.00', value: '13:00' }, { label: '17.00', value: '17:00' }, { label: '20.00', value: '20:00' }, { label: T('Pilih jam…'), value: '__time' }] },
      { key: 'priority', type: 'choice', ask: () => T('Prioritasnya?'), options: () => [{ label: T('Rendah'), value: 0 }, { label: T('Sedang'), value: 1 }, { label: T('Tinggi'), value: 2 }] },
      { key: 'tag', type: 'choice', ask: () => T('Masuk proyek / tag apa?'), allowText: true, options: async () => {
        const tags = [...new Set((await DB.list('tasks')).map((t) => t.tag).filter(Boolean))].sort();
        return [{ label: T('Tanpa tag'), value: '' }, ...tags.map((t) => ({ label: '#' + t, value: t }))];
      } }
    ],
    summary: (c, L) => [[T('Tugas'), c.title], [T('Tenggat'), c.due_date ? dateLabel(c.due_date) + (c.due_time ? ' · ' + c.due_time.replace(':', '.') : '') : T('Tanpa tenggat')], [T('Prioritas'), L.priority], [T('Tag'), c.tag ? '#' + c.tag : '—']],
    run: async (c) => {
      await DB.save('tasks', { title: c.title, due_date: c.due_date || null, due_time: c.due_time || null, priority: c.priority, tag: String(c.tag || '').replace(/\s|#/g, ''), done: 0, reminder_min: c.due_time ? 0 : -1, sort: Date.now() });
      return { text: T('Tugas ditambahkan.'), nav: ['focus', {}] };
    }
  },
  {
    id: 'acara', icon: 'cal', label: T('Acara'), desc: T('Buat acara atau pengingat di tanggal tertentu'),
    steps: [
      { key: 'title', type: 'text', ask: () => T('Nama acaranya?'), placeholder: () => T('mis. Bimbingan') },
      { key: 'date', type: 'choice', ask: () => T('Tanggal berapa?'), options: () => dateChoices() },
      { key: 'time', type: 'choice', ask: () => T('Jam berapa?'), options: () => [{ label: T('Seharian'), value: '' }, { label: '08.00', value: '08:00' }, { label: '10.00', value: '10:00' }, { label: '13.00', value: '13:00' }, { label: '16.00', value: '16:00' }, { label: '19.00', value: '19:00' }, { label: T('Pilih jam…'), value: '__time' }] },
      { key: 'dur', type: 'choice', when: (c) => !!c.time, ask: () => T('Berapa lama?'), options: () => [{ label: T('30 menit'), value: 30 }, { label: T('1 jam'), value: 60 }, { label: T('2 jam'), value: 120 }, { label: T('3 jam'), value: 180 }] },
      { key: 'reminder_min', type: 'choice', ask: () => T('Ingatkan kapan?'), options: (c) => (c.time
        ? [{ label: T('Tanpa pengingat'), value: -1 }, { label: T('Saat dimulai'), value: 0 }, { label: T('15 menit sebelum'), value: 15 }, { label: T('30 menit sebelum'), value: 30 }, { label: T('1 jam sebelum'), value: 60 }, { label: T('1 hari sebelum'), value: 1440 }]
        : [{ label: T('Tanpa pengingat'), value: -1 }, { label: T('Pagi hari itu'), value: 0 }, { label: T('1 hari sebelum'), value: 1440 }]) },
      { key: 'calendar_id', type: 'choice', ask: () => T('Masuk kalender apa?'), autoSingle: true, options: async () => (await DB.list('calendars', { order: 'sort' })).map((x) => ({ label: x.name, value: x.id })) }
    ],
    summary: (c, L) => [[T('Acara'), c.title], [T('Tanggal'), dateLabel(c.date)], [T('Jam'), c.time ? `${c.time.replace(':', '.')} · ${L.dur}` : T('Seharian')], [T('Pengingat'), L.reminder_min], [T('Kalender'), L.calendar_id || '—']],
    run: async (c) => {
      let start = c.date, end = c.date;
      if (c.time) {
        const [h, m] = c.time.split(':').map(Number);
        const e = new Date(parseLocal(c.date).getTime() + (h * 60 + m + (c.dur || 60)) * 60000);
        start = `${c.date}T${c.time}`;
        end = e.getHours() * 60 + e.getMinutes() > 0 && toLocalDate(e) === c.date ? `${c.date}T${pad(e.getHours())}:${pad(e.getMinutes())}` : `${c.date}T23:59`;
      }
      await DB.save('events', { title: c.title, start, end, all_day: c.time ? 0 : 1, calendar_id: c.calendar_id, repeat: 'none', reminder_min: c.reminder_min });
      return { text: T('Acara dibuat.'), nav: ['cal', { date: c.date }] };
    }
  },
  {
    id: 'catatan', icon: 'note', label: T('Catatan'), desc: T('Tulis catatan singkat'),
    steps: [
      { key: 'title', type: 'text', ask: () => T('Judul catatan?'), placeholder: () => T('mis. Ide fitur') },
      { key: 'body', type: 'text', multiline: true, optional: true, ask: () => T('Isinya? (Shift+Enter untuk baris baru)'), placeholder: () => T('Tulis isi catatan…') }
    ],
    summary: (c) => [[T('Judul'), c.title], [T('Isi'), c.body ? (c.body.length > 120 ? c.body.slice(0, 120) + '…' : c.body) : '—']],
    run: async (c) => {
      const lines = String(c.body || '').split('\n');
      const n = await DB.save('notes', { title: c.title, content: JSON.stringify({ type: 'doc', content: lines.map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) }), plain: c.body || '', ink: '[]', tag: '', pinned: 0 });
      return { text: T('Catatan disimpan.'), nav: ['notes', { noteId: n.id }] };
    }
  },
  {
    id: 'wealth', icon: 'pie', label: T('Total Wealth'), desc: T('Perbarui saldo satu akun'),
    steps: [
      { key: 'acc', type: 'choice', ask: () => T('Akun yang mana?'), options: async (c, app) => {
        const cols = app.settings.wealthCols || [];
        const rows = await DB.list('wealth', { order: 'date' });
        const seen = new Map();
        for (const x of [...cols, ...rows]) { const k = assetKey(x); if (x.name && !seen.has(k)) seen.set(k, { name: x.name, category: x.category || '' }); }
        return [...seen.values()].map((x) => ({ label: x.name, value: JSON.stringify(x) }));
      }, empty: () => T('Belum ada akun. Buat kolom akun dulu di Keuangan → Total Wealth.') },
      { key: 'value', type: 'number', signed: true, ask: () => T('Saldonya sekarang berapa? (utang tulis negatif)'), placeholder: () => T('mis. 1.250.000') },
      { key: 'date', type: 'choice', ask: () => T('Per tanggal?'), options: pastDateChoices }
    ],
    summary: (c, L) => [[T('Akun'), L.acc], [T('Saldo'), rupiah(c.value)], [T('Tanggal'), dateLabel(c.date)]],
    run: async (c) => {
      const acc = JSON.parse(c.acc);
      await api('wealth:import', [{ date: c.date, name: acc.name, category: acc.category, value: c.value }]);
      return { text: T('Saldo diperbarui.'), nav: ['fin', { tab: 'wealth' }] };
    }
  },
  {
    id: 'kebiasaan', icon: 'checklist', label: T('Kebiasaan'), desc: T('Centang kebiasaan yang sudah dilakukan'),
    steps: [
      { key: 'habit', type: 'choice', ask: () => T('Kebiasaan yang mana?'), options: async () => (await DB.list('habits', { where: { archived: { ne: 1 } }, order: 'sort' })).map((h) => ({ label: h.name, value: h.id })), empty: () => T('Belum ada kebiasaan. Buat dulu di Fokus & Tugas.') },
      { key: 'date', type: 'choice', ask: () => T('Untuk tanggal?'), options: pastDateChoices }
    ],
    summary: (c, L) => [[T('Kebiasaan'), L.habit], [T('Tanggal'), dateLabel(c.date)]],
    run: async (c) => {
      await DB.save('habit_logs', { id: `${c.habit}|${c.date}`, habit_id: c.habit, date: c.date });
      return { text: T('Kebiasaan dicentang.'), nav: ['focus', {}] };
    }
  }
];

export const findCommand = (q) => {
  const s = String(q || '').trim().replace(/^\//, '').toLowerCase();
  return COMMANDS.find((c) => c.id === s || c.label.toLowerCase() === s) || null;
};
