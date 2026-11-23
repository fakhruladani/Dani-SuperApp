// Android build: electron/io.js reads and writes files by path. Here those "files" live in memory;
// the Android handlers put a picked file in before an import and take the result out after an export.
const files = new Map();
export const vfs = files;
const bytes = (d) => (typeof d === 'string' ? d : d instanceof Uint8Array ? d : new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d));
export function writeFileSync(p, data) { files.set(String(p), bytes(data)); }
export function readFileSync(p, enc) {
  const v = files.get(String(p));
  if (v == null) throw new Error('ENOENT ' + p);
  return enc && typeof v !== 'string' ? new TextDecoder().decode(v) : v;
}
export const existsSync = (p) => files.has(String(p));
export default { writeFileSync, readFileSync, existsSync };
