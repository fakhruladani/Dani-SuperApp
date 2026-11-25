// Google Sheets import: parsing what a chat assistant writes, and the import rules
// (no duplicates, app edits win, deletions stick, sheet corrections flow in).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseAmount, parseDate, parseSheet, decide } from '../shared/gsheet.js';
import * as db from '../electron/db.js';
import * as gs from '../electron/gsheet.js';

const require = createRequire(import.meta.url);

test('amounts and dates the way people and assistants write them', () => {
  const cases = { '10000': 10000, '10rb': 10000, '10 rb': 10000, '10k': 10000, 'Rp10.000': 10000, 'Rp 10.000': 10000, '10,000': 10000, '1,5jt': 1500000, '1.5 juta': 1500000, '8jt': 8000000, '-25000': 25000, '10000,50': 10001 };
  for (const [s, v] of Object.entries(cases)) assert.equal(parseAmount(s), v, s);
  assert.equal(parseAmount(25000), 25000);
  assert.ok(Number.isNaN(parseAmount('sepuluh ribu')));
  assert.equal(parseDate('2026-11-25 20:57:47'), '2026-11-25');
  assert.equal(parseDate('25/11/2026 20:57'), '2026-11-25');
  assert.equal(parseDate('2026-1-5'), '2026-01-05');
  assert.equal(parseDate('kemarin'), null);
});

// exactly what the assistant wrote in the trial (one message -> 4 rows with the same time)
const MUSE = { sheet: 'Sheet1', header: ['Waktu', 'Keterangan', 'Nominal', 'Jenis', 'Kategori', 'ID'], rows: [
  ['2026-11-25 20:57:47', 'Jajan', 10000, 'keluar', 'Makanan', 'Ra1'],
  ['2026-11-25 20:57:47', 'Makan siang', 25000, 'keluar', 'Makanan', 'Ra2'],
  ['2026-11-25 20:57:47', 'Parkir', 2000, 'keluar', 'Transport', 'Ra3'],
  ['2026-11-25 20:57:47', 'Gaji', 8000000, 'masuk', 'Gaji', 'Ra4'],
  ['', '', '', '', '', ''],
  ['2026-11-26 07:10:00', 'Kopi', 'dua puluh', 'keluar', '', 'Ra5']
] };
const cats = [['in', 'Gaji'], ['out', 'Makanan'], ['out', 'Transport'], ['out', 'Lainnya (keluar)']].map(([kind, name], i) => ({ id: 'c' + i, kind, name, archived: 0 }));

test('the assistant trial rows map to transactions, a bad row is reported', () => {
  const p = parseSheet(MUSE, { cats });
  assert.deepEqual(p.items.map((x) => [x.id, x.date, x.description, x.amount, x.kind, x.category_id]), [
    ['gs-Ra1', '2026-11-25', 'Jajan', 10000, 'out', 'c1'], ['gs-Ra2', '2026-11-25', 'Makan siang', 25000, 'out', 'c1'],
    ['gs-Ra3', '2026-11-25', 'Parkir', 2000, 'out', 'c2'], ['gs-Ra4', '2026-11-25', 'Gaji', 8000000, 'in', 'c0']]);
  assert.deepEqual(p.skipped, [{ row: 7, reason: 'AMOUNT' }]);
  assert.equal(parseSheet(MUSE, { cats, since: '2026-11-26' }).items.length, 0, 'rows before the start date are left out');
  // without an ID column: time + position among rows with that time
  const noId = { header: ['Waktu', 'Keterangan', 'Nominal'], rows: MUSE.rows.slice(0, 2).map((r) => r.slice(0, 3)) };
  assert.deepEqual(parseSheet(noId, { cats }).items.map((x) => x.id), ['gs-2026-11-25_20_57_47_1', 'gs-2026-11-25_20_57_47_2']);
  assert.equal(parseSheet({ header: ['Tanggal', 'Harga'], rows: [] }, {}).error, 'COLUMNS');
});

