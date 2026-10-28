# Dani SuperApp

**Dani SuperApp adalah ruang kerja pribadi di desktop Windows.** Kalender dengan pengingat, catatan yang bisa dicoret pakai pena, buku keuangan bergaya spreadsheet, total kekayaan, market dan berita, cuaca, serta fokus dan tugas, semuanya dalam satu aplikasi. Data disimpan di laptop sendiri dan dienkripsi.

Tersedia dalam Bahasa Indonesia dan English (ganti di Pengaturan → Umum → Bahasa / Language). Mata uang Rupiah (`Rp1.250.000`), zona waktu mengikuti Windows. Mode terang, gelap, atau ikuti sistem.

![Beranda](docs/screenshots/beranda.png)

## Fitur

| | |
|---|---|
| **Beranda** | Sapaan, jam real-time, cuaca dan lokasi (per jam dan 6 hari), agenda 7 hari, ringkasan hari ini, tugas, kebiasaan, keuangan bulan ini, pasar, berita terbaru, catatan terbaru. |
| **Kalender** | Tampilan Hari, Minggu, Bulan, dan Agenda seperti Google Calendar. Tampilan Bulan bisa digulir ke atas dan ke bawah, judul bulan di atas ikut berubah. Garis "sekarang" bergerak mengikuti jam sistem, hari ini berganti otomatis saat tengah malam dan setelah laptop bangun dari sleep. Acara berulang (harian, mingguan, bulanan, tahunan), warna per kalender, drag and drop, deskripsi per tanggal, libur nasional Indonesia, impor dan ekspor `.ics`. |
| **Pengingat** | Notifikasi Windows dari "saat dimulai" sampai "1 minggu sebelum". Pengingat yang lewat saat laptop mati muncul begitu laptop menyala (maksimal 3 hari ke belakang). Tombol Tunda 10 menit, Lihat, dan Selesai. |
| **Catatan** | Banyak catatan dengan tag, sematkan, pencarian, dan template. Font, ukuran, judul, tebal, miring, garis bawah, coret, warna teks, stabilo, checklist, perataan, tautan. **Mode pena** untuk mencoret bebas (mendukung tekanan pen tablet), stabilo bebas, penghapus. Zoom 50% sampai 200%. Simpan otomatis. **Gambar**: tempel screenshot (Ctrl+V), seret file, atau tombol gambar; dikecilkan otomatis dan ikut terenkripsi. **Ekspor** ke PDF (dengan gambar dan coretan pena) atau Markdown (gambar di folder terpisah). **Jendela mengambang**: catatan bisa dilepas jadi sticky note di desktop, dengan 7 pilihan warna, opsi selalu di atas, dan tetap tersinkron dengan aplikasi. |
| **Proyek** | Tugas dikelompokkan per tag (misalnya `#TA`) dengan progres, jumlah tugas terlambat, tenggat proyek, dan hitung mundur H-n. Cukup beri tag pada tugas, proyek muncul sendiri. Nama, warna, catatan, dan arsip bisa diatur. |
| **Keuangan** | Tab bulanan Jan sampai Des seperti workbook Excel, ganti tahun, isi langsung di sel. Kategori masuk dan keluar, anggaran default per kategori plus anggaran khusus per bulan. |
| **Rekap tahunan** | Grafik arus kas dan saldo kumulatif, perbandingan dengan tahun lalu, tingkat tabungan, tabel per bulan, komposisi per kategori, matriks kategori × bulan. |
| **Total Wealth** | Lembar kekayaan: tanggal, kategori bebas (cash, saham, kripto, emas, dan lainnya), nama aset, nilai. Total bersih, rincian per kategori, dan tren bulanan dihitung otomatis dari nilai terbaru tiap aset. Utang ditulis negatif. |
| **Ekspor** | Excel satu tahun (rekap, per kategori, 12 sheet bulan, Total Wealth), CSV, dan impor CSV. |
| **Market & Berita** | Watchlist IHSG, LQ45, USD/IDR, emas, saham bank, S&P 500, Bitcoin, dan simbol apa pun dari Yahoo Finance. Grafik candle atau garis dengan volume dan MA 20/50. Alert harga lewat notifikasi. Berita dari RSS media Indonesia, bisa ditambah sendiri, dan disimpan untuk dibaca nanti. |
| **Fokus & Tugas** | Pomodoro dengan mode jangan ganggu, tugas dengan input bahasa alami (`revisi abstrak besok 09.00 #TA !tinggi`), kebiasaan mingguan dengan streak, statistik fokus 7 hari. |
| **Panduan & tur** | Menu Panduan (F1) berisi semua fitur, letaknya, cara memakainya, dan pintasan keyboard, lengkap dengan pencarian. Tur singkat menyorot tiap bagian aplikasi dan muncul otomatis saat pertama kali dibuka. |
| **Update otomatis** | Aplikasi mengecek GitHub Releases, mengunduh versi baru di latar belakang, lalu menawarkan "Pasang & mulai ulang" dari Pengaturan atau menu tray. |
| **Dua bahasa** | Indonesia dan English untuk seluruh tampilan, panduan, tur, notifikasi, menu tray, dan ekspor Excel. Data yang kamu tulis sendiri tidak ikut diterjemahkan. |
| **Lainnya** | Ctrl+K untuk cari dan perintah, catatan cepat dari mana saja (Ctrl+Shift+Space), widget mini selalu di atas, riwayat clipboard (opsional), ringkasan pagi, kunci PIN, backup otomatis harian. |

