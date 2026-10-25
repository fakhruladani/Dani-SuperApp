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
