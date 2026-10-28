import { t as T } from '../../shared/i18n.js';

// Content of the in-app guide (Panduan) and the guided tour.
// `where` tells where a feature lives; `open` is the page (and params) the "Buka" button navigates to.

const GUIDE_ID = [
  {
    id: 'mulai', icon: 'bolt', title: 'Mulai cepat', where: 'Seluruh aplikasi',
    intro: 'Dani SuperApp berjalan di latar belakang sejak Windows menyala. Ikon "D" ada di tray (pojok kanan bawah). Klik ikon itu untuk membuka jendela utama.',
    items: [
      ['Pindah menu', 'Pakai menu di kiri, atau Ctrl+1 sampai Ctrl+8 sesuai urutan menu.'],
      ['Cari apa saja', 'Tekan Ctrl+K untuk mencari catatan, acara, tugas, dan transaksi, atau menjalankan perintah seperti "Buat catatan baru".'],
      ['Catatan cepat', 'Tekan Ctrl+Shift+Space dari aplikasi mana pun untuk mencatat tugas, catatan, pengingat, atau transaksi tanpa membuka aplikasi.'],
      ['Widget mini', 'Tombol kotak-kotak di kanan atas membuka widget jam, agenda, dan tugas yang selalu di atas.'],
      ['Mode terang/gelap', 'Tombol bulan/matahari di kanan atas, atau Pengaturan → Umum → Tema (bisa ikut Windows).'],
      ['Tutup jendela', 'Tombol × hanya menyembunyikan jendela ke tray, pengingat tetap jalan. Untuk keluar penuh: klik kanan ikon tray → Keluar.']
    ],
    open: { page: 'home' }
  },
  {
    id: 'beranda', icon: 'home', title: 'Beranda', where: 'Menu Beranda (Ctrl+1)',
    intro: 'Ringkasan hari ini dalam satu layar.',
    items: [
      ['Cuaca & lokasi', 'Cuaca sekarang, per 3 jam, dan 6 hari ke depan. Ganti lokasi di Pengaturan → Umum → Lokasi untuk cuaca.'],
      ['Agenda 7 hari', 'Acara dan libur nasional seminggu ke depan. Klik untuk membuka tanggalnya di Kalender.'],
      ['Ringkasan hari ini', 'Jumlah agenda, tugas, cuaca, dan sisa anggaran. Centang kebiasaan harian langsung di sini.'],
      ['Tugas', 'Ketik tugas dengan bahasa biasa, misalnya "revisi bab 3 besok 09.00 #TA".'],
      ['Keuangan, pasar, berita, catatan', 'Ringkasan modul lain. Klik tombolnya untuk membuka detail.']
    ],
    open: { page: 'home' }
  },
  {
    id: 'kalender', icon: 'cal', title: 'Kalender & pengingat', where: 'Menu Kalender (Ctrl+2)',
    intro: 'Tampilan Hari, Minggu, Bulan, dan Agenda. Di tampilan Bulan, gulir ke bawah atau ke atas untuk pindah bulan; judul di atas ikut berubah.',
    items: [
      ['Buat acara', 'Tombol Buat, klik dua kali tanggal di tampilan Bulan, atau seret di tampilan Hari/Minggu untuk memilih jam.'],
      ['Pengingat', 'Atur di kolom "Pengingat" saat membuat acara (saat mulai sampai 1 minggu sebelum). Notifikasi muncul di Windows.'],
      ['Laptop mati saat jadwal', 'Pengingat yang terlewat muncul begitu laptop menyala (maksimal 3 hari ke belakang), ditandai "Terlewat".'],
      ['Tunda atau selesai', 'Di notifikasi dalam aplikasi: Tunda 10 mnt, Lihat, atau Selesai.'],
      ['Acara berulang', 'Pilih setiap hari, minggu, bulan, atau tahun, dan tanggal berakhirnya bila perlu.'],
      ['Deskripsi hari', 'Klik sebuah tanggal, lalu tulis catatan di panel kanan. Tersimpan otomatis.'],
      ['Pindah jadwal', 'Seret acara ke tanggal/jam lain, atau tarik ujungnya untuk mengubah durasi.'],
      ['Kalender & warna', 'Panel kanan bawah: tampilkan/sembunyikan kalender, ubah warna, tambah kalender baru, tampilkan libur nasional dan tenggat tugas.'],
      ['Impor/ekspor', 'File .ics dari Google Calendar atau Outlook lewat tombol di panel kanan bawah.']
    ],
    open: { page: 'cal' }
  },
  {
    id: 'catatan', icon: 'note', title: 'Catatan', where: 'Menu Catatan (Ctrl+3)',
    intro: 'Catatan dengan format lengkap dan coretan pena. Semua tersimpan otomatis.',
    items: [
      ['Buat catatan', 'Tombol + di atas daftar, atau "Baru dari template" (Bimbingan TA, Rapat, Jurnal harian).'],
      ['Format teks', 'Font, ukuran, judul, tebal (Ctrl+B), miring (Ctrl+I), garis bawah (Ctrl+U), coret, warna teks, stabilo, daftar, checklist, perataan, tautan.'],
      ['Coret pakai pena', 'Pilih ikon pena di toolbar, lalu gambar bebas. Ada juga stabilo bebas dan penghapus. Ctrl+Z membatalkan coretan.'],
      ['Zoom', 'Tombol kaca pembesar di kanan toolbar, atau Ctrl + / Ctrl - / Ctrl 0.'],
      ['Tag & sematkan', 'Klik "+ tambah tag" di atas editor. Sematkan catatan penting dari bagian bawah editor.'],
      ['Jendela mengambang', 'Tombol "Jendela mengambang" di bawah editor menjadikan catatan sticky note di desktop. Di sticky: pilih warna lewat ···, tombol pin untuk selalu di atas, + untuk sticky baru.'],
      ['Simpan template', 'Buka "Baru dari template", lalu simpan catatan yang terbuka sebagai template.'],
      ['Gambar', 'Tempel screenshot dengan Ctrl+V, seret file gambar ke catatan, atau tombol gambar di toolbar. Gambar dikecilkan otomatis dan ikut terenkripsi.'],
      ['Ekspor PDF / Markdown', 'Tombol Ekspor di bawah editor. PDF menyertakan gambar dan coretan pena. Markdown menyimpan gambar di folder sebelahnya, tanpa coretan pena.']
    ],
    open: { page: 'notes' }
  },
  {
    id: 'keuangan', icon: 'wallet', title: 'Keuangan', where: 'Menu Keuangan (Ctrl+4)',
    intro: 'Buku kas bergaya spreadsheet per bulan, dengan pilihan tahun di kiri atas.',
    items: [
      ['Isi transaksi', 'Ketik langsung di baris biru paling bawah tabel, lalu Enter. Atau tombol "Transaksi".'],
      ['Edit di sel', 'Klik sel tanggal, keterangan, kategori, atau nominal untuk mengubahnya. Ikon tempat sampah menghapus baris.'],
      ['Anggaran', 'Panel kanan menunjukkan pemakaian per kategori. Klik angkanya untuk anggaran khusus bulan itu. Anggaran default ada di tab "Kategori & anggaran".'],
      ['Sisa anggaran', 'Total anggaran dikurangi pengeluaran di kategori yang punya anggaran. Set anggaran 0 bila tidak ingin memakainya.'],
      ['Rekap tahunan', 'Grafik arus kas, perbandingan dengan tahun lalu, tabel per bulan, dan komposisi per kategori.'],
      ['Total Wealth', 'Tab terakhir. Catat nilai aset (cash, saham, kripto, emas, kategori bebas). Total dihitung dari nilai terbaru tiap aset. Utang ditulis negatif. Ikon ⟳ membuat baris nilai baru untuk aset yang sama.'],
      ['Ekspor & impor', 'Ekspor Excel (semua sheet termasuk Total Wealth), ekspor CSV, dan impor CSV lewat ikon di kanan atas.']
    ],
    open: { page: 'fin' }
  },
  {
    id: 'market', icon: 'chart', title: 'Market & Berita', where: 'Menu Market & Berita (Ctrl+5)',
    intro: 'Harga tertunda sekitar 10 sampai 15 menit dari Yahoo Finance, dan berita dari RSS media Indonesia.',
    items: [
      ['Watchlist', 'Klik kartu untuk melihat grafik. Tambah simbol lewat tombol "Simbol" (saham BEI berakhiran .JK, misalnya BBRI.JK).'],
      ['Grafik', 'Rentang 1 hari sampai 5 tahun, candle atau garis, serta MA 20/50.'],
      ['Alert harga', 'Panel kanan grafik: atur batas naik/turun, notifikasi muncul saat harga menyentuh batas.'],
      ['Berita', 'Tab Berita: Finance, Indonesia, dan Disimpan. Ikon penanda menyimpan berita untuk dibaca nanti. Sumber RSS diatur di Pengaturan → Berita & market.']
    ],
    open: { page: 'market' }
  },
  {
    id: 'fokus', icon: 'timer', title: 'Fokus & Tugas', where: 'Menu Fokus & Tugas (Ctrl+6)',
    intro: 'Pomodoro, daftar tugas, kebiasaan, dan statistik.',
    items: [
      ['Pomodoro', 'Fokus 25 menit, istirahat 5, istirahat panjang tiap 4 sesi (durasi bisa diubah di Pengaturan). Timer tetap jalan saat pindah menu dan terlihat di menu kiri.'],
      ['Mode jangan ganggu', 'Selama sesi fokus, alert harga dan ringkasan pagi ditahan. Pengingat acara tetap muncul.'],
      ['Tugas bahasa alami', 'Kata yang dikenali: hari ini, besok, lusa, nama hari, 12/11, jam 9, 14.30, #tag, !tinggi.'],
      ['Edit tugas', 'Klik judul tugas untuk mengatur tenggat, jam, prioritas, pengingat, dan catatan.'],
      ['Kebiasaan', 'Centang kotak per hari. Angka di kanan adalah streak hari berturut-turut.']
    ],
    open: { page: 'focus' }
  },
  {
    id: 'proyek', icon: 'project', title: 'Proyek', where: 'Menu Proyek (Ctrl+7)',
    intro: 'Tugas dikelompokkan per tag, lengkap dengan progres, tenggat, dan hitung mundur.',
    items: [
      ['Mulai proyek', 'Cukup beri tag saat menulis tugas, misalnya "revisi bab 3 besok #TA". Tag otomatis muncul sebagai proyek.'],
      ['Nama & tenggat', 'Tombol "Atur proyek" atau "Proyek baru" untuk memberi nama, tenggat, warna, dan catatan. Mengganti tag ikut memindahkan tugasnya.'],
      ['Hitung mundur', 'H-n menuju tenggat proyek. Kuning bila tinggal 7 hari atau kurang, merah bila hari H atau sudah lewat.'],
      ['Progres', 'Persentase tugas selesai dari semua tugas bertag itu, plus jumlah tugas yang terlambat.'],
      ['Tambah tugas', 'Ketik di kolom panel kanan. Tag proyek dipasang otomatis, kata seperti "besok 10.00" tetap dikenali.'],
      ['Arsip', 'Proyek yang sudah selesai bisa diarsipkan dari Edit proyek agar daftar tetap rapi.']
    ],
    open: { page: 'projects' }
  },
  {
    id: 'clipboard', icon: 'clip', title: 'Riwayat clipboard', where: 'Menu Clipboard (Ctrl+8)',
    intro: 'Menyimpan 100 teks terakhir yang disalin. Mati secara default.',
    items: [
      ['Aktifkan', 'Nyalakan saklar di atas halaman. Matikan saat menyalin kata sandi.'],
      ['Pakai lagi', 'Klik teks untuk menyalinnya kembali. Sematkan yang sering dipakai, atau jadikan catatan.']
    ],
    open: { page: 'clip' }
  },
  {
    id: 'pengaturan', icon: 'gear', title: 'Pengaturan, keamanan & backup', where: 'Menu Pengaturan (Ctrl+,)',
    intro: 'Semua data tersimpan di laptop dan dienkripsi.',
    items: [
      ['Auto-start & tray', 'Pengaturan → Umum: jalankan saat Windows menyala, dan tutup ke tray.'],
      ['Lokasi cuaca', 'Pengaturan → Umum → Lokasi: cari kecamatan, atau tombol Deteksi.'],
      ['Pengingat & ringkasan pagi', 'Pengaturan → Pengingat & fokus: pengingat default, jam ringkasan pagi, durasi Pomodoro, tombol tes notifikasi.'],
      ['PIN', 'Pengaturan → Keamanan: pasang PIN dan kunci otomatis. Ctrl+L mengunci aplikasi.'],
      ['Kunci pemulihan', 'Pengaturan → Keamanan → Tampilkan kunci. Simpan di tempat aman: dibutuhkan untuk memulihkan backup di laptop lain.'],
      ['Backup', 'Pengaturan → Backup & data: backup otomatis harian, ganti folder (misalnya ke OneDrive), dan pulihkan.'],
      ['Update aplikasi', 'Aplikasi mengecek rilis baru di GitHub secara otomatis. Saat siap, klik "Pasang & mulai ulang" di Pengaturan → Umum atau dari menu tray. Data tetap ada dan backup dibuat otomatis sebelum versi berganti.']
    ],
    open: { page: 'settings' }
  }
];

