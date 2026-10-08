/**
 * Search Practice — Apps Script API (bound to the Google Sheet)
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Students (no sign-in) can only ADD events with action 'log'.
 * Reading and clearing data needs a teacher's @sjps.edu.hk Google sign-in.
 * Nothing that students type into the fake forms is ever sent here — only which boxes they filled.
 */

const CONFIG = {
  CLIENT_ID: '50487504605-rg8pk326ajj8d8j5lckfihn5n9gbevq4.apps.googleusercontent.com',
  DOMAIN: 'sjps.edu.hk',
  CLASSES: ['2A', '2B', '2C', '2D', '2E'],
  MAX_NO: 30,
  LOG_SHEET: 'Log',
  ARCHIVE_SHEET: 'Archive',
};

const HEADERS = ['Time', 'Class', 'No', 'Session', 'EventID', 'Type', 'Site', 'Detail'];
const TYPES = ['join', 'search', 'open', 'popup_show', 'popup_tap', 'popup_close', 'typed', 'submit', 'share', 'answer', 'play'];

/* ---------- One-time setup: run this once from the editor ---------- */

function setupSheet() {
  [CONFIG.LOG_SHEET, CONFIG.ARCHIVE_SHEET].forEach(name => {
    const sh = sheet_(name);
    const headers = name === CONFIG.ARCHIVE_SHEET ? HEADERS.concat(['Cleared at', 'Cleared by']) : HEADERS;
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@');          // class stays text, e.g. "2A"
    sh.getRange('D:H').setNumberFormat('@');          // session, ids and details stay text
  });
}

/* ---------- Web API ---------- */

function doGet() {
  return json_({ ok: true, service: 'Search Practice API' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'log') return json_(logEvents_(req));
    const email = verifyToken_(req.token);
    switch (req.action) {
      case 'data':  return json_({ ok: true, email, rows: classRows_(req.cls) });
      case 'clear': return json_(Object.assign({ ok: true }, clearClass_(req.cls, email)));
      default:      return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, auth: err.auth === false ? false : undefined, error: String(err.message || err) });
  }
}

/* ---------- Students: add events ---------- */

function logEvents_(req) {
  const cls = String(req.cls || '');
  const no = Number(req.no);
  if (!CONFIG.CLASSES.includes(cls) || !Number.isInteger(no) || no < 1 || no > CONFIG.MAX_NO)
    return { ok: false, error: 'Unknown class or number' };
  const events = (Array.isArray(req.events) ? req.events : []).slice(0, 100).filter(ev => ev && TYPES.includes(ev.type));
  if (!events.length) return { ok: true, saved: 0 };

  const now = new Date();
  const sid = text_(req.sid, 20);
  const rows = events.map(ev => [now, cls, no, sid, text_(ev.id, 40), ev.type, text_(ev.site, 20), text_(ev.detail, 100)]);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(CONFIG.LOG_SHEET);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, saved: rows.length };
}

// Plain text only: a leading = + - @ would otherwise be read as a formula.
function text_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ---------- Teacher: read and clear ---------- */

function checkClass_(cls) {
  if (!CONFIG.CLASSES.includes(cls)) throw new Error('Unknown class');
}

function classRows_(cls) {
  checkClass_(cls);
  const values = sheet_(CONFIG.LOG_SHEET).getDataRange().getValues().slice(1);
  return values
    .filter(r => String(r[1]) === cls)
    .map(r => [r[0] instanceof Date ? r[0].toISOString() : String(r[0]), String(r[1]), Number(r[2]),
      String(r[3]), String(r[4]), String(r[5]), String(r[6]), String(r[7])]);
}

function clearClass_(cls, email) {
  checkClass_(cls);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(CONFIG.LOG_SHEET);
    const values = sh.getDataRange().getValues();
    const body = values.slice(1);
    const move = body.filter(r => String(r[1]) === cls);
    const keep = body.filter(r => String(r[1]) !== cls);
    if (move.length) {
      const arch = sheet_(CONFIG.ARCHIVE_SHEET);
      const now = new Date();
      arch.getRange(arch.getLastRow() + 1, 1, move.length, HEADERS.length + 2)
        .setValues(move.map(r => r.concat([now, email])));
      if (body.length) sh.getRange(2, 1, body.length, HEADERS.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, HEADERS.length).setValues(keep);
    }
    return { moved: move.length };
  } finally {
    lock.releaseLock();
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

/* ---------- Utils ---------- */

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
