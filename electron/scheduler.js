// Background engine in the main process: reminders (events + tasks), missed reminders
// after the laptop was off/asleep, morning brief, price alerts, auto backup.
// Works on absolute wall-clock times, so sleep/resume and clock changes are safe.
import * as db from './db.js';
import * as svc from './services.js';
import { expandAll, reminderTime, parseLocal, toLocalDate, toLocalDateTime, fmtTime, fmtDateLong } from '../shared/recur.js';

let deps = null; // { notify({title, body, kind, payload, important}), send(channel, data), backup() }
let timer = null;
let marketTimer = null;
let lastTick = null;
let focusUntil = 0; // DND while a focus session runs
const recent = []; // fired reminders, so a window that opens later can still show them

export function setFocus(untilMs) { focusUntil = untilMs || 0; }
const dnd = () => Date.now() < focusUntil;

export function start(d) {
  deps = d;
  const saved = db.getSetting('scheduler.lastCheck');
  // catch up at most 3 days back
  const floor = Date.now() - 3 * 86400000;
  lastTick = saved ? Math.max(new Date(saved).getTime(), floor) : Date.now() - 60000;
  tick(true);
  timer = setInterval(() => tick(false), 15000);
  scheduleMarket();
}

export function stop() { clearInterval(timer); clearTimeout(marketTimer); }

export function wake() { tick(true); }

function logKey(kind, key) { return `${kind}:${key}`; }

function collectDue(fromMs, toMs) {
  const due = [];
  const from = new Date(fromMs), to = new Date(toMs);
  // events: expand occurrences whose reminder time falls in (from, to]
  const events = db.list('events').filter((e) => e.reminder_min != null && e.reminder_min >= 0);
  const maxBefore = events.reduce((m, e) => Math.max(m, e.reminder_min), 0);
  const occs = expandAll(events, new Date(fromMs - 86400000), new Date(toMs + (maxBefore + 1440) * 60000));
  for (const o of occs) {
    const rt = reminderTime(o, o.reminder_min);
    if (!rt) continue;
    const at = rt.getTime();
    const inWindow = at > fromMs && at <= toMs;
    // created/edited after its reminder time, but the occurrence has not (long) started: remind now
    const lateEdit = at <= toMs && o.updated_at && new Date(o.updated_at).getTime() >= at && o.occStart.getTime() > toMs - 10 * 60000;
    if (inWindow || lateEdit) due.push({ kind: 'event', key: o.key, at: Math.max(at, Math.min(toMs, new Date(o.updated_at || 0).getTime())), item: o });
  }
  // tasks with a due time
  for (const t of db.list('tasks', { where: { done: { ne: 1 } } })) {
    if (!t.due_date || t.reminder_min == null || t.reminder_min < 0) continue;
    const at = parseLocal(t.due_date + 'T' + (t.due_time || '08:00')).getTime() - t.reminder_min * 60000;
    const due0 = parseLocal(t.due_date + 'T' + (t.due_time || '08:00')).getTime();
    const lateEdit = at <= toMs && t.updated_at && new Date(t.updated_at).getTime() >= at && due0 > toMs - 10 * 60000;
    if ((at > fromMs && at <= toMs) || lateEdit) due.push({ kind: 'task', key: t.id + '|' + t.due_date + (t.due_time || ''), at, item: t });
  }
  // snoozed
  for (const r of db.list('reminder_log', { where: { status: 'snoozed' } })) {
    const at = new Date(r.snooze_until).getTime();
    if (at <= toMs) due.push({ kind: 'snooze', key: r.id, at, item: null });
  }
  return due;
}

