// Automatic category for a transaction from its description ("(otomatis)" in the finance sheet).
// 1) the category used last time for the same description, 2) keyword list below,
// 3) the "Lainnya" category of that kind, 4) the first category of that kind.
// Rules are matched to the user's own categories by name, so renamed categories ("Makanan") still work.

const RULES = [
  // ---------- pengeluaran ----------
  { kind: 'out', names: ['makan', 'makanan', 'makan & minum', 'food', 'kuliner', 'konsumsi'], words: [
    'makan', 'makanan', 'sarapan', 'makan pagi', 'makan siang', 'makan malam', 'lunch', 'dinner', 'breakfast', 'brunch', 'kopi', 'coffee', 'ngopi', 'cafe', 'kafe',
    'jajan', 'jajanan', 'snack', 'cemilan', 'camilan', 'gofood', 'grabfood', 'shopeefood', 'resto', 'restoran', 'restaurant', 'warteg', 'warung', 'nasi', 'nasgor',
    'bakso', 'mie', 'mi ayam', 'mie ayam', 'ayam', 'sate', 'soto', 'martabak', 'pizza', 'burger', 'kfc', 'mcd', 'mcdonald', 'hokben', 'starbucks', 'janji jiwa',
    'kopi kenangan', 'fore', 'minum', 'minuman', 'boba', 'es teh', 'teh', 'jus', 'roti', 'gorengan', 'catering', 'katering', 'galon', 'air minum', 'lauk',
    'sayur', 'buah', 'seblak', 'padang', 'geprek', 'pecel', 'gado', 'ketoprak', 'bubur', 'indomie', 'traktir', 'kantin'
  ] },
  { kind: 'out', names: ['transport', 'transportasi', 'kendaraan', 'perjalanan'], words: [
    'bensin', 'bbm', 'pertalite', 'pertamax', 'solar', 'spbu', 'parkir', 'tol', 'e-toll', 'etoll', 'gojek', 'goride', 'gocar', 'grab', 'grabbike', 'grabcar',
    'maxim', 'indrive', 'ojek', 'ojol', 'taxi', 'taksi', 'bluebird', 'krl', 'commuter', 'mrt', 'lrt', 'transjakarta', 'tj', 'busway', 'bus', 'damri', 'kereta',
    'kai', 'whoosh', 'pesawat', 'tiket pesawat', 'travel', 'servis motor', 'servis mobil', 'service motor', 'bengkel', 'ganti oli', 'oli', 'ban', 'cuci motor',
    'cuci mobil', 'angkot', 'pajak motor', 'pajak mobil', 'stnk', 'sim'
  ] },
  { kind: 'out', names: ['tempat tinggal', 'rumah', 'kos', 'kost', 'sewa', 'hunian'], words: [
    'kos', 'kost', 'kosan', 'kontrakan', 'sewa', 'sewa rumah', 'apartemen', 'cicilan rumah', 'kpr', 'ipl', 'renovasi', 'perbaikan rumah'
  ] },
  { kind: 'out', names: ['tagihan', 'bills', 'utilitas'], words: [
    'listrik', 'pln', 'token listrik', 'token', 'pdam', 'air pam', 'internet', 'wifi', 'indihome', 'biznet', 'myrepublic', 'firstmedia', 'pulsa', 'paket data',
    'kuota', 'telepon', 'telkomsel', 'xl', 'indosat', 'bpjs', 'asuransi', 'iuran', 'langganan', 'cicilan', 'paylater', 'kartu kredit', 'tagihan', 'pajak', 'pbb'
  ] },
  { kind: 'out', names: ['belanja', 'shopping', 'kebutuhan', 'kebutuhan rumah'], words: [
    'belanja', 'belanjaan', 'shopee', 'tokopedia', 'tokped', 'lazada', 'blibli', 'tiktok shop', 'indomaret', 'alfamart', 'alfamidi', 'superindo', 'hypermart',
    'transmart', 'lotte', 'supermarket', 'minimarket', 'pasar', 'baju', 'celana', 'sepatu', 'sandal', 'kaos', 'kemeja', 'jaket', 'tas', 'sabun', 'sampo', 'shampoo',
    'odol', 'pasta gigi', 'deterjen', 'tisu', 'skincare', 'kosmetik', 'parfum', 'perabot', 'ikea', 'ace hardware', 'elektronik', 'gadget', 'hp', 'charger', 'kabel'
  ] },
  { kind: 'out', names: ['olahraga', 'sport', 'fitness'], words: [
    'gym', 'fitness', 'lari', 'running', 'sepatu lari', 'jersey', 'futsal', 'badminton', 'bulutangkis', 'renang', 'kolam renang', 'yoga', 'pilates', 'sepeda',
    'raket', 'shuttlecock', 'protein', 'whey', 'marathon', 'race', 'registrasi lari', 'membership'
  ] },
  { kind: 'out', names: ['hiburan', 'entertainment', 'rekreasi', 'hobi'], words: [
    'nonton', 'bioskop', 'cinema', 'xxi', 'cgv', 'cinepolis', 'netflix', 'spotify', 'youtube premium', 'disney', 'vidio', 'game', 'steam', 'top up', 'topup',
    'diamond', 'voucher game', 'konser', 'karaoke', 'liburan', 'wisata', 'hotel', 'staycation', 'rekreasi', 'streaming', 'tiket'
  ] },
  { kind: 'out', names: ['kesehatan', 'health', 'medis'], words: [
    'obat', 'apotek', 'apotik', 'dokter', 'klinik', 'rumah sakit', 'rs', 'puskesmas', 'vitamin', 'suplemen', 'periksa', 'cek darah', 'lab', 'gigi', 'dokter gigi',
    'kacamata', 'masker', 'halodoc', 'alodokter', 'fisioterapi', 'pijat', 'urut'
  ] },
  { kind: 'out', names: ['pendidikan', 'education', 'kuliah', 'sekolah', 'belajar'], words: [
    'kuliah', 'ukt', 'spp', 'buku', 'kursus', 'course', 'les', 'udemy', 'coursera', 'seminar', 'workshop', 'sertifikasi', 'ujian', 'print', 'printing', 'fotokopi',
    'fotocopy', 'jilid', 'alat tulis', 'atk', 'skripsi', 'wisuda', 'pelatihan', 'training'
  ] },
  { kind: 'out', names: ['tabungan/investasi', 'tabungan', 'investasi', 'saving', 'savings', 'investment'], words: [
    'tabungan', 'nabung', 'menabung', 'investasi', 'reksa dana', 'reksadana', 'saham', 'bibit', 'stockbit', 'ajaib', 'emas', 'antam', 'deposito', 'obligasi',
    'sbn', 'crypto', 'kripto', 'bitcoin', 'dana darurat'
  ] },
  { kind: 'out', names: ['sedekah', 'donasi', 'amal', 'zakat', 'sosial'], words: [
    'sedekah', 'donasi', 'infaq', 'infak', 'zakat', 'amal', 'sumbangan', 'kondangan', 'kado', 'hadiah', 'arisan'
  ] },
  // ---------- pemasukan ----------
  { kind: 'in', names: ['gaji', 'salary', 'pendapatan utama'], words: [
    'gaji', 'salary', 'payroll', 'thr', 'tunjangan', 'bonus', 'insentif', 'uang makan', 'lembur', 'tukin'
  ] },
  { kind: 'in', names: ['sampingan', 'freelance', 'usaha', 'bisnis', 'side income'], words: [
    'freelance', 'proyek', 'project', 'sampingan', 'jualan', 'penjualan', 'jual', 'komisi', 'honor', 'fee', 'endorse', 'side job', 'usaha', 'order', 'klien', 'client'
  ] },
  { kind: 'in', names: ['investasi', 'hasil investasi', 'dividen'], words: [
    'dividen', 'bunga', 'kupon', 'imbal hasil', 'profit saham', 'cuan'
  ] }
];

