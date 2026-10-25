# Dani SuperApp

Aplikasi desktop pribadi untuk Windows: kalender + pengingat, catatan dengan pena, keuangan (model Catatku), market & berita, cuaca, fokus/tugas/kebiasaan, clipboard, dan widget. Semua data disimpan lokal dan terenkripsi.

## Instalasi

1. Jalankan `installer/Dani-SuperApp-Setup-1.0.0.exe`.
2. Installer belum ditandatangani (code signing), jadi Windows SmartScreen bisa menampilkan "Windows protected your PC". Klik **More info → Run anyway**.
3. Setelah terpasang, aplikasi otomatis berjalan saat Windows menyala (bisa dimatikan di Pengaturan → Umum). Saat auto-start, aplikasi langsung tersembunyi di tray (ikon "D" di pojok kanan bawah).

Agar notifikasi pengingat muncul:
- Pengaturan Windows → Sistem → Notifikasi → pastikan **Dani SuperApp** diizinkan.
- Matikan Focus Assist / "Jangan Ganggu" jika ingin notifikasi tetap tampil.
- Notifikasi hanya andal dari versi yang **diinstal** (bukan dari `npm run dev`), karena Windows butuh shortcut Start Menu dengan AppUserModelID.

## Fitur

**Beranda** — sapaan, jam real-time, cuaca + lokasi (Open-Meteo), ramalan per jam & 6 hari, agenda 7 hari, ringkasan hari ini, tugas, kebiasaan, keuangan bulan ini, pasar, berita terbaru, catatan terbaru.

**Kalender** — tampilan Hari / Minggu / Bulan / Agenda (mirip Google Calendar), garis "sekarang" yang bergerak mengikuti jam sistem, hari ini otomatis berganti saat tengah malam dan setelah laptop bangun dari sleep. Acara seharian / berjam, berulang (harian, mingguan, bulanan, tahunan, dengan tanggal akhir), warna per kalender, drag & drop, deskripsi per tanggal, libur nasional Indonesia (Google public holiday feed), tenggat tugas ikut tampil, impor/ekspor `.ics`.

**Pengingat** — notifikasi Windows sesuai offset (saat mulai s.d. 1 minggu sebelum). Mesin pengingat berjalan di proses utama berdasarkan waktu absolut, jadi aman terhadap sleep/hibernate dan perubahan jam. Pengingat yang lewat saat laptop mati muncul begitu laptop menyala (ditandai "Terlewat", maksimal 3 hari ke belakang). Toast di aplikasi punya tombol **Tunda 10 mnt / Lihat / Selesai**.

**Catatan** — banyak catatan, cari, tag, sematkan, template (Bimbingan TA, Rapat, Jurnal harian, atau simpan sendiri). Editor: font (termasuk Caveat tulisan tangan), ukuran, judul, **tebal**, *miring*, garis bawah, ~~coret~~, kode, warna teks, stabilo teks, daftar, checklist, kutipan, rata kiri/tengah/kanan, garis pemisah, tautan. **Mode pena** untuk mencoret bebas (mendukung tekanan pen tablet), stabilo bebas, penghapus coretan, urungkan coretan (Ctrl+Z). Zoom 50–200% (Ctrl + / − / 0). Simpan otomatis.

**Keuangan** — ganti tahun (‹ tahun ›), tab bulanan Jan–Des, lembar transaksi bergaya spreadsheet (edit langsung di sel, baris baru di bawah), kategori masuk/keluar, anggaran default per kategori + anggaran khusus per bulan. **Rekap tahunan**: total & perbandingan dengan tahun lalu, tingkat tabungan, rata-rata pengeluaran, grafik arus kas + saldo kumulatif, tabel per bulan, komposisi per kategori, matriks kategori × bulan. Ekspor Excel (sheet rekap, per kategori, dan per bulan), ekspor/impor CSV. **Total Wealth**: lembar kekayaan (tanggal, kategori bebas, nama aset, nilai, catatan); total bersih, per kategori, dan tren bulanan dihitung otomatis dari nilai terbaru tiap aset. Utang ditulis negatif.