function describe(d, late) {
  if (d.kind === 'task') {
    const t = d.item;
    return { title: (late ? 'Terlewat · ' : '') + 'Tugas: ' + t.title, body: `Tenggat ${t.due_date}${t.due_time ? ' ' + t.due_time.replace(':', '.') : ''}${t.tag ? ' · #' + t.tag : ''}`, date: t.due_date };
  }
  const o = d.item;
  const when = o.all_day ? 'Seharian' : fmtTime(o.occStart);
  const mins = Math.round((o.occStart - Date.now()) / 60000);
  let rel = '';
  if (!o.all_day) rel = mins > 1 ? ` · ${mins >= 60 ? Math.round(mins / 60) + ' jam' : mins + ' menit'} lagi` : mins >= -1 ? ' · sekarang' : '';
  return { title: (late ? 'Terlewat · ' : '') + o.title, body: `${fmtDateLong(o.occStart)} · ${when}${rel}${o.location ? ' · ' + o.location : ''}${o.description ? '\n' + o.description.slice(0, 120) : ''}`, date: toLocalDate(o.occStart) };
}

function fire(d, isCatchUp) {
  let entry = d;
  if (d.kind === 'snooze') {
    // re-resolve the original item
    const [kind, ...rest] = d.key.split(':');
    const key = rest.join(':');
    const log = db.get('reminder_log', d.key);
    db.upsert('reminder_log', { id: d.key, status: 'fired', fired_at: new Date().toISOString(), snooze_until: null }, true);
    if (kind === 'event') {
      const [id, occ] = key.split('|');
      const ev = db.get('events', id);
      if (!ev) return;
      const occStart = parseLocal(occ);
      entry = { kind: 'event', key, at: Date.now(), item: { ...ev, occStart, key } };
    } else {
      const t = db.get('tasks', key.split('|')[0]);
      if (!t || t.done) return;
      entry = { kind: 'task', key, at: Date.now(), item: t };
    }
    void log;
  } else {
    const id = logKey(d.kind, d.key);
    if (db.get('reminder_log', id)) return; // already handled
    db.upsert('reminder_log', { id, status: 'fired', fired_at: new Date().toISOString() }, true);
  }
  const late = isCatchUp && Date.now() - entry.at > 120000;
  const msg = describe(entry, late);
  const payload = { logId: logKey(entry.kind, entry.key), type: entry.kind, id: entry.item.id, date: msg.date, title: msg.title, body: msg.body, late };
  deps.notify({ title: msg.title, body: msg.body, kind: 'reminder', payload, important: true });
  recent.push({ ...payload, firedAt: Date.now() });
  if (recent.length > 20) recent.shift();
  deps.send('reminder:fire', payload);
}

export function pending() {
  const cutoff = Date.now() - 6 * 3600000;
  return recent.filter((r) => r.firedAt > cutoff && db.get('reminder_log', r.logId)?.status === 'fired' && !r.shown).map((r) => { r.shown = true; return r; });
}

export function snooze(logId, minutes = 10) {
  db.upsert('reminder_log', { id: logId, status: 'snoozed', snooze_until: new Date(Date.now() + minutes * 60000).toISOString() });
}
export function dismiss(logId) {
  db.upsert('reminder_log', { id: logId, status: 'done', snooze_until: null });
}

function tick(isCatchUp) {
  if (!deps) return;
  const now = Date.now();
  try {
    const due = collectDue(lastTick, now).sort((a, b) => a.at - b.at);
    // avoid a flood after a long sleep: fire the latest 6, summarise the rest
    const extra = due.length > 6 ? due.splice(0, due.length - 6) : [];
    for (const d of extra) {
      if (d.kind !== 'snooze') db.upsert('reminder_log', { id: logKey(d.kind, d.key), status: 'fired', fired_at: new Date().toISOString() }, true);
    }
    if (extra.length) deps.notify({ title: `${extra.length} pengingat lain terlewat`, body: 'Buka kalender untuk melihat detailnya.', kind: 'reminder', important: true, payload: { nav: 'cal' } });
    for (const d of due) fire(d, isCatchUp);
    brief(now);
    maybeBackup(now);
  } catch (e) { console.error('[scheduler]', e); }
  lastTick = now;
  db.setSetting('scheduler.lastCheck', new Date(now).toISOString(), true);
  deps.send('clock:tick', now);
}

