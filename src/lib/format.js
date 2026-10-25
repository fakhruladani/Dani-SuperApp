export const rupiah = (n, { sign = false, short = false } = {}) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  let s;
  if (short && abs >= 1e9) s = (abs / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  else if (short && abs >= 1e6) s = (abs / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  else if (short && abs >= 1e3) s = (abs / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
  else s = abs.toLocaleString('id-ID');
  const pre = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${pre}Rp ${s}`;
};

export const num = (n, d = 2) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n) => (n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

export const parseAmount = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
export const formatAmountInput = (s) => { const n = parseAmount(s); return n ? n.toLocaleString('id-ID') : ''; };

export function priceDigits(p) {
  if (p == null) return 2;
  if (p >= 1000) return 2;
  if (p >= 1) return 2;
  return 4;
}

export function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.round(h / 24);
  return `${d} hari lalu`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}
