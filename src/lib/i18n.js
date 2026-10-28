// Renderer side: the main process passes the language in the page URL (?lang=en).
import { setLang, t, lang } from '../../shared/i18n.js';

setLang(new URLSearchParams(location.search).get('lang'));
document.documentElement.lang = lang();
export { t as T, lang };