const SHORTCUTS_ID = [
  ['Ctrl+K', 'Cari & perintah'], ['Ctrl+Shift+Space', 'Catatan cepat (dari mana saja)'], ['Ctrl+1 … Ctrl+8', 'Pindah menu'],
  ['Ctrl+,', 'Pengaturan'], ['F1', 'Panduan'], ['Ctrl+L', 'Kunci aplikasi (jika PIN aktif)'],
  ['Ctrl+B / I / U', 'Tebal / miring / garis bawah (catatan)'], ['Ctrl+Shift+S', 'Coret teks (catatan)'],
  ['Ctrl + / - / 0', 'Zoom catatan'], ['Ctrl+Z', 'Batalkan (teks atau coretan pena)'], ['Esc', 'Tutup jendela/dialog']
];

// Guided tour: each step opens a page and highlights an element (CSS selector).
const TOUR_ID = [
  { page: 'home', sel: '.sidebar', title: 'Menu utama', body: 'Semua modul ada di sini. Pintasan Ctrl+1 sampai Ctrl+8 mengikuti urutan menu.' },
  { page: 'home', sel: '.searchbox', title: 'Cari & perintah', body: 'Ctrl+K untuk mencari catatan, acara, tugas, transaksi, atau menjalankan perintah.' },
  { page: 'home', sel: '[data-tour="quick"]', title: 'Catatan cepat & widget', body: 'Ikon petir membuka catatan cepat (juga Ctrl+Shift+Space dari mana saja). Ikon kotak membuka widget mini.' },
  { page: 'home', sel: '[data-tour="weather"]', title: 'Beranda', body: 'Cuaca, agenda 7 hari, ringkasan hari ini, tugas, keuangan, pasar, dan berita dalam satu layar.' },
  { page: 'cal', sel: '.cal-main', title: 'Kalender', body: 'Gulir untuk pindah bulan. Klik dua kali tanggal untuk membuat acara, seret acara untuk memindahkan jadwal.' },
  { page: 'cal', sel: '.cal-side', title: 'Panel tanggal', body: 'Deskripsi hari, daftar acara, pengingat cepat, dan pengaturan kalender untuk tanggal yang dipilih.' },
  { page: 'notes', sel: '.toolbar', title: 'Editor catatan', body: 'Format teks, warna, stabilo, checklist, mode pena untuk mencoret bebas, dan zoom.' },
  { page: 'notes', sel: '[data-tour="float"]', title: 'Jendela mengambang', body: 'Jadikan catatan sticky note di desktop, dengan pilihan warna dan selalu di atas.' },
  { page: 'fin', sel: '[data-tour="fin-tabs"]', title: 'Keuangan', body: 'Bulanan, Rekap tahunan, Kategori & anggaran, dan Total Wealth. Tahun bisa diganti di kiri.' },
  { page: 'market', sel: '[data-tour="tickers"]', title: 'Market', body: 'Klik kartu untuk grafik dan alert harga. Tab Berita berisi berita finance dan Indonesia.' },
  { page: 'focus', sel: '[data-tour="pomodoro"]', title: 'Fokus', body: 'Pomodoro dengan mode jangan ganggu. Di sebelahnya: tugas, kebiasaan, dan statistik.' },
  { page: 'projects', sel: '[data-tour="projects"]', title: 'Proyek', body: 'Tugas per tag (misalnya #TA) dengan progres dan hitung mundur tenggat.' },
  { page: 'guide', sel: '[data-tour="nav-guide"]', title: 'Panduan', body: 'Lupa letak fitur? Buka Panduan di sini atau tekan F1. Tur ini bisa diulang dari halaman Panduan.' }
];

// Translate every human-readable string (Indonesian text is the dictionary key); ids, icons, pages and selectors stay.
const KEEP = new Set(['id', 'icon', 'page', 'sel', 'open']);
const tr = (v, k) => (KEEP.has(k) ? v : typeof v === 'string' ? T(v) : Array.isArray(v) ? v.map((x) => tr(x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, tr(x, kk)])) : v);
export const GUIDE = tr(GUIDE_ID);
export const SHORTCUTS = SHORTCUTS_ID.map(([k, d]) => [k, T(d)]);
export const TOUR = tr(TOUR_ID);
