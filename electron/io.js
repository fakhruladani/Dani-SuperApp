// Import / export: Excel + CSV (finance), ICS (calendar).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as db from './db.js';
import { MONTH_ID, parseLocal, pad } from '../shared/recur.js';
import { wealthSummary } from '../shared/wealth.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const catName = () => Object.fromEntries(db.list('fin_categories').map((c) => [c.id, c.name]));

export async function exportFinanceXlsx(year, filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dani SuperApp';
  const names = catName();
  const money = '"Rp" #,##0;[Red]-"Rp" #,##0';
  const head = (ws, cols) => {
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EDFC' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  // recap
  const rec = db.finRecap(year);
  const wr = wb.addWorksheet('Rekap ' + year);
  head(wr, [{ header: 'Bulan', key: 'b', width: 14 }, { header: 'Pemasukan', key: 'i', width: 18, style: { numFmt: money } }, { header: 'Pengeluaran', key: 'o', width: 18, style: { numFmt: money } }, { header: 'Selisih', key: 's', width: 18, style: { numFmt: money } }]);
  rec.months.forEach((m, i) => wr.addRow({ b: MONTH_ID[i], i: m.in, o: m.out, s: { formula: `B${i + 2}-C${i + 2}` } }));
  const tr = wr.addRow({ b: 'Total', i: { formula: 'SUM(B2:B13)' }, o: { formula: 'SUM(C2:C13)' }, s: { formula: 'B14-C14' } });
  tr.font = { bold: true };
  // category matrix
  const wc = wb.addWorksheet('Per kategori');
  head(wc, [{ header: 'Kategori', key: 'k', width: 22 }, { header: 'Jenis', key: 'j', width: 10 }, ...MONTH_ID.map((m, i) => ({ header: m.slice(0, 3), key: 'm' + i, width: 13, style: { numFmt: money } })), { header: 'Total', key: 't', width: 16, style: { numFmt: money } }]);
  rec.categories.sort((a, b) => (a.kind > b.kind ? 1 : -1)).forEach((c) => {
    const row = { k: names[c.category_id] || '(tanpa kategori)', j: c.kind === 'in' ? 'Masuk' : 'Keluar', t: c.total };
    c.months.forEach((v, i) => { row['m' + i] = v; });
    wc.addRow(row);
  });
  // monthly sheets
  for (let m = 1; m <= 12; m++) {
    const rows = db.list('fin_tx', { where: { date: { prefix: `${year}-${pad(m)}` } }, order: 'date' });
    const ws = wb.addWorksheet(MONTH_ID[m - 1]);
    head(ws, [{ header: 'Tanggal', key: 'd', width: 12 }, { header: 'Keterangan', key: 'k', width: 34 }, { header: 'Kategori', key: 'c', width: 20 }, { header: 'Masuk', key: 'i', width: 16, style: { numFmt: money } }, { header: 'Keluar', key: 'o', width: 16, style: { numFmt: money } }, { header: 'Catatan', key: 'n', width: 30 }]);
    rows.forEach((r) => ws.addRow({ d: r.date, k: r.description, c: names[r.category_id] || '', i: r.kind === 'in' ? r.amount : null, o: r.kind === 'out' ? r.amount : null, n: r.note || '' }));
    const n = rows.length + 1;
    const t = ws.addRow({ k: 'Total', i: { formula: `SUM(D2:D${Math.max(2, n)})` }, o: { formula: `SUM(E2:E${Math.max(2, n)})` } });
    t.font = { bold: true };
  }
  // total wealth (all dates; only the newest value per asset counts)
  const wrows = db.list('wealth', { order: 'date desc' });
  const ws = wealthSummary(wrows);
  const ww = wb.addWorksheet('Total Wealth');
  head(ww, [{ header: 'Tanggal', key: 'd', width: 12 }, { header: 'Kategori', key: 'c', width: 18 }, { header: 'Nama aset', key: 'a', width: 28 }, { header: 'Nilai', key: 'v', width: 18, style: { numFmt: money } }, { header: 'Status', key: 's', width: 12 }, { header: 'Catatan', key: 'n', width: 30 }]);
  wrows.forEach((r) => ww.addRow({ d: r.date, c: r.category, a: r.name, v: r.value, s: ws.currentIds.has(r.id) ? 'dihitung' : 'riwayat', n: r.note || '' }));
  ww.addRow({});
  ws.categories.forEach((c) => ww.addRow({ c: c.name, a: 'Total kategori', v: c.total }));
  const tw = ww.addRow({ c: 'TOTAL BERSIH', v: ws.net });
  tw.font = { bold: true };
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function exportFinanceCsv(year, filePath) {
  const names = catName();
  const rows = db.list('fin_tx', { where: { date: { prefix: String(year) } }, order: 'date' });
  const lines = ['tanggal,keterangan,kategori,jenis,nominal,catatan'];
  rows.forEach((r) => lines.push([r.date, r.description, names[r.category_id] || '', r.kind === 'in' ? 'masuk' : 'keluar', r.amount, r.note || ''].map(csvCell).join(',')));
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf8');
  return rows.length;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function importFinanceCsv(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const idx = (names) => header.findIndex((h) => names.includes(h));
  const iD = idx(['tanggal', 'date', 'tgl']), iK = idx(['keterangan', 'deskripsi', 'description']), iC = idx(['kategori', 'category']), iJ = idx(['jenis', 'tipe', 'type', 'kind']), iN = idx(['nominal', 'jumlah', 'amount']), iNote = idx(['catatan', 'note']);
  if (iD < 0 || iN < 0) throw new Error('Kolom wajib: tanggal, nominal');
  const cats = db.list('fin_categories');
  let count = 0;
  for (const r of rows) {
    if (!r[iD]) continue;
    let date = r[iD].trim();
    const m = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) date = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let amount = Number(String(r[iN]).replace(/[^\d-]/g, '')) || 0;
    let kind = iJ >= 0 ? (/^(in|masuk|pemasukan|income)/i.test(r[iJ]) ? 'in' : 'out') : (amount < 0 ? 'out' : 'in');
    amount = Math.abs(amount);
    const cname = iC >= 0 ? r[iC].trim() : '';
    let cat = cats.find((c) => c.name.toLowerCase() === cname.toLowerCase() && c.kind === kind);
    if (!cat && cname) { cat = db.upsert('fin_categories', { name: cname, kind, budget: 0, sort: cats.length, archived: 0 }, true); cats.push(cat); }
    db.upsert('fin_tx', { date, description: iK >= 0 ? r[iK] : '', category_id: cat?.id || null, kind, amount, note: iNote >= 0 ? r[iNote] : '' }, true);
    count++;
  }
  db.upsert('settings', { id: 'import.last', value: JSON.stringify(new Date().toISOString()) });
  return count;
}

// ---------------- ICS ----------------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsDate = (s, allDay) => {
  const d = parseLocal(s);
  return allDay ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};

export function exportIcs(filePath) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dani SuperApp//ID', 'CALSCALE:GREGORIAN', 'X-WR-TIMEZONE:Asia/Jakarta'];
  for (const e of db.list('events')) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@dani-superapp`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (e.all_day) {
      const endEx = parseLocal(e.end || e.start); endEx.setDate(endEx.getDate() + 1);
      L.push(`DTSTART;VALUE=DATE:${icsDate(e.start, true)}`, `DTEND;VALUE=DATE:${endEx.getFullYear()}${pad(endEx.getMonth() + 1)}${pad(endEx.getDate())}`);
    } else {
      L.push(`DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end || e.start)}`);
    }
    L.push(`SUMMARY:${icsEsc(e.title)}`);
    if (e.description) L.push(`DESCRIPTION:${icsEsc(e.description)}`);
    if (e.location) L.push(`LOCATION:${icsEsc(e.location)}`);
    if (e.repeat && e.repeat !== 'none') L.push(`RRULE:FREQ=${e.repeat.toUpperCase()}${e.repeat_until ? ';UNTIL=' + e.repeat_until.replace(/-/g, '') : ''}`);
    if (e.reminder_min >= 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${e.reminder_min}M`, `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  fs.writeFileSync(filePath, L.join('\r\n'), 'utf8');
  return filePath;
}

export function importIcs(filePath, calendarId) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/\r?\n[ \t]/g, '');
  const un = (s) => (s || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  let n = 0;
  for (const blk of text.split('BEGIN:VEVENT').slice(1)) {
    const body = blk.split('END:VEVENT')[0];
    const g = (k) => body.match(new RegExp('^' + k + '(;[^:]*)?:(.*)$', 'm'));
    const ds = g('DTSTART'); if (!ds) continue;
    const allDay = /VALUE=DATE/.test(ds[1] || '') || /^\d{8}$/.test(ds[2].trim());
    const conv = (v) => { v = v.trim(); const base = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`; if (allDay || v.length < 13) return base; let d = new Date(`${base}T${v.slice(9, 11)}:${v.slice(11, 13)}:00${v.endsWith('Z') ? 'Z' : ''}`); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const start = conv(ds[2]);
    const de = g('DTEND');
    let end = de ? conv(de[2]) : start;
    if (allDay && de) { const d = parseLocal(end); d.setDate(d.getDate() - 1); end = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    const rr = g('RRULE')?.[2] || '';
    const freq = (rr.match(/FREQ=(\w+)/) || [])[1]?.toLowerCase();
    const untilRaw = (rr.match(/UNTIL=(\d{8})/) || [])[1];
    const trig = body.match(/TRIGGER[^:]*:-?P(?:T(?:(\d+)H)?(?:(\d+)M)?|(\d+)D)/);
    const reminder = trig ? (Number(trig[1] || 0) * 60 + Number(trig[2] || 0) + Number(trig[3] || 0) * 1440) : -1;
    db.upsert('events', {
      title: un(g('SUMMARY')?.[2]) || '(tanpa judul)', description: un(g('DESCRIPTION')?.[2]), location: un(g('LOCATION')?.[2]),
      start, end, all_day: allDay ? 1 : 0, calendar_id: calendarId, repeat: ['daily', 'weekly', 'monthly', 'yearly'].includes(freq) ? freq : 'none',
      repeat_until: untilRaw ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}` : null, reminder_min: reminder
    }, true);
    n++;
  }
  db.upsert('settings', { id: 'import.lastIcs', value: JSON.stringify(new Date().toISOString()) });
  return n;
}
