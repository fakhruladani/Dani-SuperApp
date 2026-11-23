// Android build: the few CommonJS modules the desktop code require()s.
const iconv = {
  encodingExists: (e) => { try { new TextDecoder(e); return true; } catch { return false; } },
  decode: (buf, enc) => new TextDecoder(enc).decode(buf)
};
export function createRequire() {
  return (name) => {
    if (name === 'iconv-lite') return iconv;
    if (name === 'exceljs' && globalThis.__exceljs) return globalThis.__exceljs; // loaded by the export handler first
    throw new Error('Module not available on Android: ' + name);
  };
}
export default { createRequire };
