# D'Super App

**D'Super App adalah ruang kerja pribadi untuk Windows dan Android.** Kalender dengan pengingat, catatan yang bisa dicoret pakai pena, buku keuangan bergaya spreadsheet, total kekayaan, market dan berita, cuaca, serta fokus dan tugas, semuanya dalam satu aplikasi. Data disimpan di perangkat sendiri dan dienkripsi. HP dan laptop menyamakan datanya langsung lewat Wi-Fi yang sama, tanpa cloud.

Tersedia dalam Bahasa Indonesia dan English (ganti di Pengaturan → Umum → Bahasa / Language). Mata uang Rupiah (`Rp1.250.000`), zona waktu mengikuti perangkat. Mode terang, gelap, atau ikuti sistem.

![Beranda](docs/screenshots/beranda.png)

## Fitur

| | |
|---|---|
| **Beranda** | Sapaan, jam real-time, cuaca dan lokasi (per jam dan 6 hari), agenda 7 hari, ringkasan hari ini, tugas, kebiasaan, keuangan bulan ini, pasar, berita terbaru, catatan terbaru. |
| **Kalender** | Tampilan Hari, Minggu, Bulan, dan Agenda seperti Google Calendar. Tampilan Bulan bisa digulir ke atas dan ke bawah, judul bulan di atas ikut berubah. Garis "sekarang" bergerak mengikuti jam sistem, hari ini berganti otomatis saat tengah malam dan setelah laptop bangun dari sleep. Acara berulang (harian, mingguan, bulanan, tahunan), warna per kalender, drag and drop, deskripsi per tanggal, libur nasional Indonesia, impor dan ekspor `.ics`. |
| **Pengingat** | Notifikasi Windows dari "saat dimulai" sampai "1 minggu sebelum". Pengingat yang lewat saat laptop mati muncul begitu laptop menyala (maksimal 3 hari ke belakang). Di Android, pengingat 14 hari ke depan dijadwalkan sebagai notifikasi sistem, jadi tetap muncul walau aplikasi ditutup. Tombol Tunda 10 menit, Lihat, dan Selesai. |
| **Catatan** | Banyak catatan dengan tag, sematkan, pencarian, dan template. Font, ukuran, judul, tebal, miring, garis bawah, coret, warna teks, stabilo, checklist, perataan, tautan. **Mode pena** untuk mencoret bebas (mendukung tekanan pen tablet), stabilo bebas, penghapus. Zoom 50% sampai 200%. Simpan otomatis. **Gambar**: tempel screenshot (Ctrl+V), seret file, atau tombol gambar; dikecilkan otomatis dan ikut terenkripsi. **Ekspor** ke PDF (dengan gambar dan coretan pena), Word .docx (dengan gambar), teks .txt (tulisan saja), atau Markdown (gambar di folder terpisah). Kolom tag menyarankan tag yang sudah ada saat mengetik. **Jendela mengambang**: catatan bisa dilepas jadi sticky note di desktop, dengan 7 pilihan warna, opsi selalu di atas, dan tetap tersinkron dengan aplikasi. |
| **Proyek** | Tugas dikelompokkan per tag (misalnya `#kerja`) dengan progres, jumlah tugas terlambat, tenggat proyek, dan hitung mundur H-n. Cukup beri tag pada tugas, proyek muncul sendiri. Nama, warna, catatan, dan arsip bisa diatur. |
| **Keuangan** | Tab bulanan Jan sampai Des seperti workbook Excel, ganti tahun, isi langsung di sel. Kategori masuk dan keluar, anggaran default per kategori plus anggaran khusus per bulan. |
| **Rekap tahunan** | Grafik arus kas dan saldo kumulatif, perbandingan dengan tahun lalu, tingkat tabungan, tabel per bulan, komposisi per kategori, matriks kategori × bulan. |
| **Total Wealth** | Lembar kekayaan seperti spreadsheet: satu kolom per akun (bank, e-wallet, cash, saham, reksa dana), satu baris per tanggal, kolom Total dan Perubahan dihitung otomatis. Grafik perkembangan dengan sumbu waktu sesuai tanggal pencatatan (rentang 3 bulan sampai semua, total atau per akun). Impor dengan menempel tabel dari Google Sheets/Excel atau file CSV. Utang ditulis negatif. |
| **Ekspor** | Excel satu tahun (rekap, per kategori, 12 sheet bulan, Total Wealth), CSV, dan impor CSV. |
| **Market & Berita** | Watchlist IHSG, LQ45, USD/IDR, emas, saham bank, S&P 500, Bitcoin, dan simbol apa pun dari Yahoo Finance. Grafik candle atau garis dengan volume dan MA 20/50. Alert harga lewat notifikasi. Berita dari RSS media Indonesia, bisa ditambah sendiri, dan disimpan untuk dibaca nanti. |
| **Fokus & Tugas** | Pomodoro dengan mode jangan ganggu, tugas dengan input bahasa alami (`kirim laporan besok 09.00 #kerja !tinggi`), kebiasaan mingguan dengan streak, statistik fokus 7 hari. |
| **Panduan & tur** | Menu Panduan (F1) berisi semua fitur, letaknya, cara memakainya, dan pintasan keyboard, lengkap dengan pencarian. Tur singkat menyorot tiap bagian aplikasi dan muncul otomatis saat pertama kali dibuka. |
| **Input cepat (/)** | Tombol bulat di kanan bawah (Ctrl+/). Ketik `/keuangan`, `/tugas`, `/acara`, `/catatan`, `/wealth`, atau `/kebiasaan`; asisten bertanya langkah demi langkah dengan tombol pilihan, menampilkan ringkasan, lalu menyimpan. Bukan AI, polanya tetap. |
| **Menu klik kanan** | Aksi cepat sesuai tempatnya: catatan (sematkan, duplikat, ekspor, hapus), isi catatan (format, gambar), acara dan tanggal kalender, tugas (tenggat, prioritas, buka proyek), kartu proyek, transaksi, Total Wealth, saham, berita, clipboard, dan potong/salin/tempel di semua kolom teks. |
| **Panel bisa digeser** | Lebar menu kiri, daftar catatan, panel kalender, anggaran, alert market, ringkasan Total Wealth, daftar proyek, dan daftar isi panduan bisa digeser kiri-kanan. Klik dua kali garisnya untuk ukuran awal. Ukuran diingat. |
| **Update otomatis** | Aplikasi mengecek GitHub Releases, mengunduh versi baru di latar belakang, lalu menawarkan "Pasang & mulai ulang" dari Pengaturan atau menu tray. |
| **Dua bahasa** | Indonesia dan English untuk seluruh tampilan, panduan, tur, notifikasi, menu tray, dan ekspor Excel. Data yang kamu tulis sendiri tidak ikut diterjemahkan. |
| **Android** | Aplikasi yang sama untuk HP (APK di halaman Releases): menu di bawah layar, catatan dengan pena jari atau stylus, semua fitur keuangan, kalender, market, fokus, dan proyek. Pengingat dijadwalkan sebagai notifikasi Android, jadi tetap muncul walau aplikasi ditutup. Ekspor catatan ke Word atau teks lewat menu bagikan. |
| **Sinkron HP dan laptop** | Hubungkan sekali dengan scan kode QR. Setelah itu HP menyamakan data dengan laptop saat dibuka, tiap menit selama terbuka, dan sesaat setelah ada perubahan, selama keduanya di Wi-Fi atau hotspot yang sama. Langsung antar perangkat, terenkripsi AES-256-GCM, tanpa server atau cloud. Gambar catatan ikut. |
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

