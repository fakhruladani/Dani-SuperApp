// Tiny i18n: Indonesian text is the key; English comes from lang-en.js.
// The language is fixed per window load (changing it reloads the windows), so t() can be
// called anywhere, including module-level constants.
import EN from './lang-en.js';

let LANG = 'id';
export const setLang = (l) => { LANG = l === 'en' ? 'en' : 'id'; };
export const lang = () => LANG;

/** t('Halo {name}', { name }). A key may carry a context suffix ('Keluar|tray') when one
 *  Indonesian word needs two English ones; the suffix is never shown. */
const base = (s) => { const i = s.indexOf('|'); return i < 0 ? s : s.slice(0, i); };
export function t(s, vars) {
  let out = LANG === 'en' ? (EN[s] ?? base(s)) : base(s);
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : k === 's' ? (Number(vars.n) === 1 ? '' : 's') : m));
  return out;
}
