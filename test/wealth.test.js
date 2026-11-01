import test from 'node:test';
import assert from 'node:assert/strict';
import { wealthSummary } from '../shared/wealth.js';

const rows = [
  { id: 1, date: '2026-09-30', category: 'Cash', name: 'BCA', value: 10000000 },
  { id: 2, date: '2026-10-24', category: 'cash', name: 'bca ', value: 12500000 },
  { id: 3, date: '2026-09-30', category: 'Saham', name: 'BBCA', value: 26000000 },
  { id: 4, date: '2026-10-23', category: 'Saham', name: 'BBCA', value: 25125000 },
  { id: 5, date: '2026-10-10', category: 'Utang', name: 'Paylater', value: -1200000 }
];

test('only newest value per asset counts, debts reduce net', () => {
  const s = wealthSummary(rows, new Date(2026, 9, 25));
  assert.deepEqual([...s.currentIds].sort(), [2, 4, 5]);
  assert.equal(s.assets, 37625000);
  assert.equal(s.debts, -1200000);
  assert.equal(s.net, 36425000);
  assert.deepEqual(s.categories.map((c) => [c.name, c.total]), [['Saham', 25125000], ['cash', 12500000], ['Utang', -1200000]]);
});

test('trend and previous month-end use values known at that date', () => {
  const s = wealthSummary(rows, new Date(2026, 9, 25));
  assert.deepEqual(s.trend.map((t) => [t.label, t.net]), [['Sep', 36000000], ['Okt', 36425000]]);
  assert.deepEqual(s.prev, { date: '2026-09-30', net: 36000000 });
});

test('empty sheet', () => {
  const s = wealthSummary([], new Date(2026, 9, 25));
  assert.equal(s.net, 0);
  assert.equal(s.trend.length, 0);
  assert.equal(s.prev, null);
});

import { wealthMatrix, parseWealthTable, parseMoney } from '../shared/wealth.js';

test('matrix: one row per date, empty cells carry the previous value, totals and deltas', () => {
  const r = [
    { id: 'a', date: '2026-01-03', category: '', name: 'Jago', value: 1000 },
    { id: 'b', date: '2026-01-03', category: '', name: 'BNI', value: 500 },
    { id: 'c', date: '2026-02-17', category: '', name: 'Jago', value: 1500 },
    { id: 'd', date: '2026-03-16', category: '', name: 'BNI', value: 0 },
    { id: 'e', date: '2026-03-16', category: 'Utang', name: 'Paylater', value: -200 }
  ];
  const m = wealthMatrix(r, [{ name: 'BNI', category: '' }]);
  assert.deepEqual(m.columns.map((c) => c.name), ['BNI', 'Jago', 'Paylater']);
  assert.deepEqual(m.snaps.map((s) => [s.date, s.total, s.delta]), [['2026-01-03', 1500, null], ['2026-02-17', 2000, 500], ['2026-03-16', 1300, -700]]);
  const feb = m.snaps[1].cells;
  assert.equal(feb['|bni'].carried, true);
  assert.equal(feb['|bni'].value, 500);
  assert.equal(feb['|jago'].row.id, 'c');
  assert.equal(m.snaps[0].cells['utang|paylater'].value, null);
  assert.equal(m.snaps[2].debts, -200);
});

test('money parsing in several formats', () => {
  assert.equal(parseMoney('Rp1.430.807'), 1430807);
  assert.equal(parseMoney('Rp0'), 0);
  assert.equal(parseMoney('-Rp 2.500'), -2500);
  assert.equal(parseMoney('(1.200.000)'), -1200000);
  assert.equal(parseMoney('1,430,807.50'), 1430807);
  assert.equal(parseMoney('1.430.807,50'), 1430807);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('abc'), null);
});

test('import a sheet pasted from Google Sheets (M/D dates, Rp values, Total column skipped)', () => {
  const tsv = [
    'Tanggal\tBank Jago/Gopay\tBank BNI\tDana\tTotal',
    '1/3/2026\tRp1.430.807\tRp1.050.789\tRp2.513\tRp2.484.109',
    '2/17/2026\tRp1.562.319\tRp235.090\tRp0\tRp1.797.409',
    '\t\t\t\t'
  ].join('\n');
  const p = parseWealthTable(tsv);
  assert.equal(p.order, 'mdy');
  assert.deepEqual(p.columns, ['Bank Jago/Gopay', 'Bank BNI', 'Dana']);
  assert.deepEqual(p.rows[0], { date: '2026-01-03', values: { 'Bank Jago/Gopay': 1430807, 'Bank BNI': 1050789, Dana: 2513 } });
  assert.equal(p.rows[1].date, '2026-02-17');
  assert.equal(p.rows[1].values.Dana, 0);
  // same text read as D/M on request; 2/17 is then invalid and skipped
  const q = parseWealthTable(tsv, 'dmy');
  assert.equal(q.rows[0].date, '2026-03-01');
  assert.equal(q.skipped, 1);
  // CSV with quotes and ISO dates
  const c = parseWealthTable('Tanggal,Cash,"Saham, BEI"\n2026-05-14,"236.000","5.920.737"\n');
  assert.deepEqual(c.rows, [{ date: '2026-05-14', values: { Cash: 236000, 'Saham, BEI': 5920737 } }]);
});
