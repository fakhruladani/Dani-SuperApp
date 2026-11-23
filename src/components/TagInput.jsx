import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DB } from '../lib/api.js';
import { T } from '../lib/i18n.js';

const clean = (s) => String(s || '').replace(/\s|#/g, '');

/** Tags used in `table`, most used first: [{ t, c }]. */
function useTags(table, given) {
  const [loaded, setLoaded] = useState([]);
  useEffect(() => {
    if (given || !table) return undefined;
    let alive = true;
    DB.list(table).then((rows) => {
      const n = new Map();
      for (const r of rows || []) if (r.tag) n.set(r.tag, (n.get(r.tag) || 0) + 1);
      if (alive) setLoaded([...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, c]) => ({ t, c })));
    });
    return () => { alive = false; };
  }, [table, given]);
  return given || loaded;
}

/**
 * Text field for one tag that suggests existing tags while typing (like a search box).
 * Arrow keys + Enter or a click pick a suggestion; any other text is a new tag.
 * options: [{ t, c }] if the caller already has them, otherwise they are read from `table`.
 * onCommit(value): called on Enter or blur (the Notes chip saves there); a pick commits too when commitOnPick.
 * onCancel: Esc with the list closed.
 */
export default function TagInput({ value, onChange, options, table, onCommit, onCancel, commitOnPick = false, max = 8, className = 'field', style, ...rest }) {
  const tags = useTags(table, options);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const input = useRef();
  const cur = useRef(value);
  const skip = useRef(false);
  const id = useId();
  cur.current = value;

  const q = clean(value).toLowerCase();
  const found = useMemo(() => {
    const hit = tags.filter((x) => x.t.toLowerCase().includes(q) && x.t.toLowerCase() !== q);
    // tags that start with the text first, then the rest, each still by usage
    return [...hit.filter((x) => x.t.toLowerCase().startsWith(q)), ...hit.filter((x) => !x.t.toLowerCase().startsWith(q))].slice(0, max);
  }, [tags, q, max]);
  const show = open && found.length > 0;
  useEffect(() => setAct(-1), [q]);

  const pick = (t) => {
    cur.current = t;
    onChange(t);
    setOpen(false);
    if (commitOnPick) input.current?.blur();
  };
  const key = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!show) { setOpen(true); return; }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setAct((a) => { const n = a + d; return n >= found.length ? -1 : n < -1 ? found.length - 1 : n; }); // -1 = back to the typed text
    } else if (e.key === 'Enter') {
      if (show && act >= 0) { e.preventDefault(); e.stopPropagation(); pick(found[act].t); return; }
      if (onCommit) { e.preventDefault(); e.target.blur(); }
    } else if (e.key === 'Escape') {
      if (show) { e.preventDefault(); setOpen(false); return; }
      if (onCancel) { skip.current = true; e.target.blur(); }
    } else if (e.key === 'Tab' && show && act >= 0) {
      pick(found[act].t);
    }
  };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', ...(style?.width ? { width: style.width } : { width: '100%' }) }} data-esc-own={show ? '' : undefined}>
      <input ref={input} className={className} style={{ ...style, width: '100%' }} value={value} autoComplete="off" spellCheck={false}
        role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={id} aria-activedescendant={show && act >= 0 ? `${id}-${act}` : undefined}
        onChange={(e) => { onChange(clean(e.target.value)); setOpen(true); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); if (skip.current) { skip.current = false; onCancel?.(); } else onCommit?.(cur.current); }}
        onKeyDown={key} {...rest} />
      {show && (
        <div className="card tag-pop tag-sug" role="listbox" id={id} aria-label={T('Tag yang sudah ada')}>
          {found.map((x, i) => (
            <button key={x.t} id={`${id}-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i === act} className={`tag-opt ${i === act ? 'on' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(i)} onClick={() => pick(x.t)}>
              <span className="grow ellipsis">#{x.t}</span><span className="mut num">{x.c}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
