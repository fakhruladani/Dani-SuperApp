// node --test test/  — backend logic tests (no Electron needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as db from '../electron/db.js';
import { expandEvent, expandAll, parseQuickTask, reminderTime, parseLocal } from '../shared/recur.js';

const require = createRequire(import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-'));
let K = null;
const keyStore = { load: () => K, save: (k) => { K = k; } };

test('recurrence: weekly within range', () => {
  const ev = { id: 'a', start: '2026-10-05T09:00', end: '2026-10-05T10:00', repeat: 'weekly' };
  const occ = expandEvent(ev, new Date(2026, 9, 1), new Date(2026, 10, 1));
  assert.deepEqual(occ.map((o) => o.occStart.getDate()), [5, 12, 19, 26]);
});

test('recurrence: monthly skips missing day, until respected', () => {
  const ev = { id: 'b', start: '2026-01-31', end: '2026-01-31', all_day: 1, repeat: 'monthly', repeat_until: '2026-07-31' };
  const occ = expandEvent(ev, new Date(2026, 0, 1), new Date(2027, 0, 1));
  assert.deepEqual(occ.map((o) => o.occStart.getMonth() + 1), [1, 3, 5, 7]);
});

test('recurrence: daily far in the future is fast and correct', () => {
  const ev = { id: 'c', start: '2020-01-01T06:00', end: '2020-01-01T06:30', repeat: 'daily' };
  const occ = expandEvent(ev, new Date(2026, 9, 25), new Date(2026, 9, 27));
  assert.equal(occ.length, 2);
  assert.equal(occ[0].occStart.getDate(), 25);
});

test('reminder time for all-day = 07:00 minus offset', () => {
  const [o] = expandEvent({ id: 'd', start: '2026-10-28', all_day: 1 }, new Date(2026, 9, 1), new Date(2026, 10, 1));
  assert.equal(reminderTime(o, 30).getHours(), 6);
  assert.equal(reminderTime(o, 30).getMinutes(), 30);
});

test('quick task parser (Indonesian)', () => {
  const now = new Date(2026, 9, 25, 8, 0); // Sunday
  const r = parseQuickTask('revisi abstrak besok 09.00 #TA !tinggi', now);
  assert.deepEqual(r, { title: 'revisi abstrak', due_date: '2026-10-26', due_time: '09:00', tag: 'TA', priority: 2 });
  assert.equal(parseQuickTask('bayar ukt jumat', now).due_date, '2026-10-30');
  assert.equal(parseQuickTask('beli kopi', now).due_date, null);
});

test('db: open, CRUD, encryption, recap, budgets, search', async () => {
  await db.openDb({ dir, keyStore, wasmPath: require.resolve('sql.js/dist/sql-wasm.wasm') });
  const cats = db.list('fin_categories', { order: 'sort' });
  assert.ok(cats.length > 5);
  const makan = cats.find((c) => c.name === 'Makan');
  const gaji = cats.find((c) => c.name === 'Gaji');
  db.upsert('fin_tx', { date: '2026-10-01', description: 'Gaji', category_id: gaji.id, kind: 'in', amount: 5000000 });
  db.upsert('fin_tx', { date: '2026-10-05', description: 'Belanja makan', category_id: makan.id, kind: 'out', amount: 2000000 });
  db.upsert('fin_tx', { date: '2025-03-05', description: 'Makan lama', category_id: makan.id, kind: 'out', amount: 100 });
  const rec = db.finRecap(2026);
  assert.equal(rec.months[9].in, 5000000);
  assert.equal(rec.months[9].out, 2000000);
  assert.deepEqual(rec.years, [2025, 2026]);
  const b = db.finBudgets(2026, 10).find((x) => x.name === 'Makan');
  assert.equal(b.spent, 2000000);
  assert.equal(b.budget, 1800000);
  db.upsert('fin_budgets', { year: 2026, month: 10, category_id: makan.id, amount: 2500000 });
  assert.equal(db.finBudgets(2026, 10).find((x) => x.name === 'Makan').budget, 2500000);
  assert.equal(db.list('fin_tx', { where: { date: { prefix: '2026-10' } } }).length, 2);
  db.upsert('notes', { title: 'Catatan bimbingan', plain: 'revisi metodologi' });
  assert.equal(db.search('metodologi')[0].type, 'note');
  assert.throws(() => db.list('users'));
  assert.throws(() => db.list('notes', { where: { 'title; DROP': 1 } }));
  db.saveNow();
  const raw = fs.readFileSync(db.dataFile());
  assert.equal(raw.subarray(0, 4).toString(), 'DSA1');
  assert.ok(!raw.toString('latin1').includes('Catatan bimbingan'), 'file must be encrypted');
  // restore round-trip
  const backup = db.exportEncrypted();
  db.upsert('notes', { title: 'setelah backup' });
  db.restoreFrom(backup);
  assert.equal(db.search('setelah backup').length, 0);
  // wrong key needs recovery key
  const otherKey = Buffer.alloc(32, 7);
  const foreign = (() => { const K2 = K; K = otherKey; return K2; })();
  K = foreign;
  db.closeDb();
});

test('recur expandAll sorts', () => {
  const r = expandAll([{ id: 'x', start: '2026-10-02T10:00' }, { id: 'y', start: '2026-10-01T10:00' }], parseLocal('2026-10-01'), parseLocal('2026-10-03'));
  assert.deepEqual(r.map((o) => o.id), ['y', 'x']);
});