| Kalender | Kalender (mode gelap) |
|---|---|
| ![Kalender](docs/screenshots/kalender.png) | ![Kalender gelap](docs/screenshots/kalender-gelap.png) |

| Catatan dengan coretan pena | Tampilan mingguan |
|---|---|
| ![Catatan](docs/screenshots/catatan.png) | ![Kalender mingguan](docs/screenshots/kalender-minggu.png) |

| Keuangan bulanan | Rekap tahunan |
|---|---|
| ![Keuangan bulanan](docs/screenshots/keuangan-bulanan.png) | ![Rekap tahunan](docs/screenshots/keuangan-rekap.png) |

| Total Wealth | Total Wealth (mode gelap) |
|---|---|
| ![Total Wealth](docs/screenshots/total-wealth.png) | ![Total Wealth gelap](docs/screenshots/total-wealth-gelap.png) |

| Market | Fokus & Tugas |
|---|---|
| ![Market](docs/screenshots/market.png) | ![Fokus](docs/screenshots/fokus.png) |

| Beranda (mode gelap) | Cari & perintah (Ctrl+K) |
|---|---|
| ![Beranda gelap](docs/screenshots/beranda-gelap.png) | ![Cari](docs/screenshots/cari-gelap.png) |

| Sticky note (selalu di atas) | Sticky note (mode gelap) |
|---|---|
| ![Sticky note](docs/screenshots/sticky.png) | ![Sticky note gelap](docs/screenshots/sticky-gelap.png) |

| Panduan (F1) | Tur singkat |
|---|---|
| ![Panduan](docs/screenshots/panduan.png) | ![Tur](docs/screenshots/tur.png) |

| Proyek | |
|---|---|
| ![Proyek](docs/screenshots/proyek.png) | |

| English: Beranda | English: Keuangan |
|---|---|
| ![English Beranda](docs/screenshots/english-beranda.png) | ![English Keuangan](docs/screenshots/english-keuangan.png) |

| Catatan cepat | Widget mini |
|---|---|
| ![Catatan cepat](docs/screenshots/catatan-cepat.png) | ![Widget](docs/screenshots/widget.png) |

Semua angka, acara, dan catatan di screenshot adalah data contoh.

## Teknologi

Electron 45 · React 19 · Vite · SQLite (sql.js, WASM) · FullCalendar · TipTap · perfect-freehand · Lightweight Charts · Recharts · ExcelJS · fast-xml-parser · electron-builder (NSIS)

Sumber data online: Open-Meteo (cuaca), Open-Meteo Geocoding dan Nominatim (lokasi), Yahoo Finance (market), RSS media Indonesia (berita), kalender publik Google (libur nasional).

---

## Instalasi