export const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&/\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// whole word / phrase; words of 5+ letters also match as a prefix ("belanjaan", "sarapannya")
const wordRe = new Map();
const hit = (text, w) => {
  let re = wordRe.get(w);
  if (!re) { re = new RegExp(`(^|\\s)${esc(w)}${w.length >= 5 ? '' : '(?=\\s|$)'}`); wordRe.set(w, re); }
  return re.test(text);
};

/**
 * description: what the user typed; kind: 'in' | 'out'; cats: fin_categories rows;
 * history: earlier fin_tx rows (optional) to reuse the category of the same description.
 * Returns { id, reason: 'history' | 'keyword' | 'fallback' } or null when there is no category of that kind.
 */
export function guessCategory(description, kind, cats, history = []) {
  const list = cats.filter((c) => c.kind === kind && !c.archived);
  if (!list.length) return null;
  const text = normText(description);
  if (text) {
    const prev = history.filter((t) => t.kind === kind && normText(t.description) === text && list.some((c) => c.id === t.category_id))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
    if (prev) return { id: prev.category_id, reason: 'history' };
    let best = null;
    for (const r of RULES) {
      if (r.kind !== kind) continue;
      const cat = list.find((c) => r.names.includes(normText(c.name)));
      if (!cat) continue;
      for (const w of r.words) if ((!best || w.length > best.len) && hit(text, w)) best = { id: cat.id, len: w.length };
    }
    if (best) return { id: best.id, reason: 'keyword' };
  }
  const other = list.find((c) => /^lainnya|^lain-lain|^other/i.test(c.name.trim()));
  return { id: (other || list[0]).id, reason: 'fallback' };
}
