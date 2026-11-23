// Phone <-> laptop sync: two independent database instances in one process, the HTTP layer
// replaced by a JSON round trip (so only what survives JSON travels, like on the wire).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, createClient, pairingPayload, randomKey, seal, open } from '../shared/sync.js';

const require = createRequire(import.meta.url);
const SQL = await require('sql.js')();
const A = await import('../shared/dbcore.js?laptop');
const B = await import('../shared/dbcore.js?phone');
A.init(SQL, null);
B.init(SQL, null);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (x) => JSON.parse(JSON.stringify(x));

let pairKey = randomKey();
const server = createServer({ core: A, deviceName: () => 'Laptop', pairing: () => pairKey });
let calls = 0;
const post = async (addr, op, env) => { calls++; if (addr !== '192.168.1.5:47613') throw new Error('unreachable'); return json(await server(op, json(env))); };
const client = createClient({ core: B, post, deviceName: () => 'HP' });

test('first sync: a new phone takes the laptop data (no duplicate defaults), device settings stay', async () => {
  const note = A.upsert('notes', { title: 'Rencana', content: '{}', plain: 'isi', sticky: 1, sticky_bounds: '{"x":1}' });
  A.upsert('tasks', { title: 'Bayar listrik', done: 0, tag: 'rumah' });
  A.upsert('calendars', { name: 'Kalender saya', color: 'c5', visible: 1, sort: 9 });
  A.setSetting('wealthCols', [{ name: 'BCA' }]);
  A.setSetting('theme', 'dark');
  const img = A.imagePut(note.id, 'image/png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  A.upsert('notes', { id: note.id, content: JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: 'dsa-img://img/' + img } }] }) });

  const qr = pairingPayload({ device: A.deviceId(), name: 'Laptop', addrs: ['10.0.0.9', '192.168.1.5'], key: pairKey });
  const peer = await client.pair(qr);
  pairKey = null; // pairing window closed
  assert.equal(peer.name, 'Laptop');
  assert.ok(peer.addr.startsWith('192.168.1.5:47613'), 'working address first');
  assert.ok(A.peer(B.deviceId()), 'laptop knows the phone');

  const r = await client.sync(A.deviceId());
  assert.equal(r.first, true);
  assert.equal(B.list('notes').length, 1);
  assert.equal(B.list('notes')[0].sticky, null, 'window state of the laptop is not synced');
  assert.equal(B.list('tasks')[0].title, 'Bayar listrik');
  assert.equal(B.list('calendars').length, A.list('calendars').length, 'no duplicate seeded calendars');
  assert.equal(B.list('fin_categories').length, A.list('fin_categories').length);
  assert.deepEqual(B.getSetting('wealthCols'), [{ name: 'BCA' }]);
  assert.equal(B.getSetting('theme'), 'system', 'theme is per device');
  assert.deepEqual([...B.imageGet(img).data], [137, 80, 78, 71, 1, 2, 3]);
});

test('edits and deletions travel both ways; an idle second sync moves nothing', async () => {
  const task = B.list('tasks')[0];
  B.upsert('tasks', { id: task.id, done: 1 });
  const note = A.list('notes')[0];
  A.remove('notes', note.id);
  const cat = A.list('fin_categories')[0];
  A.upsert('fin_tx', { date: '2026-11-20', description: 'Kopi', kind: 'out', amount: 18000, category_id: cat.id });
  const r = await client.sync(A.deviceId());
  assert.equal(A.get('tasks', task.id).done, 1);
  assert.equal(B.list('notes').length, 0);
  assert.equal(B.list('fin_tx')[0].description, 'Kopi');
  assert.ok(r.received >= 2 && r.sent >= 1);
  const idle = await client.sync(A.deviceId());
  assert.equal(idle.sent, 0, 'nothing pushed twice');
  assert.equal(idle.received, 0, 'nothing pulled twice');
});

test('conflicts: the later edit wins; a sticky window move is not an edit; edit after delete survives', async () => {
  const id = B.list('tasks')[0].id;
  A.upsert('tasks', { id, title: 'versi laptop' });
  await wait(5);
  B.upsert('tasks', { id, title: 'versi HP' });
  await client.sync(A.deviceId());
  assert.equal(A.get('tasks', id).title, 'versi HP');
  assert.equal(B.get('tasks', id).title, 'versi HP');

  const n = A.upsert('notes', { title: 'Sticky', content: '{}', plain: 'a' });
  await client.sync(A.deviceId());
  await wait(5);
  B.upsert('notes', { id: n.id, plain: 'diedit di HP' });
  await wait(5);
  A.upsert('notes', { id: n.id, sticky_bounds: '{"x":5}' }, true); // window moved later on the laptop
  await client.sync(A.deviceId());
  assert.equal(A.get('notes', n.id).plain, 'diedit di HP');
  assert.equal(A.get('notes', n.id).sticky_bounds, '{"x":5}');

  A.remove('tasks', id);
  await wait(5);
  B.upsert('tasks', { id, title: 'masih dikerjakan' });
  await client.sync(A.deviceId());
  assert.equal(A.get('tasks', id)?.title, 'masih dikerjakan');
  assert.equal(B.get('tasks', id)?.title, 'masih dikerjakan');
});

test('images from the phone reach the laptop; bulk Total Wealth edits sync', async () => {
  const n = B.upsert('notes', { title: 'Foto', content: '{}', plain: '' });
  const img = B.imagePut(n.id, 'image/webp', new Uint8Array(5000).fill(7));
  B.upsert('notes', { id: n.id, content: `{"src":"dsa-img://img/${img}"}` });
  A.wealthImport([{ date: '2026-11-01', name: 'BCA', category: 'Bank', value: 1000 }, { date: '2026-11-01', name: 'Emas', category: 'Investasi', value: 500 }]);
  await client.sync(A.deviceId());
  assert.equal(A.imageGet(img).data.length, 5000);
  assert.equal(B.list('wealth').length, 2);
  A.wealthRenameCol({ name: 'BCA', category: 'Bank' }, { name: 'BCA Tahapan', category: 'Bank' });
  A.wealthDeleteDate('2026-11-01');
  A.wealthImport([{ date: '2026-11-15', name: 'BCA Tahapan', category: 'Bank', value: 1200 }]);
  await client.sync(A.deviceId());
  assert.deepEqual(B.list('wealth').map((w) => [w.date, w.name, w.value]), [['2026-11-15', 'BCA Tahapan', 1200]]);
});

test('security: wrong key, tampering, replay and unknown devices are refused', async () => {
  const peer = B.peer(A.deviceId());
  const env = await seal(peer.key, B.deviceId(), { since: 0 }, 'nonce-1');
  await server('ping', json(env));
  await assert.rejects(server('ping', json(env)), /replayed/);
  const bad = { ...(await seal(randomKey(), B.deviceId(), {})) };
  await assert.rejects(server('ping', bad));
  const tampered = await seal(peer.key, B.deviceId(), { since: 0 });
  tampered.ct = tampered.ct.slice(0, -4) + 'AAAA';
  await assert.rejects(server('ping', tampered));
  const stranger = await seal(randomKey(), 'someone-else', {});
  await assert.rejects(server('sync', stranger), /unknown device/);
  await assert.rejects(server('pair', await seal(randomKey(), 'x', { device: 'x' })), /pairing is not open/);
  await assert.rejects(open(peer.key, await seal(peer.key, 'a', {}), { maxSkew: -1 }), /stale/);
});