test('import decision', () => {
  const [it] = parseSheet(MUSE, { cats }).items;
  assert.equal(decide(it, null, false), 'add');
  assert.equal(decide(it, null, true), 'keep', 'deleted in the app: not brought back');
  const local = { ...it, src: 'gs:' + it.hash };
  assert.equal(decide(it, local, false), 'keep', 'unchanged');
  const corrected = parseSheet({ ...MUSE, rows: [['2026-11-25 20:57:47', 'Jajan', 15000, 'keluar', 'Makanan', 'Ra1']] }, { cats }).items[0];
  assert.equal(decide(corrected, local, false), 'update', 'sheet correction flows in');
  assert.equal(decide(corrected, { ...local, amount: 12000 }, false), 'keep', 'edited in the app: app wins');
  assert.equal(decide(it, { ...it, src: null }, false), 'keep', 'a row of the app that happens to share the id');
});

test('importNow end to end: fetch, add, no duplicates, app edits and deletions win', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-gs-'));
  let K = null;
  await db.openDb({ dir, keyStore: { load: () => K, save: (k) => { K = k; } }, wasmPath: require.resolve('sql.js/dist/sql-wasm.wasm') });
  let sheet = structuredClone(MUSE);
  const calls = [];
  globalThis.__dsaFetch = async (url) => {
    calls.push(url);
    const key = new URL(url).searchParams.get('key');
    const body = key === 'rahasia' ? JSON.stringify(sheet) : key === 'html' ? '<html>Sign in</html>' : JSON.stringify({ error: 'forbidden' });
    return { ok: true, status: 200, text: async () => body };
  };
  const URL_OK = 'https://script.google.com/macros/s/abc/exec';
  await assert.rejects(gs.test('https://evil.example/x', 'rahasia'), /URL/);
  await assert.rejects(gs.test(URL_OK, 'salah'), /KEY/);
  await assert.rejects(gs.test(URL_OK, 'html'), /NOT_JSON/);
  const t = await gs.test(URL_OK, 'rahasia', '2026-11-01');
  assert.equal(t.counts.add, 4);
  assert.equal(db.list('fin_tx').length, 0, 'test does not save');

  db.setSetting('gsheet', { url: URL_OK, key: 'rahasia', since: '2026-11-01', auto: true });
  let r = await gs.importNow({ quiet: true });
  assert.deepEqual([r.added, r.updated, r.skipped, r.error], [4, 0, 1, null]);
  const makan = db.list('fin_categories').find((c) => c.name === 'Makan'); // seeded name: "Makanan" from the sheet is guessed to it
  assert.equal(db.get('fin_tx', 'gs-Ra1').category_id, makan.id);
  r = await gs.importNow({ quiet: true });
  assert.deepEqual([r.added, r.updated], [0, 0], 'second run adds nothing');

  db.upsert('fin_tx', { id: 'gs-Ra2', amount: 30000 }); // edited in the app
  db.remove('fin_tx', 'gs-Ra3'); // deleted in the app
  sheet.rows[0][2] = 12000; // corrected in the sheet
  sheet.rows[1][2] = 26000; // corrected in the sheet, but edited in the app too
  sheet.rows.push(['2026-11-26 12:00:00', 'Bensin', '50rb', '', '', 'Ra6']);
  r = await gs.importNow({ quiet: true });
  assert.deepEqual([r.added, r.updated], [1, 1]);
  assert.equal(db.get('fin_tx', 'gs-Ra1').amount, 12000);
  assert.equal(db.get('fin_tx', 'gs-Ra2').amount, 30000, 'app edit kept');
  assert.equal(db.get('fin_tx', 'gs-Ra3'), null, 'deletion kept');
  assert.equal(db.get('fin_tx', 'gs-Ra6').category_id, db.list('fin_categories').find((c) => c.name === 'Transport').id, 'category guessed from "Bensin"');
  assert.ok(calls.every((u) => u.startsWith(URL_OK + '?key=')));
  db.closeDb();
  delete globalThis.__dsaFetch;
});
