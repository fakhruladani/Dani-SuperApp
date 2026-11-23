// Reminders on Android. The app is not running in the background, so instead of checking every
// 15 s (desktop), the next 14 days of event/task reminders and morning briefs are handed to Android
// as scheduled notifications, and re-planned whenever events, tasks or settings change.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import * as db from './db.js';
import * as sched from '../../electron/scheduler.js';
import { expandAll, toLocalDate, fmtTime } from '../../shared/recur.js';
import { t as T } from '../../shared/i18n.js';

const DAYS = 14;
const MAX = 120; // Android allows ~500 alarms per app
const CHANNEL = 'reminders';
let timer = null;
let onTap = () => {};

// stable 31-bit id per reminder, so re-planning replaces instead of duplicating
const nid = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 1) || 1; };

export async function init({ tap }) {
  onTap = tap || onTap;
  if (!Capacitor.isNativePlatform()) return;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({ id: CHANNEL, name: T('Pengingat'), description: T('Acara, tugas, dan ringkasan pagi'), importance: 5, visibility: 1, vibration: true });
    LocalNotifications.addListener('localNotificationActionPerformed', (a) => onTap(a.notification?.extra || {}));
  } catch (e) { console.error('[reminders]', e); }
  plan();
}

/** Re-plan soon (debounced): call after any change that can move a reminder. */
export function replan() { clearTimeout(timer); timer = setTimeout(plan, 2500); }

function briefs(now) {
  if (!db.getSetting('briefEnabled', true)) return [];
  const [hh, mm] = String(db.getSetting('briefTime', '07:00')).split(':').map(Number);
  const out = [];
  const events = db.list('events');
  const tasks = db.list('tasks', { where: { done: { ne: 1 } } });
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh || 0, mm || 0);
    if (day.getTime() <= now.getTime()) continue;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const occ = expandAll(events, start, new Date(start.getTime() + 86400000));
    const ds = toLocalDate(day);
    const due = tasks.filter((t) => t.due_date && t.due_date <= ds).length;
    const first = occ[0] ? `\n${T('Pertama:')} ${occ[0].all_day ? T('Seharian') : fmtTime(occ[0].occStart)} ${occ[0].title}` : '';
    out.push({ logId: 'brief:' + ds, at: day.getTime(), title: T('Ringkasan pagi'), body: `${T('{n} agenda', { n: occ.length })} · ${T('{n} tugas', { n: due })}${first}`, type: 'brief', date: ds });
  }
  return out;
}

async function plan() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const now = new Date();
    const list = [...sched.upcoming(now.getTime(), now.getTime() + DAYS * 86400000), ...briefs(now)].sort((a, b) => a.at - b.at).slice(0, MAX);
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!list.length) return;
    await LocalNotifications.schedule({
      notifications: list.map((r) => ({
        id: nid(r.logId), title: r.title, body: r.body, largeBody: r.body, channelId: CHANNEL, smallIcon: 'ic_stat_dsa',
        schedule: { at: new Date(r.at), allowWhileIdle: true },
        extra: { logId: r.logId, type: r.type, id: r.id, date: r.date }
      }))
    });
  } catch (e) { console.error('[reminders] plan failed', e); }
}

/** Settings → Tes notifikasi */
export async function test() {
  if (!Capacitor.isNativePlatform()) throw new Error('Notifikasi hanya di aplikasi Android');
  const p = await LocalNotifications.requestPermissions();
  if (p.display !== 'granted') throw new Error(T('Notifikasi belum diizinkan untuk aplikasi ini'));
  await LocalNotifications.schedule({ notifications: [{ id: 1, title: T('Tes notifikasi'), body: T("Notifikasi D'Super App berfungsi."), channelId: CHANNEL, smallIcon: 'ic_stat_dsa', schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true } }] });
  return true;
}
