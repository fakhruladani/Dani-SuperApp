import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as db from '../electron/db.js';
import * as io from '../electron/io.js';

const require = createRequire(import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-io-'));
let K = null;

test('excel/csv/ics export + import round trip', async () => {
  await db.openDb({ dir, keyStore: { load: () => K, save: (k) => { K = k; } }, wasmPath: require.resolve('sql.js/dist/sql-wasm.wasm') });
  const cats = db.list('fin_categories');
  const makan = cats.find((c) => c.name === 'Makan');
  db.upsert('fin_tx', { date: '2026-03-04', description: 'Nasi, "padang"', category_id: makan.id, kind: 'out', amount: 35000 });
  const x = path.join(dir, 'k.xlsx');
  await io.exportFinanceXlsx(2026, x);
  assert.ok(fs.statSync(x).size > 5000);
  const c = path.join(dir, 't.csv');
  assert.equal(io.exportFinanceCsv(2026, c), 1);
  db.removeWhere('fin_tx', {});
  assert.equal(io.importFinanceCsv(c), 1);
  const back = db.list('fin_tx')[0];
  assert.equal(back.description, 'Nasi, "padang"');
  assert.equal(back.amount, 35000);
  assert.equal(back.category_id, makan.id);
  const cal = db.list('calendars')[0];
  db.upsert('events', { title: 'Gym, upper', start: '2026-10-26T17:00', end: '2026-10-26T18:00', all_day: 0, calendar_id: cal.id, repeat: 'weekly', reminder_min: 15 });
  db.upsert('events', { title: 'Libur', start: '2026-12-24', end: '2026-12-25', all_day: 1, calendar_id: cal.id, repeat: 'none', reminder_min: -1 });
  const ics = path.join(dir, 'c.ics');
  io.exportIcs(ics);
  db.removeWhere('events', {});
  assert.equal(io.importIcs(ics, cal.id), 2);
  const evs = db.list('events', { order: 'start' });
  assert.deepEqual(evs.map((e) => [e.title, e.start, e.end, e.repeat, e.reminder_min, e.all_day]), [
    ['Gym, upper', '2026-10-26T17:00', '2026-10-26T18:00', 'weekly', 15, 0],
    ['Libur', '2026-12-24', '2026-12-25', 'none', -1, 1]
  ]);
  db.closeDb();
});
