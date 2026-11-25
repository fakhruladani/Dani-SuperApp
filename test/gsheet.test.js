// Google Sheets import: parsing what a chat assistant writes, and the import rules
// (no duplicates, app edits win, deletions stick, sheet corrections flow in).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseAmount, parseDate, parseSheet, decide, planImport, parseConnCode, makeConnCode } from '../shared/gsheet.js';
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
  // close category names: the sheet says "Makanan" / "Transportasi", the app has "Makan" / "Transport"
  const short = [{ id: 'm', kind: 'out', name: 'Makan', archived: 0 }, { id: 't', kind: 'out', name: 'Transport', archived: 0 }, { id: 'l', kind: 'out', name: 'Lainnya', archived: 0 }];
  const close = parseSheet({ header: ['Waktu', 'Keterangan', 'Nominal', 'Kategori'], rows: [['2026-11-25', 'Telur', 50000, 'Makanan'], ['2026-11-25', 'Ojek', 12000, 'Transportasi'], ['2026-11-25', 'Pulsa', 20000, 'Tagihan']] }, { cats: short });
  assert.deepEqual(close.items.map((x) => x.category_id), ['m', 't', 'l']);
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

test('connection code: made by the Apps Script menu, read by the app', () => {
  const url = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec', key = 'a'.repeat(64);
  // Utilities.base64EncodeWebSafe keeps "=" padding (the script strips it, but be lenient)
  const fromScript = 'dsa-gs:' + Buffer.from(JSON.stringify({ u: url, k: key })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  assert.deepEqual(parseConnCode(fromScript), { url, key });
  assert.deepEqual(parseConnCode('  ' + makeConnCode(url, key) + '\n'), { url, key }, 'pasted with spaces / newline');
  assert.equal(parseConnCode('dsa-sync:abc'), null);
  assert.equal(parseConnCode('dsa-gs:bm90IGpzb24'), null, 'not JSON');
  assert.equal(parseConnCode('dsa-gs:' + Buffer.from('{"u":"x"}').toString('base64url')), null, 'no key');
});

test('history typed in the app and copied to the sheet is linked, not doubled', () => {
  const app = [
    { id: 't1', date: '2026-11-25', description: 'Jajan ', amount: 5000, kind: 'out', src: null },
    { id: 't2', date: '2026-11-25', description: 'Telur', amount: 50000, kind: 'out', src: null },
    { id: 't3', date: '2026-11-02', description: 'Jajan', amount: 4500, kind: 'out', src: null },
    { id: 't4', date: '2026-11-02', description: 'Jajan', amount: 4500, kind: 'out', src: null }
  ];
  const sheet = { header: ['Waktu', 'Keterangan', 'Nominal', 'Jenis', 'Kategori', 'ID'], rows: [
    ['2026-11-02 00:00:00', 'Jajan', 4500, 'keluar', 'Makanan', 'R1'],
    ['2026-11-02 00:00:00', 'Jajan', 4500, 'keluar', 'Makanan', 'R2'],
    ['2026-11-02 00:00:00', 'jajan', 4500, 'keluar', 'Makanan', 'R3'], // a third one the app does not have
    ['2026-11-25 00:00:00', 'Telur', 50000, 'keluar', 'Makanan', 'R4'],
    ['2026-11-25 00:00:00', 'Jajan', 5000, 'keluar', 'Makanan', 'R5'],
    ['2026-11-25 22:01:23', 'Makan malam', '15000', 'keluar', 'Makanan', 'R6'], // written by the assistant
    ['2026-11-27 08:00:00', 'Telur', 50000, 'keluar', 'Makanan', 'R7'] // after connecting: a new purchase
  ] };
  const { items } = parseSheet(sheet, { cats });
  const opts = { local: () => null, deleted: () => false, existing: app, linkUntil: '2026-11-26' };
  const act = (o) => planImport(items, o).map((x) => `${x.item.id}:${x.action}${x.linkTo ? '>' + x.linkTo : ''}`);
  assert.deepEqual(act(opts), ['gs-R1:link>t3', 'gs-R2:link>t4', 'gs-R3:add', 'gs-R4:link>t2', 'gs-R5:link>t1', 'gs-R6:add', 'gs-R7:add']);
  assert.deepEqual(act({ ...opts, linkUntil: '' }).filter((x) => x.includes('link')), [], 'no linking without a connect date');
  assert.deepEqual(act({ ...opts, linked: { 'gs-R4': 't2' } })[3], 'gs-R4:keep', 'linked before: stays linked');
  assert.deepEqual(act({ ...opts, linked: { 'gs-R1': 't3' } }).slice(0, 3), ['gs-R1:keep', 'gs-R2:link>t4', 'gs-R3:add'], 'a linked app row is not used twice');
  const fromSheet = app.map((t) => ({ ...t, src: 'gs:x' }));
  assert.ok(act({ ...opts, existing: fromSheet }).every((x) => !x.includes('link')), 'rows imported from the sheet are not link targets');
});

test('importNow links existing history once; deleting a linked transaction does not bring the row back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-gs2-'));
  let K = null;
  await db.openDb({ dir, keyStore: { load: () => K, save: (k) => { K = k; } }, wasmPath: require.resolve('sql.js/dist/sql-wasm.wasm') });
  const sheet = { header: ['Waktu', 'Keterangan', 'Nominal', 'Jenis', 'Kategori', 'ID'], rows: [
    ['2026-11-25 00:00:00', 'Telur', 50000, 'keluar', 'Makanan', 'R4'],
    ['2026-11-25 22:01:23', 'Makan malam', '15000', 'keluar', 'Makanan', 'R6']
  ] };
  globalThis.__dsaFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(sheet) });
  db.upsert('fin_tx', { id: 'mine', date: '2026-11-25', description: 'Telur', amount: 50000, kind: 'out' });
  db.setSetting('gsheet', { url: 'https://script.google.com/macros/s/abc/exec', key: 'k', since: '2026-11-01', auto: true, linkUntil: '2026-11-26' });
  const t = await gs.test('https://script.google.com/macros/s/abc/exec', 'k', '2026-11-01');
  assert.deepEqual(t.counts, { add: 1, update: 0, link: 1 });
  let r = await gs.importNow({ quiet: true });
  assert.deepEqual([r.added, r.linked], [1, 1]);
  assert.equal(db.list('fin_tx').length, 2, 'Telur once, Makan malam added');
  assert.deepEqual(db.getSetting('gsheetLinked'), { 'gs-R4': 'mine' });
  db.remove('fin_tx', 'mine');
  r = await gs.importNow({ quiet: true });
  assert.deepEqual([r.added, r.linked], [0, 0]);
  assert.equal(db.get('fin_tx', 'gs-R4'), null, 'deleted in the app: stays deleted');
  db.closeDb();
  delete globalThis.__dsaFetch;
});
