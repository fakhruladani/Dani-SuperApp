import { t as T } from './i18n.js';

// WMO weather interpretation codes -> [label, icon]
export const WMO = {
  0: ['Cerah', 'sun'], 1: ['Cerah berawan', 'sun-cloud'], 2: ['Berawan sebagian', 'sun-cloud'], 3: ['Berawan', 'cloud'],
  45: ['Berkabut', 'fog'], 48: ['Kabut beku', 'fog'], 51: ['Gerimis ringan', 'drizzle'], 53: ['Gerimis', 'drizzle'], 55: ['Gerimis lebat', 'drizzle'],
  56: ['Gerimis beku', 'drizzle'], 57: ['Gerimis beku', 'drizzle'],
  61: ['Hujan ringan', 'rain'], 63: ['Hujan', 'rain'], 65: ['Hujan lebat', 'rain'], 66: ['Hujan beku', 'rain'], 67: ['Hujan beku', 'rain'],
  71: ['Salju ringan', 'snow'], 73: ['Salju', 'snow'], 75: ['Salju lebat', 'snow'], 77: ['Butiran salju', 'snow'], 80: ['Hujan lokal', 'rain'], 81: ['Hujan lokal', 'rain'],
  82: ['Hujan lokal lebat', 'rain'], 85: ['Salju', 'snow'], 86: ['Salju', 'snow'], 95: ['Badai petir', 'storm'], 96: ['Badai petir', 'storm'], 99: ['Badai petir', 'storm']
};
export const wmo = (code) => (WMO[code] ? [T(WMO[code][0]), WMO[code][1]] : ['—', 'cloud']);
