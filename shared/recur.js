// Shared date + recurrence helpers (used by Electron main and the React renderer).
// Dates are stored as local wall-clock strings: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'.

export const pad = (n) => String(n).padStart(2, '0');

export function parseLocal(s) {
  if (!s) return null;
  const [d, t] = String(s).split('T');
  const [y, m, day] = d.split('-').map(Number);
  let hh = 0, mm = 0;
  if (t) [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, 0, 0);
}

export function toLocalDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d) {
  return `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Adds months keeping the day-of-month; returns null when that day does not exist
// in the target month (e.g. the 31st), so such occurrences are skipped.
function addMonthsStrict(base, n) {
  const x = new Date(base.getFullYear(), base.getMonth() + n, 1, base.getHours(), base.getMinutes());
  const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  if (base.getDate() > lastDay) return null;
  x.setDate(base.getDate());
  return x;
}

/**
 * Expand an event row into concrete occurrences overlapping [rangeStart, rangeEnd).
 * Event: { id, start, end, all_day, repeat: none|daily|weekly|monthly|yearly, repeat_until }
 */
export function expandEvent(ev, rangeStart, rangeEnd) {
  const start = parseLocal(ev.start);
  if (!start) return [];
  let end = parseLocal(ev.end);
  if (ev.all_day) {
    // all-day end is inclusive date in storage -> exclusive next-day midnight
    end = end ? addDays(new Date(end.getFullYear(), end.getMonth(), end.getDate()), 1) : addDays(start, 1);
  } else if (!end || end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  const dur = end - start;
  const until = ev.repeat_until ? addDays(parseLocal(ev.repeat_until), 1) : null;
  const out = [];
  const push = (s) => {
    const e = new Date(s.getTime() + dur);
    if (e > rangeStart && s < rangeEnd && (!until || s < until)) {
      out.push({ ...ev, occStart: s, occEnd: e, key: `${ev.id}|${toLocalDateTime(s)}` });
    }
  };
  const rep = ev.repeat || 'none';
  if (rep === 'none') { push(start); return out; }

  const limit = until && until < rangeEnd ? until : rangeEnd;
  if (rep === 'daily' || rep === 'weekly') {
    const step = rep === 'daily' ? 1 : 7;
    // jump close to rangeStart
    const dayMs = 86400000;
    let k = Math.max(0, Math.floor((rangeStart - start - dur) / (step * dayMs)) - 1);
    for (let i = 0; i < 2000; i++, k++) {
      const s = addDays(start, k * step);
      if (s >= limit) break;
      push(s);
    }
  } else if (rep === 'monthly' || rep === 'yearly') {
    const stepM = rep === 'monthly' ? 1 : 12;
    let k = 0;
    const monthsBetween = (rangeStart.getFullYear() - start.getFullYear()) * 12 + rangeStart.getMonth() - start.getMonth();
    if (monthsBetween > 2) k = Math.floor((monthsBetween - 2) / stepM);
    for (let i = 0; i < 1200; i++, k++) {
      const s = addMonthsStrict(start, k * stepM);
      if (s === null) continue;
      if (s >= limit) break;
      push(s);
    }
  }
  return out;
}

export function expandAll(events, rangeStart, rangeEnd) {
  const all = [];
  for (const ev of events) all.push(...expandEvent(ev, rangeStart, rangeEnd));
  all.sort((a, b) => a.occStart - b.occStart);
  return all;
}

// Time a reminder for an occurrence should fire.
export function reminderTime(occ, minutesBefore, allDayHour = 7) {
  if (minutesBefore == null || minutesBefore < 0) return null;
  const s = new Date(occ.occStart);
  if (occ.all_day) s.setHours(allDayHour, 0, 0, 0);
  return new Date(s.getTime() - minutesBefore * 60000);
}

export const REPEAT_LABEL = { none: 'Tidak berulang', daily: 'Setiap hari', weekly: 'Setiap minggu', monthly: 'Setiap bulan', yearly: 'Setiap tahun' };
export const DOW_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtDateLong(d) {
  return `${DOW_ID[d.getDay()]}, ${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtTime(d) {
  return `${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

// --- Indonesian quick-add parser: "revisi abstrak besok 09.00 #TA !tinggi" ---
const DOW_MAP = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
export function parseQuickTask(text, now = new Date()) {
  let t = ' ' + text.trim() + ' ';
  let due_date = null, due_time = null, tag = '', priority = 0;
  const take = (re, fn) => { const m = t.match(re); if (m) { fn(m); t = t.replace(m[0], ' '); } };
  take(/\s#([\w-]+)/i, (m) => { tag = m[1]; });
  take(/\s!(tinggi|penting|high|sedang|medium|rendah|low)\b/i, (m) => {
    const v = m[1].toLowerCase();
    priority = ['tinggi', 'penting', 'high'].includes(v) ? 2 : ['sedang', 'medium'].includes(v) ? 1 : 0;
  });
  take(/\s(?:jam|pukul|pkl\.?)?\s*([01]?\d|2[0-3])[.:]([0-5]\d)\b/i, (m) => { due_time = `${pad(+m[1])}:${m[2]}`; });
  if (!due_time) take(/\s(?:jam|pukul)\s+([01]?\d|2[0-3])\b/i, (m) => { due_time = `${pad(+m[1])}:00`; });
  take(/\s(hari ini|nanti|besok|lusa)\b/i, (m) => {
    const v = m[1].toLowerCase();
    const off = v === 'besok' ? 1 : v === 'lusa' ? 2 : 0;
    due_date = toLocalDate(addDays(now, off));
  });
  if (!due_date) take(/\s(minggu|senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\b/i, (m) => {
    const target = DOW_MAP[m[1].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    due_date = toLocalDate(addDays(now, diff));
  });
  if (!due_date) take(/\s(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/, (m) => {
    let y = m[3] ? +m[3] : now.getFullYear();
    if (y < 100) y += 2000;
    due_date = `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  });
  if (due_time && !due_date) due_date = toLocalDate(now);
  return { title: t.replace(/\s+/g, ' ').trim(), due_date, due_time, tag, priority };
}