1. Unduh `Dani-SuperApp-Setup-<versi>.exe` dari halaman [Releases](https://github.com/fakhruladani/Dani-SuperApp/releases), atau build sendiri (lihat bagian Pengembangan).
2. Jalankan installer. Installer belum ditandatangani, jadi Windows SmartScreen bisa menampilkan "Windows protected your PC". Klik **More info**, lalu **Run anyway**.
3. Aplikasi otomatis berjalan saat Windows menyala dan langsung tersembunyi di tray (ikon "D" di pojok kanan bawah). Bisa dimatikan di Pengaturan.

Agar notifikasi muncul:

- Pengaturan Windows → Sistem → Notifikasi: izinkan **Dani SuperApp**.
- Matikan Focus Assist atau "Jangan Ganggu" bila ingin notifikasi tetap tampil.
- Notifikasi hanya andal dari versi yang diinstal, bukan dari `npm run dev`.

### Update aplikasi

Mulai v0.6.0 aplikasi memperbarui dirinya sendiri: setiap beberapa jam ia mengecek rilis terbaru di GitHub, mengunduhnya di latar belakang, lalu muncul tombol **Pasang & mulai ulang** di Pengaturan → Umum dan di menu tray. Bisa juga cek manual dari tombol **Cek sekarang**, atau matikan pengecekan otomatis.

Cara manual tetap bisa: jalankan installer versi baru langsung, tanpa uninstall. Data tetap ada karena disimpan di `%APPDATA%\Dani SuperApp`, terpisah dari folder program. Setiap kali versi berganti, aplikasi membuat backup otomatis bernama `...-sebelum-v<versi>.dsabak`.

---

## Pengembangan

### Prasyarat

| Perangkat | Versi | Cek |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 LTS (minimal 20) | `node -v` |
| npm | ikut Node.js | `npm -v` |
| [Git](https://git-scm.com) | apa saja | `git --version` |

### Ambil kode dan jalankan

```bash
git clone https://github.com/fakhruladani/Dani-SuperApp.git
cd Dani-SuperApp
npm install
npm run dev
```

### Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Vite dan Electron dengan hot reload |
| `npm start` | Build UI lalu jalankan Electron |
| `npm test` | Unit test backend (pengulangan acara, database, enkripsi, rekap, import/export, Total Wealth, ekspor Markdown) |
| `npm run dist` | Build installer Windows ke folder `release/` (tanpa publish) |

### Merilis versi baru

1. Naikkan `version` di `package.json`, commit.
2. Buat dan push tag yang sama, misalnya `git tag v0.6.1 && git push origin main --tags`.
3. Workflow `.github/workflows/release.yml` membangun installer di Windows lalu menerbitkannya ke GitHub Releases beserta `latest.yml`. Aplikasi yang terpasang akan menemukannya sendiri.

## Struktur proyek

```
electron/   main.js (jendela, tray, IPC), db.js (SQLite terenkripsi), scheduler.js (pengingat, ringkasan, alert, backup),
            services.js (cuaca, lokasi, market, RSS, libur), io.js (Excel, CSV, ICS), updater.js (update otomatis), preload.cjs
shared/     recur.js (tanggal, pengulangan, parser tugas), wealth.js (perhitungan Total Wealth), weather.js,
            md.js (catatan ke Markdown), i18n.js + lang-en.js (terjemahan: teks Indonesia jadi kunci, kamus English)
src/        UI React: App.jsx, pages/*, components/*, lib/*
test/       unit test (node:test)
docs/       screenshots
assets/     ikon aplikasi dan tray
.github/    workflow rilis (build installer di Windows, terbitkan ke GitHub Releases)
```

## Keamanan & privasi data

- Data disimpan di `%APPDATA%\Dani SuperApp\data.db.enc`, berupa database SQLite yang dienkripsi AES-256-GCM.
- Kunci enkripsi dibungkus Windows DPAPI (terikat akun Windows), sehingga pengingat tetap jalan tanpa harus memasukkan PIN.
- PIN hanya mengunci tampilan: saat aplikasi dibuka, saat Windows dikunci, dan setelah tidak aktif.
- **Kunci pemulihan** (Pengaturan → Keamanan) dibutuhkan untuk memulihkan backup di laptop atau akun Windows lain. Simpan di tempat aman.
- Backup otomatis harian ke `Documents\Dani SuperApp\Backup` (bisa diarahkan ke folder cloud). Menyimpan 14 file terakhir.
- Renderer berjalan dengan `contextIsolation`, `sandbox`, tanpa `nodeIntegration`, dan dengan CSP ketat. Akses database lewat IPC yang memvalidasi nama tabel dan kolom.
- Riwayat clipboard mati secara default. Matikan saat menyalin kata sandi.

## Batasan

| Hal | Keterangan |
|---|---|
| Data market | Endpoint publik Yahoo Finance tidak resmi dan tertunda sekitar 10 sampai 15 menit. Bisa berubah sewaktu-waktu. Semua akses ada di `electron/services.js`. |
| Lokasi | Mencoba lokasi Windows, lalu perkiraan dari IP yang bisa meleset ke kota lain. Mencari kecamatan secara manual paling akurat. |
| Libur nasional | Dari kalender publik Google. Tanggal cuti bersama bisa tentatif. |
| Ukuran | Installer sekitar 130 MB dan aplikasi memakai RAM ratusan MB saat jendela terbuka (Electron). |
| Tanda tangan | Installer belum ditandatangani, jadi muncul peringatan SmartScreen saat instal manual. Update otomatis tidak memeriksa tanda tangan. |
| Gambar di catatan | Disimpan di database terenkripsi (dikompres WebP, lebar maks. 1600 px). Ratusan gambar besar membuat database dan backup ikut membesar. |

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Notifikasi tidak muncul | Cek izin notifikasi Windows dan Focus Assist. Coba tombol **Kirim tes** di Pengaturan → Pengingat & fokus. |
| Cuaca menunjukkan kota lain | Pengaturan → Umum → Lokasi, cari kecamatanmu secara manual. |
| Backup tidak bisa dipulihkan di laptop lain | Masukkan kunci pemulihan dari laptop asal. |
| Market atau berita tidak muncul | Periksa koneksi internet. Aplikasi menampilkan data terakhir saat offline. |

## Lisensi

Dirilis di bawah [Lisensi MIT](LICENSE). Kode boleh dipakai, diubah, dan dibagikan ulang, asalkan pemberitahuan hak cipta tetap dicantumkan.
