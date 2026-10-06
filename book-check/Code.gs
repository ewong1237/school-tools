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

/* ---------- Web API ---------- */

function doGet() {
  return json_({ ok: true, service: 'Book Check API' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const email = verifyToken_(req.token);
    switch (req.action) {
      case 'classes': return json_({ ok: true, email, year: schoolYear_(), classes: listClasses_() });
      case 'status':  return json_({ ok: true, status: classStatus_(req.cls) });
      case 'scan':    return json_(Object.assign({ ok: true }, scan_(req.cls, req.id, email)));
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

function listClasses_() {
  const d = readBooks_();
  const set = {};
  d.values.slice(1).forEach(r => {
    const c = String(r[d.idx[COL.CLASS]]).trim().toUpperCase();
    if (c && norm_(r[d.idx[COL.ID]])) set[c] = true;
  });
  return Object.keys(set).sort();
}

function classStatus_(cls, d) {
  d = d || readBooks_();
  const target = norm_(cls);
  const books = [];
  d.values.slice(1).forEach(r => {
    const id = norm_(r[d.idx[COL.ID]]);
    if (!id || norm_(r[d.idx[COL.CLASS]]) !== target) return;
    if (d.idx[COL.COND] >= 0 && r[d.idx[COL.COND]] === 'Lost') return; // written-off books are not expected
    books.push({
      id,
      name: d.idx[COL.NAME] >= 0 ? String(r[d.idx[COL.NAME]]) : '',
      found: d.yearCol >= 0 && r[d.yearCol] !== '' && r[d.yearCol] != null,
    });
  });
  const missing = books.filter(b => !b.found).map(b => ({ id: b.id, name: b.name }));
  return { cls: String(cls).toUpperCase(), year: d.year, total: books.length, found: books.length - missing.length, missing };
}

function scan_(cls, rawId, email) {
  const id = norm_(rawId);
  if (!id) throw new Error('Empty code.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = readBooks_();
    const rowIdx = d.values.findIndex((r, i) => i > 0 && norm_(r[d.idx[COL.ID]]) === id);
    let result, book = null;

    if (rowIdx < 0) {
      result = 'unknown';
    } else {
      const r = d.values[rowIdx];
      book = {
        id,
        name: d.idx[COL.NAME] >= 0 ? String(r[d.idx[COL.NAME]]) : '',
        cls: String(r[d.idx[COL.CLASS]]).trim().toUpperCase(),
        condition: d.idx[COL.COND] >= 0 ? String(r[d.idx[COL.COND]]) : '',
      };
      const yc = ensureYearCol_(d);
      const already = r[yc] !== '' && r[yc] != null;
      if (!already) {
        const now = new Date();
        d.sh.getRange(rowIdx + 1, yc + 1).setValue(now).setNumberFormat('dd/mm hh:mm');
        r[yc] = now;
      }
      if (norm_(book.cls) !== norm_(cls)) result = 'other_class';
      else result = already ? 'duplicate' : 'ok';
    }

    SpreadsheetApp.getActive().getSheetByName(CONFIG.LOG_SHEET)
      .appendRow([new Date(), id, String(cls).toUpperCase(), email, result]);

    return { result, book, status: classStatus_(cls, d) };
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
