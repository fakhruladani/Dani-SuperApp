import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory } from '../shared/categorize.js';

// the user's real category list (Makan renamed to Makanan and moved to the end)
const names = [['in', 'Gaji'], ['in', 'Sampingan'], ['in', 'Lainnya (masuk)'], ['out', 'Transport'], ['out', 'Tempat tinggal'], ['out', 'Tagihan'], ['out', 'Belanja'],
  ['out', 'Olahraga'], ['out', 'Hiburan'], ['out', 'Kesehatan'], ['out', 'Pendidikan'], ['out', 'Tabungan/Investasi'], ['out', 'Lainnya (keluar)'], ['out', 'Makanan']];
const cats = names.map(([kind, name], i) => ({ id: 'c' + i, kind, name, archived: 0 }));
const name = (r) => cats.find((c) => c.id === r.id).name;
const g = (d, kind = 'out', h) => name(guessCategory(d, kind, cats, h));

test('keywords pick the right category (the reported bug: sarapan/belanja went to Transport)', () => {
  assert.equal(g('sarapan'), 'Makanan');
  assert.equal(g('Sarapan bubur ayam'), 'Makanan');
  assert.equal(g('belanja'), 'Belanja');
  assert.equal(g('belanja bulanan di Superindo'), 'Belanja');
  assert.equal(g('makan siang kantor'), 'Makanan');
  assert.equal(g('Kopi Kenangan'), 'Makanan');
  assert.equal(g('bensin motor'), 'Transport');
  assert.equal(g('Gojek ke kampus'), 'Transport');
  assert.equal(g('token listrik'), 'Tagihan');
  assert.equal(g('bayar kos november'), 'Tempat tinggal');
  assert.equal(g('nonton bioskop'), 'Hiburan');
  assert.equal(g('obat flu apotek'), 'Kesehatan');
  assert.equal(g('UKT semester'), 'Pendidikan');
  assert.equal(g('nabung reksa dana'), 'Tabungan/Investasi');
  assert.equal(g('sepatu lari'), 'Olahraga'); // longer phrase beats "sepatu" (Belanja)
  assert.equal(g('belanjaan'), 'Belanja'); // prefix for long words
});

test('income keywords and fallbacks', () => {
  assert.equal(g('gaji oktober', 'in'), 'Gaji');
  assert.equal(g('proyek freelance web', 'in'), 'Sampingan');
  assert.equal(g('kiriman', 'in'), 'Lainnya (masuk)');
  assert.equal(g('xyz entah apa'), 'Lainnya (keluar)'); // unknown -> Lainnya, not the first category
  assert.equal(g(''), 'Lainnya (keluar)');
  assert.equal(g('tol'), 'Transport');
  assert.equal(g('total belanja'), 'Belanja'); // short word "tol" does not match inside "total"
});

test('history wins over keywords, only for the same kind', () => {
  const h = [{ kind: 'out', description: 'Belanja bulanan', category_id: 'c13', date: '2026-10-01' }];
  assert.equal(g('belanja bulanan', 'out', h), 'Makanan');
  assert.equal(g('belanja bulanan', 'in', h), 'Lainnya (masuk)');
  assert.equal(guessCategory('x', 'in', cats.filter((c) => c.kind === 'out')), null);
});