| Proyek | Menu klik kanan |
|---|---|
| ![Proyek](docs/screenshots/proyek.png) | ![Menu klik kanan](docs/screenshots/klik-kanan.png) |

| English: Beranda | English: Keuangan |
|---|---|
| ![English Beranda](docs/screenshots/english-beranda.png) | ![English Keuangan](docs/screenshots/english-keuangan.png) |

| Catatan cepat | Widget mini |
|---|---|
| ![Catatan cepat](docs/screenshots/catatan-cepat.png) | ![Widget](docs/screenshots/widget.png) |

| Android: Beranda | Android: Catatan | Android: Keuangan | Android: Sinkron |
|---|---|---|---|
| ![Android Beranda](docs/screenshots/android-beranda.png) | ![Android Catatan](docs/screenshots/android-catatan.png) | ![Android Keuangan](docs/screenshots/android-keuangan.png) | ![Android Sinkron](docs/screenshots/android-sinkron.png) |

Semua angka, acara, dan catatan di screenshot adalah data contoh.

## Teknologi

Electron 45 · Capacitor 8 (Android) · React 19 · Vite · SQLite (sql.js, WASM) · FullCalendar · TipTap · perfect-freehand · Lightweight Charts · Recharts · ExcelJS · fast-xml-parser · electron-builder (NSIS)