**Market & Berita** — watchlist (IHSG, LQ45, USD/IDR, emas, bank besar, S&P 500, Bitcoin; bisa tambah simbol apa pun dari Yahoo Finance), grafik candle/garis dengan volume dan MA 20/50, rentang 1H–5T, alert harga (notifikasi saat menyentuh batas). Berita dari RSS (CNBC Indonesia, detik, Antara, CNN Indonesia, Tempo, Republika, Okezone; bisa tambah RSS sendiri), filter sumber, cari, simpan untuk dibaca nanti.

**Fokus & Tugas** — Pomodoro (durasi bisa diatur, istirahat panjang tiap 4 sesi, mode jangan ganggu untuk notifikasi non-penting), tugas dengan input bahasa alami ("revisi abstrak besok 09.00 #TA !tinggi"), prioritas, tenggat + pengingat, kebiasaan mingguan dengan streak, statistik 7 hari.

**Lainnya** — Ctrl+K cari & perintah global, catatan cepat dari mana saja (Ctrl+Shift+Space), widget mini always-on-top, riwayat clipboard (opsional, default mati), ringkasan pagi via notifikasi, kunci PIN (saat buka, saat Windows dikunci, dan setelah tidak aktif), mode terang/gelap/ikuti Windows.

## Data, keamanan, backup

- Data: `%APPDATA%\Dani SuperApp\data.db.enc` — database SQLite yang dienkripsi AES-256-GCM. Kunci enkripsi dibungkus Windows DPAPI (terikat akun Windows), jadi aplikasi bisa jalan dan memunculkan pengingat tanpa memasukkan PIN.
- PIN hanya mengunci tampilan; pengingat tetap berjalan.
- Backup otomatis harian ke `Documents\Dani SuperApp\Backup` (bisa diganti, misalnya ke folder OneDrive/Google Drive). Simpan 14 file terakhir.
- **Kunci pemulihan** (Pengaturan → Keamanan) dibutuhkan untuk memulihkan backup di laptop atau akun Windows lain. Catat dan simpan di tempat aman.
- Proses renderer berjalan dengan `contextIsolation`, `sandbox`, tanpa `nodeIntegration`, dengan CSP ketat. Akses database lewat IPC yang memvalidasi nama tabel/kolom (whitelist).

## Pengembangan

Butuh Node.js 20+ di Windows.

```
npm install
npm run dev      # Vite + Electron dengan hot reload
npm test         # unit test backend (recurrence, DB, enkripsi, import/export)
npm run dist     # build installer ke folder release/
```

Struktur:

```
electron/   main.js (jendela, tray, IPC), db.js (SQLite terenkripsi), scheduler.js (pengingat, ringkasan, alert, backup),
            services.js (cuaca, lokasi, Yahoo Finance, RSS, libur), io.js (Excel/CSV/ICS), preload.cjs
shared/     recur.js (tanggal, pengulangan, parser tugas), weather.js
src/        React UI: App.jsx, pages/*, components/*
test/       node:test
```

## Batasan yang perlu diketahui

- Data market memakai endpoint publik Yahoo Finance yang **tidak resmi** dan tertunda ±10–15 menit. Bisa berubah/terblokir sewaktu-waktu; semua akses lewat `electron/services.js`, jadi mudah diganti provider lain.
- Deteksi lokasi memakai lokasi Windows bila tersedia, lalu jatuh ke perkiraan berbasis IP (bisa meleset ke kota lain). Lokasi manual (cari kecamatan) paling akurat.
- Libur nasional diambil dari kalender publik Google; tanggal cuti bersama bisa tentatif.
- Electron membuat installer cukup besar (±130 MB) dan aplikasi memakai RAM ratusan MB saat jendela terbuka.
- Installer tidak ditandatangani (lihat SmartScreen di atas).
