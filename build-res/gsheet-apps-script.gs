/**
 * D'Super App: jembatan Google Sheets (Apps Script).
 *
 * Sheet tetap privat. Skrip ini hanya menjawab permintaan yang membawa kunci rahasia, lalu
 * mengirim isi sheet sebagai JSON ke D'Super App. Skrip juga memberi setiap baris sebuah ID tetap
 * (kolom "ID") supaya aplikasi tidak pernah mengimpor baris yang sama dua kali, juga setelah
 * baris itu dikoreksi.
 *
 * Pasang (sekali):
 * 1. Buka sheet-nya, menu Extensions -> Apps Script. Hapus isi Code.gs, tempel seluruh kode ini, Simpan.
 * 2. Pilih fungsi "setup" di toolbar, klik Run, izinkan akses. Kunci rahasia muncul di Execution log.
 * 3. Deploy -> New deployment -> ikon roda -> Web app.
 *    Execute as: Me. Who has access: Anyone. Klik Deploy, salin "Web app URL".
 * 4. Di D'Super App: Pengaturan -> Google Sheets. Tempel URL dan kunci, klik Tes, lalu Simpan.
 *
 * "Anyone" di langkah 3 artinya siapa pun boleh memanggil URL ini, tapi tanpa kunci yang benar
 * jawabannya hanya {"error":"forbidden"}. Isi sheet tidak pernah terbuka untuk umum.
 * Ganti kunci: jalankan "resetKey", lalu tempel kunci baru di aplikasi.
 */

const SHEET_NAME = ''; // kosong = sheet (tab) pertama

function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('DSA_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('DSA_KEY', key);
  }
  Logger.log("Kunci D'Super App: " + key);
  return key;
}

function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('DSA_KEY');
  return setup();
}

function doGet(e) {
  const key = PropertiesService.getScriptProperties().getProperty('DSA_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ error: 'forbidden' });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    if (!sh) return json_({ error: 'sheet not found' });
    const tz = ss.getSpreadsheetTimeZone();
    const values = sh.getDataRange().getValues();
    if (!values.length) return json_({ v: 1, sheet: sh.getName(), tz: tz, header: [], rows: [] });
    const header = values[0].map(String);
    let idCol = header.findIndex(function (h) { return h.trim().toLowerCase() === 'id'; });
    if (idCol < 0) {
      idCol = header.length;
      sh.getRange(1, idCol + 1).setValue('ID');
      header.push('ID');
    }
    const rows = values.slice(1).map(function (r) {
      return r.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss') : v; });
    });
    // every filled row gets a permanent ID once; existing IDs are never changed
    let changed = false;
    rows.forEach(function (r) {
      while (r.length <= idCol) r.push('');
      const filled = r.some(function (v, j) { return j !== idCol && String(v).trim() !== ''; });
      if (filled && !String(r[idCol]).trim()) { r[idCol] = 'R' + Utilities.getUuid().slice(0, 8); changed = true; }
    });
    if (changed && rows.length) sh.getRange(2, idCol + 1, rows.length, 1).setValues(rows.map(function (r) { return [r[idCol]]; }));
    return json_({ v: 1, sheet: sh.getName(), tz: tz, header: header, rows: rows });
  } finally {
    lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
