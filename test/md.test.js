import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, imageIds } from '../shared/md.js';

const p = (...content) => ({ type: 'paragraph', content });
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}) });

test('markdown: headings, marks, links, escaping', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Masukan')] },
    p(t('Perjelas '), t('skenario ', 'bold'), t('dan '), t('metrik', 'italic'), t(' lalu '), t('coret', 'strike'), t('.')),
    p(t('Lihat '), t('repo', { type: 'link', attrs: { href: 'https://github.com' } }), t(' dan pakai '), t('npm test', 'code'), t(' * bukan_markdown')),
    { type: 'horizontalRule' }
  ] };
  assert.equal(toMarkdown(doc, { title: 'Bimbingan' }),
    '# Bimbingan\n\n## Masukan\n\nPerjelas **skenario** dan *metrik* lalu ~~coret~~.\n\nLihat [repo](https://github.com) dan pakai `npm test` \\* bukan\\_markdown\n\n---\n');
});

test('markdown: nested lists, task lists, quotes, code, images', () => {
  const li = (...c) => ({ type: 'listItem', content: c });
  const doc = { type: 'doc', content: [
    { type: 'bulletList', content: [li(p(t('satu')), { type: 'bulletList', content: [li(p(t('anak')))] }), li(p(t('dua')))] },
    { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('tiga'))), li(p(t('empat')))] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('revisi'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('kirim'))] }] },
    { type: 'blockquote', content: [p(t('kutipan'))] },
    { type: 'codeBlock', attrs: { language: 'js' }, content: [t('a = 1\nb = 2')] },
    { type: 'image', attrs: { src: 'dsa-img://img/abc-123', alt: 'diagram' } }
  ] };
  const md = toMarkdown(doc, { imageSrc: (s) => s.replace('dsa-img://img/abc-123', 'Bab 3_files/1.webp') });
  assert.equal(md, '- satu\n  - anak\n- dua\n\n3. tiga\n4. empat\n\n- [x] revisi\n- [ ] kirim\n\n> kutipan\n\n```js\na = 1\nb = 2\n```\n\n![diagram](Bab%203_files/1.webp)\n');
  assert.deepEqual(imageIds(doc), ['abc-123']);
});

test('markdown: empty doc', () => {
  assert.equal(toMarkdown({ type: 'doc', content: [] }), '\n');
});
