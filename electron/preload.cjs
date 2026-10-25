// Minimal, whitelisted bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['db:changed', 'reminder:fire', 'clock:tick', 'nav', 'theme:changed', 'power:resume', 'power:lock', 'quick:shown'];

contextBridge.exposeInMainWorld('dsa', {
  invoke: (name, ...args) => ipcRenderer.invoke('invoke', name, ...args),
  on: (event, cb) => {
    if (!EVENTS.includes(event)) throw new Error('Event tidak diizinkan: ' + event);
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(event, fn);
    return () => ipcRenderer.removeListener(event, fn);
  }
});