// ---------------- morning brief ----------------
export async function buildBrief(now = Date.now()) {
  const d = new Date(now);
  const today = toLocalDate(d);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const occs = expandAll(db.list('events'), start, new Date(start.getTime() + 86400000));
  const tasks = db.list('tasks', { where: { done: { ne: 1 } } });
  const dueToday = tasks.filter((t) => t.due_date && t.due_date <= today);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  let wx = null;
  try { wx = await svc.weather(); } catch { /* offline */ }
  const ym = today.slice(0, 7);
  const budgets = db.finBudgets(d.getFullYear(), d.getMonth() + 1);
  const cap = budgets.reduce((s, b) => s + (b.budget || 0), 0);
  const spent = budgets.filter((b) => b.budget > 0).reduce((s, b) => s + (b.spent || 0), 0);
  const over = budgets.filter((b) => b.budget > 0 && b.spent > b.budget).map((b) => b.name);
  return {
    date: today, events: occs.map((o) => ({ title: o.title, time: o.all_day ? 'Seharian' : fmtTime(o.occStart) })),
    tasksToday: dueToday.length, overdue: overdue.length,
    weather: wx ? { temp: Math.round(wx.current.temp), text: (svc.WMO[wx.current.code] || ['—'])[0], popMax: wx.daily?.[0]?.pop ?? null } : null,
    budget: { cap, spent, left: cap - spent, over, month: ym }
  };
}

async function brief(now) {
  if (!db.getSetting('briefEnabled', true)) return;
  const time = db.getSetting('briefTime', '07:00');
  const d = new Date(now);
  const today = toLocalDate(d);
  if (db.getSetting('brief.lastDate') === today) return;
  if (toLocalDateTime(d).slice(11) < time) return;
  if (toLocalDateTime(d).slice(11) > '12:00') { db.setSetting('brief.lastDate', today, true); return; } // skip if laptop only turned on in the afternoon
  db.setSetting('brief.lastDate', today, true);
  if (dnd()) return;
  const b = await buildBrief(now);
  const parts = [`${b.events.length} agenda`, `${b.tasksToday} tugas${b.overdue ? ` (${b.overdue} terlambat)` : ''}`];
  if (b.weather) parts.push(`${b.weather.temp}° ${b.weather.text}${b.weather.popMax != null ? `, hujan ${b.weather.popMax}%` : ''}`);
  const first = b.events[0] ? `\nPertama: ${b.events[0].time} ${b.events[0].title}` : '';
  deps.notify({ title: 'Ringkasan pagi', body: parts.join(' · ') + first, kind: 'brief', payload: { nav: 'home' } });
}

// ---------------- price alerts ----------------
function scheduleMarket() {
  clearTimeout(marketTimer);
  const sec = Math.max(60, Number(db.getSetting('marketRefreshSec', 120)) || 120);
  marketTimer = setTimeout(async () => { await checkAlerts().catch(() => {}); scheduleMarket(); }, sec * 1000);
}

export async function checkAlerts() {
  const alerts = db.list('price_alerts', { where: { active: 1 } });
  if (!alerts.length) return;
  const syms = [...new Set(alerts.map((a) => a.symbol))];
  const qs = await svc.quotes(syms);
  for (const a of alerts) {
    const q = qs.find((x) => x.symbol === a.symbol);
    if (!q || q.error || q.price == null) continue;
    const hit = a.op === 'above' ? q.price >= a.price : q.price <= a.price;
    if (!hit) continue;
    db.upsert('price_alerts', { id: a.id, active: 0, triggered_at: new Date().toISOString() });
    if (dnd()) continue;
    deps.notify({ title: `Alert harga: ${a.symbol}`, body: `${q.name} ${a.op === 'above' ? 'naik ke' : 'turun ke'} ${q.price.toLocaleString('id-ID', { maximumFractionDigits: 2 })} (batas ${a.price.toLocaleString('id-ID')})`, kind: 'market', payload: { nav: 'market', symbol: a.symbol } });
  }
}

// ---------------- auto backup (once a day) ----------------
function maybeBackup(now) {
  const today = toLocalDate(new Date(now));
  if (db.getSetting('backup.lastDate') === today) return;
  try { deps.backup(); db.setSetting('backup.lastDate', today, true); } catch (e) { console.error('[backup]', e); }
}
