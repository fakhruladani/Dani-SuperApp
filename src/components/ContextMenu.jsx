import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';
import { T } from '../lib/i18n.js';

// Right-click menus. Any component calls openMenu(event, items); one <ContextMenuHost/> per window
// renders it. Item: { label, icon, run, danger, disabled, hint } or '-' for a separator.
// Right-clicks nobody handled fall back to a text menu (cut/copy/paste) on inputs and selections.
let listener = null;
export function openMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  const list = items.filter(Boolean);
  if (listener && list.length) listener({ x: e.clientX, y: e.clientY, items: list });
}

const edit = (cmd) => api('edit:cmd', cmd);
const isEditable = (el) => !!el?.closest?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, [contenteditable="true"]');

/** Standard text items; `editable` adds cut/paste, `undo` adds undo/redo. */
export function textItems({ editable = true, undo = true, hasSelection = !!window.getSelection()?.toString() } = {}) {
  return [
    ...(editable && undo ? [{ label: T('Urungkan'), icon: 'undo', hint: 'Ctrl+Z', run: () => edit('undo') }, { label: T('Ulangi'), icon: 'redo', hint: 'Ctrl+Y', run: () => edit('redo') }, '-'] : []),
    ...(editable ? [{ label: T('Potong'), icon: 'cut', hint: 'Ctrl+X', disabled: !hasSelection, run: () => edit('cut') }] : []),
    { label: T('Salin'), icon: 'copy', hint: 'Ctrl+C', disabled: !hasSelection, run: () => edit('copy') },
    ...(editable ? [{ label: T('Tempel'), icon: 'paste', hint: 'Ctrl+V', run: () => edit('paste') }] : []),
    '-',
    { label: T('Pilih semua'), icon: 'selectAll', hint: 'Ctrl+A', run: () => edit('selectAll') }
  ];
}

export default function ContextMenuHost() {
  const [menu, setMenu] = useState(null);
  const ref = useRef();
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [active, setActive] = useState(-1);

  useEffect(() => {
    listener = (m) => { setMenu(m); setActive(-1); };
    // fallback for right-clicks no feature menu claimed
    const onCtx = (e) => {
      if (e.defaultPrevented) return;
      if (isEditable(e.target)) {
        const el = e.target.closest('input, textarea');
        openMenu(e, textItems({ hasSelection: el ? el.selectionEnd > el.selectionStart : !!window.getSelection()?.toString() }));
        return;
      }
      if (window.getSelection()?.toString()) openMenu(e, textItems({ editable: false }));
    };
    window.addEventListener('contextmenu', onCtx);
    return () => { listener = null; window.removeEventListener('contextmenu', onCtx); };
  }, []);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(6, Math.min(menu.x, window.innerWidth - r.width - 6));
    const top = menu.y + r.height > window.innerHeight - 6 ? Math.max(6, menu.y - r.height) : menu.y;
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const down = (e) => { if (!ref.current?.contains(e.target)) close(); };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); window.removeEventListener('wheel', close); };
  }, [menu]);

  // keyboard while open, without moving focus away from the input/editor the commands act on
  const keyRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const k = (e) => keyRef.current?.(e);
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [menu]);

  if (!menu) return null;
  const items = menu.items;
  const usable = items.map((it, i) => (it !== '-' && !it.disabled ? i : -1)).filter((i) => i >= 0);
  const run = (it) => { setMenu(null); if (it && it !== '-' && !it.disabled) Promise.resolve().then(() => it.run?.()); };
  keyRef.current = (e) => {
    if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter', ' ', 'Tab'].includes(e.key)) { setMenu(null); return; }
    e.stopPropagation();
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = usable.indexOf(active);
      const next = e.key === 'ArrowDown' ? usable[(at + 1) % usable.length] : usable[(at - 1 + usable.length) % usable.length];
      setActive(next ?? -1);
      return;
    }
    if (active >= 0) { e.preventDefault(); run(items[active]); } else setMenu(null);
  };
  return (
    <div ref={ref} className="ctx-menu card" role="menu" style={pos} onMouseDown={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => (it === '-' ? <div key={i} className="ctx-sep" role="separator" /> : (
        <button key={i} role="menuitem" tabIndex={-1} className={`ctx-item ${it.danger ? 'danger' : ''} ${active === i ? 'on' : ''}`} disabled={it.disabled} onMouseEnter={() => setActive(i)} onClick={() => run(it)}>
          <span className="ctx-ic">{it.icon ? <Icon name={it.icon} size="sm" /> : it.glyph ? <span style={{ fontWeight: 800, ...it.glyphStyle }}>{it.glyph}</span> : null}</span>
          <span className="grow">{it.label}</span>
          {it.hint && <span className="ctx-hint">{it.hint}</span>}
        </button>
      )))}
    </div>
  );
}