Sumber data online: Open-Meteo (cuaca), Open-Meteo Geocoding dan Nominatim (lokasi), Yahoo Finance (market), RSS media Indonesia (berita), kalender publik Google (libur nasional).

---

## Instalasi

### Windows

1. Unduh `DSuperApp-Setup-<versi>.exe` dari halaman [Releases](https://github.com/fakhruladani/Dani-SuperApp/releases), atau build sendiri (lihat bagian Pengembangan).
2. Jalankan installer. Installer belum ditandatangani, jadi Windows SmartScreen bisa menampilkan "Windows protected your PC". Klik **More info**, lalu **Run anyway**.
3. Aplikasi otomatis berjalan saat Windows menyala dan langsung tersembunyi di tray (ikon "D" di pojok kanan bawah). Bisa dimatikan di Pengaturan.

Agar notifikasi muncul:

- Pengaturan Windows → Sistem → Notifikasi: izinkan **D'Super App**.
- Matikan Focus Assist atau "Jangan Ganggu" bila ingin notifikasi tetap tampil.
- Notifikasi hanya andal dari versi yang diinstal, bukan dari `npm run dev`.

### Android

1. Di HP, buka halaman [Releases](https://github.com/fakhruladani/Dani-SuperApp/releases) dan unduh `DSuperApp-<versi>.apk`.
2. Buka file itu. Android meminta izin **Instal aplikasi tak dikenal** untuk browser: izinkan, lalu Instal. Play Protect bisa memberi peringatan karena aplikasi tidak dari Play Store; pilih tetap instal.
3. Izinkan notifikasi saat diminta. Agar pengingat tepat waktu, matikan optimasi baterai untuk D'Super App (Pengaturan Android → Aplikasi → D'Super App → Baterai → Tidak dibatasi).
4. Hubungkan dengan laptop: di laptop buka Pengaturan → **Sinkron HP** → Tampilkan kode QR. Di HP buka Pengaturan → **Sinkron** → Scan QR laptop. Sinkron pertama mengganti isi awal HP dengan data laptop.

Versi baru untuk HP: Pengaturan → Umum → Cek sekarang, lalu **Unduh APK** dan pasang di atas versi lama. Data tetap ada.

### Update aplikasi (Windows)

Mulai v0.6.0 aplikasi memperbarui dirinya sendiri: setiap beberapa jam ia mengecek rilis terbaru di GitHub, mengunduhnya di latar belakang, lalu muncul tombol **Pasang & mulai ulang** di Pengaturan → Umum dan di menu tray. Bisa juga cek manual dari tombol **Cek sekarang**, atau matikan pengecekan otomatis.

Cara manual tetap bisa: jalankan installer versi baru langsung, tanpa uninstall. Data tetap ada karena disimpan di `%APPDATA%\Dani SuperApp`, terpisah dari folder program. Nama folder data, folder instalasi, dan file program tetap memakai nama lama (`Dani SuperApp`) supaya data pengguna lama tidak hilang. Setiap kali versi berganti, aplikasi membuat backup otomatis bernama `...-sebelum-v<versi>.dsabak`.

---

## Pengembangan

### Prasyarat

| Perangkat | Versi | Cek |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 LTS (minimal 20) | `node -v` |
| npm | ikut Node.js | `npm -v` |
| [Git](https://git-scm.com) | apa saja | `git --version` |
| JDK + Android SDK (hanya untuk build APK) | JDK 21, SDK platform 36 | `java -version` |

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
| `npm test` | Unit test backend (pengulangan acara, database, enkripsi, rekap, import/export, Total Wealth, ekspor Markdown dan teks) |
| `npm run dist` | Build installer Windows ke folder `release/` (tanpa publish) |
| `npm run build:android` | Build UI versi Android ke `dist-android/` lalu salin ke proyek `android/` (Capacitor) |
| `npm run apk` | Build APK release (butuh Android SDK, JDK 21, dan variabel `DSA_KEYSTORE`, `DSA_KEYSTORE_PASSWORD`, `DSA_KEY_ALIAS`, `DSA_KEY_PASSWORD` untuk tanda tangan) |

### Merilis versi baru

1. Naikkan `version` di `package.json`, commit.
2. Buat dan push tag yang sama, misalnya `git tag v1.0.1 && git push origin main --tags`.
3. Workflow `.github/workflows/release.yml` membangun installer di Windows lalu menerbitkannya ke GitHub Releases beserta `latest.yml`. Aplikasi yang terpasang akan menemukannya sendiri.
4. Job kedua membangun APK Android yang ditandatangani dan menempelkannya ke rilis yang sama. Butuh empat secret repository: `ANDROID_KEYSTORE_B64` (file keystore dalam base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Tanpa secret itu job dilewati. Keystore tidak boleh diganti: Android hanya mau memasang update yang ditandatangani dengan kunci yang sama.

## Struktur proyek

```
electron/   main.js (jendela, tray, IPC), common.js (handler yang sama untuk desktop dan Android), db.js (SQLite terenkripsi),
            scheduler.js (pengingat, ringkasan, alert, backup), services.js (cuaca, lokasi, market, RSS, libur),
            io.js (Excel, CSV, ICS), syncServer.js (server sinkron HP), updater.js (update otomatis), preload.cjs
shared/     dbcore.js (logika database dan metadata sinkron), sync.js (protokol sinkron, enkripsi, pairing QR),
            recur.js (tanggal, pengulangan, parser tugas), wealth.js (perhitungan Total Wealth), weather.js,
            md.js (catatan ke Markdown dan teks), i18n.js + lang-en.js (terjemahan: teks Indonesia jadi kunci, kamus English)
src/        UI React: App.jsx, pages/*, components/*, lib/*
src/android backend versi Android di dalam WebView: database, notifikasi terjadwal, HTTP native, file, klien sinkron
android/    proyek Android (Capacitor); ikon dibuat dari assets/icon.png oleh build-res/android-res.py
test/       unit test (node:test)
docs/       screenshots
assets/     ikon aplikasi dan tray
.github/    workflow rilis (build installer Windows dan APK Android, terbitkan ke GitHub Releases)
```

## Keamanan & privasi data

- Data disimpan di `%APPDATA%\Dani SuperApp\data.db.enc`, berupa database SQLite yang dienkripsi AES-256-GCM.
- Kunci enkripsi dibungkus Windows DPAPI (terikat akun Windows), sehingga pengingat tetap jalan tanpa harus memasukkan PIN.
- PIN hanya mengunci tampilan: saat aplikasi dibuka, saat Windows dikunci, dan setelah tidak aktif.
- **Kunci pemulihan** (Pengaturan → Keamanan) dibutuhkan untuk memulihkan backup di laptop atau akun Windows lain. Simpan di tempat aman.
- Backup otomatis harian ke `Documents\Dani SuperApp\Backup` (bisa diarahkan ke folder cloud). Menyimpan 14 file terakhir.
- Renderer berjalan dengan `contextIsolation`, `sandbox`, tanpa `nodeIntegration`, dan dengan CSP ketat. Akses database lewat IPC yang memvalidasi nama tabel dan kolom.
- Riwayat clipboard mati secara default. Matikan saat menyalin kata sandi.
- Di Android, database disimpan di penyimpanan pribadi aplikasi dan dienkripsi AES-256-GCM dengan kunci yang dibuat di HP dan ditandai tidak bisa diekspor (WebCrypto). PIN memakai PBKDF2.
- Sinkron hanya lewat jaringan lokal, port 47613, dan server di laptop hanya berjalan bila sinkron dinyalakan atau kode QR sedang dibuka. Kode QR berisi kunci acak 256-bit yang berlaku 10 menit. Semua pesan dienkripsi dan diautentikasi AES-256-GCM dengan kunci itu, berstempel waktu dan nonce sehingga tidak bisa diputar ulang. Perangkat yang belum dipasangkan tidak mendapat jawaban apa pun. Memutus HP di laptop langsung mencabut aksesnya.

## Batasan

| Hal | Keterangan |
|---|---|
| Data market | Endpoint publik Yahoo Finance tidak resmi dan tertunda sekitar 10 sampai 15 menit. Bisa berubah sewaktu-waktu. Semua akses ada di `electron/services.js`. |
| Lokasi | Sebelum lokasi dipilih, cuaca memakai perkiraan dari alamat IP yang bisa meleset ke kota lain. Tombol Deteksi mencoba lokasi perangkat. Mencari kecamatan secara manual paling akurat. |
| Libur nasional | Dari kalender publik Google. Tanggal cuti bersama bisa tentatif. |
| Ukuran | Installer sekitar 130 MB dan aplikasi memakai RAM ratusan MB saat jendela terbuka (Electron). |
| Tanda tangan | Installer belum ditandatangani, jadi muncul peringatan SmartScreen saat instal manual. Update otomatis tidak memeriksa tanda tangan. |
| Sinkron | HP dan laptop harus di jaringan yang sama (Wi-Fi rumah atau hotspot HP). Wi-Fi kantor, kampus, dan publik sering memblokir koneksi antar perangkat. Untuk item yang diubah di dua perangkat sebelum sinkron, perubahan terakhir yang dipakai (per item, bukan per kolom). |
| Android | APK dipasang manual (bukan Play Store). Ekspor PDF dan Markdown, sticky note, widget, tray, dan riwayat clipboard hanya di desktop. Ringkasan pagi di HP berisi jumlah agenda dan tugas, tanpa cuaca. Belum diuji di semua merek HP; beberapa merek menahan notifikasi bila optimasi baterai aktif. |
| Gambar di catatan | Disimpan di database terenkripsi (dikompres WebP, lebar maks. 1600 px). Ratusan gambar besar membuat database dan backup ikut membesar. |

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Notifikasi tidak muncul | Cek izin notifikasi Windows dan Focus Assist. Coba tombol **Kirim tes** di Pengaturan → Pengingat & fokus. |
| Cuaca menunjukkan kota lain | Pengaturan → Umum → Lokasi, cari kecamatanmu secara manual. |
| Backup tidak bisa dipulihkan di laptop lain | Masukkan kunci pemulihan dari laptop asal. |
| HP tidak menemukan laptop | Pastikan satu Wi-Fi, sinkron di laptop menyala, dan Windows Firewall mengizinkan D'Super App di jaringan Private. Ubah profil Wi-Fi ke Private bila masih Public. Coba hotspot HP. |
| Notifikasi di HP terlambat | Matikan optimasi baterai untuk D'Super App dan izinkan notifikasi. |
| Market atau berita tidak muncul | Periksa koneksi internet. Aplikasi menampilkan data terakhir saat offline. |

## Lisensi

Dirilis di bawah [Lisensi MIT](LICENSE). Kode boleh dipakai, diubah, dan dibagikan ulang, asalkan pemberitahuan hak cipta tetap dicantumkan.
