/**
 * Book Check — Apps Script API (bound to the Google Sheet)
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone   (security is done by verifying the Google sign-in token below)
 */

const CONFIG = {
  CLIENT_ID: '50487504605-rg8pk326ajj8d8j5lckfihn5n9gbevq4.apps.googleusercontent.com',
  DOMAIN: 'sjps.edu.hk',
  BOOKS_SHEET: 'Books',
  LOG_SHEET: 'ScanLog',
  TIMEZONE: 'Asia/Hong_Kong',
};

const COL = { ID: 'BookID', NAME: 'Book Name', YEAR: 'Year Purchased', CLASS: 'Class', COND: 'Condition', REMARKS: 'Remarks' };
const BASE_HEADERS = [COL.ID, COL.NAME, COL.YEAR, COL.CLASS, COL.COND, COL.REMARKS];

/* ---------- One-time setup: run this once from the editor ---------- */

function setupSheet() {
  const ss = SpreadsheetApp.getActive();
  let books = ss.getSheetByName(CONFIG.BOOKS_SHEET);
  if (!books) books = ss.insertSheet(CONFIG.BOOKS_SHEET);
  if (books.getLastRow() === 0) {
    const year = schoolYear_();
    books.getRange(1, 1, 1, BASE_HEADERS.length + 1).setValues([[...BASE_HEADERS, year]]);
    books.getRange(2, 1, 3, 5).setValues([
      ['5a260001', 'Sample Book One', 2026, '5A', 'Good'],
      ['5a260002', 'Sample Book Two', 2026, '5A', 'Good'],
      ['5b260001', 'Sample Book Three', 2026, '5B', 'Fair'],
    ]);
  }
  books.setFrozenRows(1);
  books.getRange(1, 1, 1, books.getLastColumn()).setFontWeight('bold').setBackground('#eef2ec');
  books.getRange('A:A').setNumberFormat('@'); // keep IDs as plain text
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Good', 'Fair', 'Damaged', 'Lost'], true).setAllowInvalid(false).build();
  books.getRange(2, 5, books.getMaxRows() - 1, 1).setDataValidation(rule);

  let log = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(CONFIG.LOG_SHEET);
    log.appendRow(['Timestamp', 'BookID', 'Scanned in class', 'Teacher', 'Result']);
    log.setFrozenRows(1);
    log.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#eef2ec');
  }
}

/* ---------- Sheet menu: Add book ---------- */

const LABELS_URL = 'https://ewong1237.github.io/school-tools/book-check/labels.html';
const CLASS_LETTERS = ['a', 'b', 'c', 'd', 'e'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Book Check')
    .addItem('Add book…', 'showAddBook')
    .addToUi();
}

function showAddBook() {
  const t = HtmlService.createTemplateFromFile('AddBook');
  t.thisYear = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy'));
  t.letters = CLASS_LETTERS;
  t.labelsUrl = LABELS_URL;
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Add book'));
}

// Next 4-digit number for a level + purchase year, e.g. level 5, year 2026 -> 2 if 5x260001 exists.
function nextNumber_(level, year) {
  const yy = String(year).slice(-2);
  const re = new RegExp('^' + level + '[a-z]' + yy + '(\\d{4})$');
  const d = readBooks_();
  let max = 0;
  d.values.slice(1).forEach(r => {
    const m = norm_(r[d.idx[COL.ID]]).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max + 1;
}

function makeIds_(level, year, letters, num) {
  const yy = String(year).slice(-2), n = String(num).padStart(4, '0');
  return letters.map(l => level + l + yy + n);
}

function previewIds(level, year, letters) {
  if (!letters || !letters.length) return [];
  return makeIds_(level, year, letters, nextNumber_(level, year));
}

function addBook(form) {
  const name = String(form.name || '').trim();
  const level = String(form.level);
  const year = Number(form.year);
  const letters = (form.letters || []).filter(l => CLASS_LETTERS.indexOf(l) >= 0);
  if (!name) throw new Error('Please enter the book name.');
  if (!/^[1-6]$/.test(level)) throw new Error('Please choose a level.');
  if (!(year >= 2000 && year <= 2099)) throw new Error('Please check the year.');
  if (!letters.length) throw new Error('Please choose at least one class.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ids = makeIds_(level, year, letters, nextNumber_(level, year));
    const d = readBooks_();
    const width = d.values[0].length;
    const rows = ids.map((id, i) => {
      const row = new Array(width).fill('');
      row[d.idx[COL.ID]] = id;
      if (d.idx[COL.NAME] >= 0) row[d.idx[COL.NAME]] = name;
      if (d.idx[COL.YEAR] >= 0) row[d.idx[COL.YEAR]] = year;
      row[d.idx[COL.CLASS]] = (level + letters[i]).toUpperCase();
      if (d.idx[COL.COND] >= 0) row[d.idx[COL.COND]] = form.condition || 'Good';
      return row;
    });
    const start = d.sh.getLastRow() + 1;
    d.sh.getRange(start, 1, rows.length, width).setValues(rows);
    return ids;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Web API ---------- */

function doGet() {
  return json_({ ok: true, service: 'Book Check API' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const email = verifyToken_(req.token);
    switch (req.action) {
      case 'init':  return json_(Object.assign({ ok: true, email }, initData_()));
      case 'sync':  return json_(Object.assign({ ok: true }, sync_(req.scans || [], email)));
      case 'books': return json_({ ok: true, books: listBooks_() });
      default:        return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, auth: err.auth === false ? false : undefined, error: String(err.message || err) });
  }
}

/* ---------- Auth: verify Google ID token ---------- */

function verifyToken_(token) {
  if (!token) throw authError_('Please sign in.');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const cached = cache.get(key);
  if (cached) return cached;

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('Sign-in expired. Please sign in again.');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.CLIENT_ID) throw authError_('Invalid sign-in.');
  if (info.hd !== CONFIG.DOMAIN || String(info.email_verified) !== 'true')
    throw authError_('Please use your @' + CONFIG.DOMAIN + ' account.');
  const secondsLeft = Number(info.exp) - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) throw authError_('Sign-in expired. Please sign in again.');
  cache.put(key, info.email, Math.min(secondsLeft, 1800));
  return info.email;
}

function authError_(msg) { const e = new Error(msg); e.auth = false; return e; }

/* ---------- Data ---------- */

function schoolYear_(d) {
  d = d || new Date();
  const y = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy'));
  const m = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'M'));
  const start = m >= 9 ? y : y - 1;
  return start + '-' + String(start + 1).slice(-2);
}

