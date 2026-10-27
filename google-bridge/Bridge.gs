/**
 * Cienega Exec Secretary: Google bridge
 *
 * Lets the Vercel app work with your Google Docs and Gmail, running as you.
 * Setup (once):
 *   1. Paste the same secret you put in Vercel's BRIDGE_SECRET between the quotes below.
 *   2. Run "authorize" once from the toolbar and allow access.
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *      ("Anyone" lets the Vercel app reach it. Every request must include the secret.)
 */
const SECRET = 'PASTE-YOUR-BRIDGE-SECRET-HERE';

/* ------------------------------------------------------------------ */

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'Bad request.' }); }
  if (!SECRET || SECRET.indexOf('PASTE') === 0) return json_({ error: 'The bridge secret has not been set in Bridge.gs yet.' });
  if (body.secret !== SECRET) return json_({ error: 'The bridge secret does not match BRIDGE_SECRET in Vercel.' });
  try {
    switch (body.action) {
      case 'ping':          return json_({ ok: true, email: Session.getEffectiveUser().getEmail() });
      case 'folderInfo':    return json_(folderInfo_(body));
      case 'createAgenda':  return json_(createAgenda_(body));
      case 'updateAgenda':  return json_(updateAgenda_(body));
      case 'sendEmail':     return json_(sendEmail_(body));
      default:              return json_({ error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('The Cienega Exec Secretary bridge is running.');
}

/** Run once from the editor so Google asks for permission. */
function authorize() {
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  // DocumentApp permission is requested automatically because fill_() uses it.
  Logger.log('Authorized as ' + Session.getEffectiveUser().getEmail());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

function folderFromUrl_(url) {
  const m = String(url || '').match(/folders\/([\w-]+)/) || String(url || '').match(/^([\w-]{20,})$/);
  if (!m) throw new Error('That Drive folder link doesn\'t look right: ' + url);
  try { return DriveApp.getFolderById(m[1]); }
  catch (e) { throw new Error('Couldn\'t open the Drive folder. Check the link and that this Google account can see it.'); }
}

/** Uses the "Agendas" subfolder if there is one, otherwise the folder itself. */
function agendasFolder_(url) {
  const parent = folderFromUrl_(url);
  const it = parent.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (/^agendas?$/i.test(f.getName().trim())) return f;
  }
  return parent;
}

/** Date key from a name like 26_1025_Cienega_Ward_Bishopric_Meeting → "261025". */
function nameKey_(name) {
  const m = String(name).match(/^(\d{2})_(\d{4})/);
  return m ? m[1] + m[2] : '';
}

/** Latest agenda Doc for this meeting dated before the target date. */
function latestAgenda_(folder, keyword, beforeKey) {
  let best = null, bestKey = '';
  const it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (keyword && name.toLowerCase().indexOf(keyword.toLowerCase()) < 0) continue;
    const key = nameKey_(name);
    if (!key || (beforeKey && key >= beforeKey)) continue;
    if (key > bestKey) { best = f; bestKey = key; }
  }
  return best;
}

function findByName_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function folderInfo_(b) {
  const folder = agendasFolder_(b.folderUrl);
  const latest = latestAgenda_(folder, b.keyword, '');
  return {
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
    latest: latest ? { name: latest.getName(), url: latest.getUrl() } : null
  };
}

/* ------------------------------------------------------------------ */
/* Agendas                                                             */
/* ------------------------------------------------------------------ */

function createAgenda_(b) {
  const folder = agendasFolder_(b.folderUrl);
  const targetKey = String(b.date).slice(2, 4) + String(b.date).slice(5, 7) + String(b.date).slice(8, 10);

  const existing = findByName_(folder, b.fileName);
  if (existing) {
    const r = fill_(existing.getId(), b.fields);
    return { docId: existing.getId(), docUrl: existing.getUrl(), docName: existing.getName(), reused: true, source: '', missing: r.missing };
  }

  const source = latestAgenda_(folder, b.keyword, targetKey);
  if (!source) {
    throw new Error('Couldn\'t find last week\'s ' + b.keyword + ' agenda in "' + folder.getName() +
      '". The app copies the newest Doc named like 26_1025_..._' + b.keyword + '_Meeting.');
  }
  const copy = source.makeCopy(b.fileName, folder);
  const r = fill_(copy.getId(), b.fields);
  return { docId: copy.getId(), docUrl: copy.getUrl(), docName: copy.getName(), reused: false, source: source.getName(), missing: r.missing };
}

function updateAgenda_(b) {
  let file;
  try { file = DriveApp.getFileById(b.docId); } catch (e) { return { notFound: true }; }
  if (file.isTrashed()) return { notFound: true };
  const r = fill_(b.docId, b.fields);
  return { docId: file.getId(), docUrl: file.getUrl(), docName: file.getName(), missing: r.missing };
}

/**
 * Replaces the text after each label, keeping the label and its formatting.
 * fields: { date, attendees, hymn, openPrayer, thought, closePrayer, nextThought }
 */
function fill_(docId, fields) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const notNext = function (s) { return !/next\s+week/i.test(s); };
  const isNext = function (s) { return /next\s+week/i.test(s); };
  const jobs = [
    ['date', 'Date:', function (s) { return /^\s*Date:/i.test(s); }],
    ['attendees', 'Attendees:', function (s) { return /^\s*Attendees:/i.test(s); }],
    ['hymn', 'Opening Hymn:', null],
    ['openPrayer', 'Opening Prayer:', null],
    ['thought', 'Thought/Training:', notNext],
    ['closePrayer', 'Closing Prayer:', null],
    ['nextThought', 'Thought/Training:', isNext]
  ];
  const missing = [];
  jobs.forEach(function (j) {
    const value = fields[j[0]];
    if (value == null || value === '') return;
    if (!replaceAfter_(body, j[1], j[2], String(value))) missing.push(j[1].replace(':', ''));
  });
  doc.saveAndClose();
  return { missing: missing };
}

function replaceAfter_(body, label, test, value) {
  const pattern = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let found = body.findText(pattern);
  while (found) {
    const t = found.getElement().asText();
    const s = t.getText();
    if (!test || test(s)) {
      const at = s.indexOf(label) + label.length;
      const valueStart = s.charAt(at) === ' ' ? at + 1 : at;
      let attrs = null;
      if (valueStart < s.length) attrs = t.getAttributes(valueStart);
      if (at < s.length) t.deleteText(at, s.length - 1);
      t.appendText(' ' + value);
      if (attrs) {
        const clean = {};
        Object.keys(attrs).forEach(function (k) { if (attrs[k] !== null) clean[k] = attrs[k]; });
        t.setAttributes(at + 1, at + value.length, clean);
      }
      return true;
    }
    found = body.findText(pattern, found);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

function sendEmail_(b) {
  const to = (b.to || []).filter(function (x) { return /@/.test(x); });
  if (!to.length) throw new Error('No email addresses to send to.');
  MailApp.sendEmail({ to: to.join(','), subject: b.subject, body: b.text, htmlBody: b.html, name: b.fromName || undefined });
  return { ok: true, count: to.length };
}
