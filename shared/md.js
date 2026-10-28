// TipTap/ProseMirror JSON -> Markdown (CommonMark + GFM task lists and strikethrough).
// imageSrc(src) lets the caller rewrite image sources (e.g. dsa-img://img/<id> -> ./files/1.webp).
// Pen strokes live outside the document, so they are not part of the Markdown.

const esc = (s) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

function inline(nodes = [], opts) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'hardBreak') { out += '  \n'; continue; }
    if (n.type === 'image') { out += img(n, opts); continue; }
    if (n.type !== 'text') continue;
    const marks = (n.marks || []).map((m) => m.type);
    const code = marks.includes('code');
    let t = code ? '`' + n.text.replace(/`/g, 'ˋ') + '`' : esc(n.text);
    if (!code) {
      // keep surrounding spaces outside the markers, otherwise "** bold**" is not bold
      const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
      let core = t.slice(lead.length, t.length - trail.length);
      if (core) {
        if (marks.includes('bold')) core = `**${core}**`;
        if (marks.includes('italic')) core = `*${core}*`;
        if (marks.includes('strike')) core = `~~${core}~~`;
        if (marks.includes('highlight')) core = `==${core}==`;
      }
      t = lead + core + trail;
    }
    const link = (n.marks || []).find((m) => m.type === 'link');
    if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
    out += t;
  }
  return out;
}

function img(n, opts) {
  const src = opts.imageSrc ? opts.imageSrc(n.attrs?.src || '') : n.attrs?.src || '';
  return src ? `![${esc(n.attrs?.alt || '')}](${src.replace(/ /g, '%20')})` : '';
}

function block(n, opts, indent = '') {
  const c = n.content || [];
  switch (n.type) {
    case 'paragraph': return indent + inline(c, opts).replace(/\n/g, '\n' + indent);
    case 'heading': return indent + '#'.repeat(n.attrs?.level || 1) + ' ' + inline(c, opts);
    case 'image': return indent + img(n, opts);
    case 'horizontalRule': return indent + '---';
    case 'codeBlock': {
      const text = c.map((x) => x.text || '').join('');
      return `${indent}\`\`\`${n.attrs?.language || ''}\n${text.split('\n').map((l) => indent + l).join('\n')}\n${indent}\`\`\``;
    }
    case 'blockquote': return blocks(c, opts, '').split('\n').map((l) => indent + (l ? '> ' + l : '>')).join('\n');
    case 'bulletList': return c.map((li) => item(li, opts, indent, '- ')).join('\n');
    case 'orderedList': { const start = n.attrs?.start || 1; return c.map((li, i) => item(li, opts, indent, `${start + i}. `)).join('\n'); }
    case 'taskList': return c.map((li) => item(li, opts, indent, li.attrs?.checked ? '- [x] ' : '- [ ] ')).join('\n');
    default: return c.length ? blocks(c, opts, indent) : '';
  }
}

function item(li, opts, indent, marker) {
  const pad = indent + ' '.repeat(marker.startsWith('-') ? 2 : marker.length);
  const parts = (li.content || []).map((ch, i) => {
    if (i === 0 && ch.type === 'paragraph') return indent + marker + inline(ch.content, opts);
    const isList = /List$/.test(ch.type);
    return block(ch, opts, isList ? indent + '  ' : pad);
  });
  if (!parts.length) return indent + marker.trimEnd();
  return parts.join('\n');
}

function blocks(nodes, opts, indent) {
  const out = [];
  for (const n of nodes) {
    const b = block(n, opts, indent);
    out.push(b);
  }
  return out.join('\n\n');
}

/** doc: TipTap JSON; title becomes a level-1 heading when given. */
export function toMarkdown(doc, { title = '', imageSrc } = {}) {
  const body = blocks(doc?.content || [], { imageSrc }, '').replace(/\n{3,}/g, '\n\n').trim();
  return (title ? `# ${esc(title)}\n\n` : '') + body + '\n';
}

/** All dsa-img ids referenced by a document, in order of appearance. */
export function imageIds(doc) {
  const ids = [];
  const walk = (n) => {
    if (n.type === 'image') { const m = /^dsa-img:\/\/img\/([\w-]+)/.exec(n.attrs?.src || ''); if (m && !ids.includes(m[1])) ids.push(m[1]); }
    (n.content || []).forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}