const norm_ = v => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');

function readBooks_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.BOOKS_SHEET);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idx = {};
  BASE_HEADERS.forEach(h => { idx[h] = headers.indexOf(h); });
  if (idx[COL.ID] < 0 || idx[COL.CLASS] < 0) throw new Error('Books sheet needs "BookID" and "Class" columns.');
  const year = schoolYear_();
  let yearCol = headers.indexOf(year);
  return { sh, values, idx, year, yearCol };
}

function ensureYearCol_(data) {
  if (data.yearCol >= 0) return data.yearCol;
  const col = data.sh.getLastColumn() + 1;
  data.sh.getRange(1, col).setValue(data.year).setFontWeight('bold').setBackground('#eef2ec');
  data.yearCol = col - 1;
  return data.yearCol;
}

function listBooks_() {
  const d = readBooks_();
  return d.values.slice(1).filter(r => norm_(r[d.idx[COL.ID]])).map(r => ({
    id: norm_(r[d.idx[COL.ID]]),
    name: d.idx[COL.NAME] >= 0 ? String(r[d.idx[COL.NAME]]) : '',
    cls: String(r[d.idx[COL.CLASS]]).trim().toUpperCase(),
    year: d.idx[COL.YEAR] >= 0 ? String(r[d.idx[COL.YEAR]]) : '',
    condition: d.idx[COL.COND] >= 0 ? String(r[d.idx[COL.COND]]) : '',
  }));
}

const isFound_ = (r, yc) => yc >= 0 && r[yc] !== '' && r[yc] != null;

// Everything the scan page needs, in one read.
function initData_() {
  const d = readBooks_();
  const books = [], classes = {};
  d.values.slice(1).forEach(r => {
    const id = norm_(r[d.idx[COL.ID]]);
    if (!id) return;
    const cls = String(r[d.idx[COL.CLASS]]).trim().toUpperCase();
    if (cls) classes[cls] = true;
    books.push({
      id, cls,
      name: d.idx[COL.NAME] >= 0 ? String(r[d.idx[COL.NAME]]) : '',
      lost: d.idx[COL.COND] >= 0 && r[d.idx[COL.COND]] === 'Lost',
      found: isFound_(r, d.yearCol),
    });
  });
  return { year: d.year, classes: Object.keys(classes).sort(), books };
}

// Save a batch of scans: [{ id, cls, t }]. Safe to send twice: already-found books are left alone.
function sync_(scans, email) {
  scans = scans.slice(0, 500);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = readBooks_();
    const rowOf = {};
    d.values.forEach((r, i) => { if (i > 0) rowOf[norm_(r[d.idx[COL.ID]])] = i; });
    const now = Date.now(), log = [], results = [];
    let yc = d.yearCol;

    scans.forEach(sc => {
      const id = norm_(sc.id), cls = String(sc.cls || '').toUpperCase();
      let t = Number(sc.t);
      if (!(t > now - 30 * 864e5 && t < now + 5 * 6e4)) t = now; // ignore odd phone clocks
      const when = new Date(t);
      const i = rowOf[id];
      let result;
      if (!id || i == null) {
        result = 'unknown';
      } else {
        const r = d.values[i];
        if (yc < 0 && norm_(r[d.idx[COL.CLASS]]) === norm_(cls)) yc = ensureYearCol_(d);
        if (norm_(r[d.idx[COL.CLASS]]) !== norm_(cls)) {
          result = 'other_class';            // wrong class: not recorded
        } else if (isFound_(r, yc)) {
          result = 'duplicate';
        } else {
          d.sh.getRange(i + 1, yc + 1).setValue(when).setNumberFormat('dd/mm hh:mm');
          r[yc] = when;
          result = 'ok';
        }
      }
      results.push({ id, result });
      log.push([when, id, cls, email, result]);
    });

    if (log.length) {
      const lg = SpreadsheetApp.getActive().getSheetByName(CONFIG.LOG_SHEET);
      lg.getRange(lg.getLastRow() + 1, 1, log.length, 5).setValues(log);
    }
    const foundIds = d.values.slice(1).filter(r => isFound_(r, yc)).map(r => norm_(r[d.idx[COL.ID]]));
    return { results, foundIds };
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
