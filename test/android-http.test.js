import test from 'node:test';
import assert from 'node:assert/strict';
import { responseBytes } from '../src/android/httpDecode.js';

const text = (r) => new TextDecoder().decode(responseBytes(r));

test('android http: JSON arrives parsed, other bodies base64, errors as text', () => {
  // the bug in 1.0.0/1.0.1: a parsed JSON object became an empty body -> "Unexpected end of JSON input"
  assert.deepEqual(JSON.parse(text({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, data: { tag_name: 'v1.0.1', assets: [] } })), { tag_name: 'v1.0.1', assets: [] });
  assert.deepEqual(JSON.parse(text({ status: 200, headers: {}, data: [1, 2] })), [1, 2]);
  assert.equal(text({ status: 200, headers: { 'content-type': 'application/rss+xml' }, data: btoa('<rss>ok</rss>') }), '<rss>ok</rss>');
  assert.equal(text({ status: 200, headers: {}, data: 'PHJzcz4K\nb2s=\n' }).startsWith('<rss>'), true); // Android base64 has line breaks
  assert.equal(text({ status: 404, headers: { 'content-type': 'text/html' }, data: 'Not Found' }), 'Not Found');
  assert.equal(responseBytes({ status: 204, headers: {}, data: null }).length, 0);
});
