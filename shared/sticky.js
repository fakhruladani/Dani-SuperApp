// Sticky note colors: header bar, light body, dark body.
export const STICKY_COLORS = {
  yellow: { name: 'Kuning', head: '#F2C200', light: '#FFF7CF', dark: '#2E2B22' },
  green: { name: 'Hijau', head: '#7CCB87', light: '#E3F6E1', dark: '#232D25' },
  pink: { name: 'Merah muda', head: '#F08CBE', light: '#FFE3F0', dark: '#2F2329' },
  purple: { name: 'Ungu', head: '#B39CF2', light: '#EFE7FF', dark: '#29253A' },
  blue: { name: 'Biru', head: '#79B4EE', light: '#E1EFFD', dark: '#222A35' },
  gray: { name: 'Abu-abu', head: '#BDBBB8', light: '#F3F2F1', dark: '#2A2A2A' },
  charcoal: { name: 'Arang', head: '#5A5A5A', light: '#E7E7E7', dark: '#202020' }
};
export const stickyColor = (k) => STICKY_COLORS[k] || STICKY_COLORS.yellow;
