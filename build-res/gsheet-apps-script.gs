/**
 * D'Super App: jembatan Google Sheets (Apps Script).
 *
 * Sheet tetap privat. Skrip ini hanya menjawab permintaan yang membawa kunci rahasia, lalu
 * mengirim isi sheet sebagai JSON ke D'Super App. Skrip juga memberi setiap baris sebuah ID tetap
 * (kolom "ID") supaya aplikasi tidak pernah mengimpor baris yang sama dua kali, juga setelah
 * baris itu dikoreksi.
 *
 * Pasang (sekali). Kalau sheet dibuat dari template D'Super App, skrip ini sudah ada: mulai dari langkah 2.
 * 1. Buka sheet-nya, menu Extensions -> Apps Script. Hapus isi Code.gs, tempel seluruh kode ini, Simpan.
 *    Muat ulang sheet: muncul menu "D'Super App".
 * 2. Di Apps Script: Deploy -> New deployment -> ikon roda -> Web app.
 *    Execute as: Me. Who has access: Anyone. Klik Deploy, izinkan akses, salin "Web app URL".
 * 3. Di sheet: menu D'Super App -> Hubungkan ke aplikasi. Tempel Web app URL, klik Buat kode.
 * 4. Di D'Super App: Pengaturan -> Google Sheets -> tempel kode koneksi (atau scan QR-nya dari HP).
 *
 * "Anyone" di langkah 2 artinya siapa pun boleh memanggil URL ini, tapi tanpa kunci yang benar
 * jawabannya hanya {"error":"forbidden"}. Isi sheet tidak pernah terbuka untuk umum.
 * Ganti kunci: menu D'Super App -> Buat kunci baru, lalu hubungkan ulang aplikasi.
 */

const SHEET_NAME = ''; // kosong = sheet (tab) pertama

function onOpen() {
  SpreadsheetApp.getUi().createMenu("D'Super App")
    .addItem('Hubungkan ke aplikasi', 'showConnect')
    .addItem('Buat kunci baru', 'resetKeyMenu')
    .addToUi();
}

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

function resetKeyMenu() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Buat kunci baru?', 'Aplikasi yang sudah terhubung tidak bisa membaca sheet ini lagi sampai kamu menempel kode koneksi yang baru.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  resetKey();
  showConnect();
}

/** Dialog: Web app URL + key -> one connection code (and a QR code for the phone). */
function showConnect() {
  setup();
  const props = PropertiesService.getScriptProperties();
  let url = props.getProperty('DSA_URL') || '';
  if (!url) {
    try { const u = ScriptApp.getService().getUrl(); if (/\/exec$/.test(u || '')) url = u; } catch (e) { /* not deployed yet */ }
  }
  const editor = 'https://script.google.com/d/' + ScriptApp.getScriptId() + '/edit';
  const html = HtmlService.createHtmlOutput(CONNECT_HTML.replace('%URL%', esc_(url)).replace('%EDITOR%', esc_(editor)))
    .setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, "Hubungkan ke D'Super App");
}

/** Called from the dialog. Returns the connection code, or throws a readable message. */
function makeCode(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec$/.test(url)) {
    throw new Error('Itu bukan Web app URL. Salin dari Deploy -> Manage deployments, URL-nya berakhiran /exec.');
  }
  PropertiesService.getScriptProperties().setProperty('DSA_URL', url);
  const json = JSON.stringify({ u: url, k: setup() });
  return 'dsa-gs:' + Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8).replace(/=+$/, '');
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

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const CONNECT_HTML = `<!doctype html>
<html><head><base target="_top">
<style>
  body { font: 14px/1.5 Arial, sans-serif; color: #202124; margin: 0; }
  ol { padding-left: 18px; margin: 0 0 12px; }
  li { margin-bottom: 6px; }
  input, textarea { width: 100%; box-sizing: border-box; font: 13px monospace; padding: 8px; border: 1px solid #c4c7c5; border-radius: 6px; }
  button { background: #1a73e8; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-weight: bold; cursor: pointer; margin-top: 8px; }
  button.ghost { background: #e8f0fe; color: #1a73e8; }
  .err { color: #c5221f; margin-top: 6px; }
  .mut { color: #5f6368; font-size: 12px; }
  #qr { display: flex; justify-content: center; margin: 12px 0 4px; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head><body>
<div id="step1">
  <ol>
    <li>Belum deploy? <a href="%EDITOR%" target="_blank">Buka Apps Script</a> &rarr; <b>Deploy</b> &rarr; <b>New deployment</b> &rarr; ikon roda &rarr; <b>Web app</b>. Execute as: <b>Me</b>, Who has access: <b>Anyone</b>. Klik Deploy dan izinkan akses.</li>
    <li>Salin <b>Web app URL</b> (berakhiran <code>/exec</code>) dan tempel di sini:</li>
  </ol>
  <input id="url" placeholder="https://script.google.com/macros/s/.../exec" value="%URL%">
  <button id="go">Buat kode koneksi</button>
  <div id="err" class="err"></div>
</div>
<div id="step2" style="display:none">
  <p style="margin-top:0">Di D'Super App: <b>Pengaturan &rarr; Google Sheets</b>, lalu tempel kode ini. Di HP bisa juga scan QR-nya.</p>
  <textarea id="code" rows="4" readonly></textarea>
  <button id="copy">Salin kode</button> <button class="ghost" id="back">Ganti URL</button>
  <div id="qr"></div>
  <p class="mut">Kode ini berisi kunci rahasia sheet-mu. Jangan dibagikan. Bocor? Menu D'Super App &rarr; Buat kunci baru.</p>
</div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  $('go').onclick = function () {
    $('err').textContent = ''; $('go').disabled = true;
    google.script.run
      .withSuccessHandler(function (code) {
        $('go').disabled = false; $('code').value = code;
        $('step1').style.display = 'none'; $('step2').style.display = '';
        $('qr').innerHTML = '';
        try { new QRCode($('qr'), { text: code, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { $('qr').textContent = ''; }
      })
      .withFailureHandler(function (e) { $('go').disabled = false; $('err').textContent = e.message || String(e); })
      .makeCode($('url').value);
  };
  $('copy').onclick = function () { $('code').select(); document.execCommand('copy'); $('copy').textContent = 'Tersalin'; };
  $('back').onclick = function () { $('step2').style.display = 'none'; $('step1').style.display = ''; };
</script>
</body></html>`;
