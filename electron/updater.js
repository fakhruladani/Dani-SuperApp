// Auto-update from GitHub Releases (electron-updater). The release workflow in
// .github/workflows/release.yml builds the installer on Windows and uploads it with latest.yml.
// Flow: check (60 s after start, then every 6 h) -> download in the background -> "ready" ->
// the user clicks "Pasang & mulai ulang" (or it installs on the next full quit).
import { app } from 'electron';
import updaterPkg from 'electron-updater';
import { t as T } from '../shared/i18n.js';

const { autoUpdater } = updaterPkg;
let st = { state: 'idle', version: null, percent: 0, error: null, checkedAt: null };
let deps = null; // { broadcast(channel, data), getSetting(k, fallback), onReady(version) }

const set = (patch) => { st = { ...st, ...patch }; deps?.broadcast('update:status', status()); };

function friendly(e) {
  const m = String(e?.message || e || '');
  if (/404|No published versions|Cannot find latest|HttpError: 4\d\d/i.test(m)) return T('Belum ada rilis di GitHub');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR|EAI_AGAIN|socket hang up/i.test(m)) return T('Tidak bisa terhubung ke GitHub (offline?)');
  return m.split('\n')[0].slice(0, 160);
}

export function initUpdater(d) {
  deps = d;
  if (!app.isPackaged) { st.state = 'dev'; return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ state: 'none', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (i) => { set({ state: 'ready', version: i.version, percent: 100, checkedAt: Date.now() }); deps.onReady(i.version); });
  autoUpdater.on('error', (e) => set({ state: st.state === 'ready' ? 'ready' : 'error', error: friendly(e), checkedAt: Date.now() }));
  const auto = () => d.getSetting('autoUpdate', true);
  setTimeout(() => { if (auto()) check(); }, 60 * 1000);
  setInterval(() => { if (auto()) check(); }, 6 * 3600 * 1000);
}

export const status = () => ({ ...st, current: app.getVersion() });

export async function check() {
  if (['dev', 'checking', 'downloading', 'ready'].includes(st.state)) return status();
  try { await autoUpdater.checkForUpdates(); } catch (e) { set({ state: 'error', error: friendly(e), checkedAt: Date.now() }); }
  return status();
}

/** Quits and runs the downloaded installer silently, then restarts the app. Data in %APPDATA% is untouched. */
export function install() {
  if (st.state !== 'ready') return false;
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}
