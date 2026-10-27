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
      case 'readAgenda':    return json_(readAgenda_(body));
      case 'findAgenda':    return json_(findAgenda_(body));
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

/** Folders inside a folder, including shortcuts that point to folders. */
function subfolders_(folder) {
  const out = [];
  const it = folder.getFolders();
  while (it.hasNext()) out.push(it.next());
  const sc = folder.getFilesByType(MimeType.SHORTCUT);
  while (sc.hasNext()) {
    const s = sc.next();
    try {
      if (s.getTargetMimeType() === MimeType.FOLDER) out.push(DriveApp.getFolderById(s.getTargetId()));
    } catch (e) { /* shortcut to something we can't open */ }
  }
  return out;
}

/** Uses the folder with "agenda" in its name inside the shared folder (a shortcut works too), otherwise the folder itself. */
function agendasFolder_(url) {
  const parent = folderFromUrl_(url);
  const subs = subfolders_(parent);
  const exact = subs.filter(function (f) { return /^\s*agendas?\s*$/i.test(f.getName()); })[0];
  if (exact) return exact;
  const loose = subs.filter(function (f) { return /agenda/i.test(f.getName()); })[0];
  return loose || parent;
}

/** Every Google Doc in a folder and its subfolders (2 levels, for year folders). */
function allDocs_(folder, depth) {
  let docs = [];
  const it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) docs.push(f); }
  if (depth > 0) subfolders_(folder).forEach(function (sub) { docs = docs.concat(allDocs_(sub, depth - 1)); });
  return docs;
}

function countWordFiles_(folder) {
  let n = 0;
  const it = folder.getFilesByType(MimeType.MICROSOFT_WORD);
  while (it.hasNext()) { it.next(); n++; }
  return n;
}

/** Date key from a name like 26_1025_Cienega_Ward_Bishopric_Meeting → "261025". */
function nameKey_(name) {
  const m = String(name).match(/^(\d{2})_(\d{4})/);
  return m ? m[1] + m[2] : '';
}

/**
 * Last week's agenda for this meeting: the newest Doc named like 26_1025_… before the target date.
 * If none are named that way, the most recently created Doc with the meeting's name in it.
 */
function latestAgenda_(docs, keyword, beforeKey) {
  const kw = String(keyword || '').toLowerCase();
  const mine = docs.filter(function (f) { return !kw || f.getName().toLowerCase().indexOf(kw) >= 0; });
  let best = null, bestKey = '';
  mine.forEach(function (f) {
    const key = nameKey_(f.getName());
    if (!key || (beforeKey && key >= beforeKey)) return;
    if (key > bestKey) { best = f; bestKey = key; }
  });
  if (best) return best;
  const sorted = mine.slice().sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  return sorted[0] || null;
}

function folderInfo_(b) {
  const folder = agendasFolder_(b.folderUrl);
  const docs = allDocs_(folder, 2);
  const latest = latestAgenda_(docs, b.keyword, '');
  return {
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
    docCount: docs.length,
    latest: latest ? { name: latest.getName(), url: latest.getUrl() } : null,
    examples: docs.slice(0, 5).map(function (f) { return f.getName(); })
  };
}

/* ------------------------------------------------------------------ */
/* Agendas                                                             */
/* ------------------------------------------------------------------ */

function createAgenda_(b) {
  const folder = agendasFolder_(b.folderUrl);
  const docs = allDocs_(folder, 2);
  const targetKey = String(b.date).slice(2, 4) + String(b.date).slice(5, 7) + String(b.date).slice(8, 10);

  const existing = docs.filter(function (f) { return f.getName() === b.fileName; })[0];
  if (existing) {
    const r = fill_(existing.getId(), b.fields, b.changes);
    return { docId: existing.getId(), docUrl: existing.getUrl(), docName: existing.getName(), reused: true, source: '', missing: r.missing, changes: r.changes };
  }

  const source = latestAgenda_(docs, b.keyword, targetKey);
  if (!source) {
    const word = countWordFiles_(folder);
    const seen = docs.slice(0, 4).map(function (f) { return f.getName(); });
    throw new Error('Couldn\'t find last week\'s ' + b.keyword + ' agenda. Looked in "' + folder.getName() + '" and its subfolders and found ' +
      docs.length + ' Google Doc' + (docs.length === 1 ? '' : 's') + (seen.length ? ' (' + seen.join('; ') + ')' : '') + '.' +
      (word ? ' There are also ' + word + ' Word files there, which the app can\'t edit.' : '') +
      ' The agenda Doc\'s name needs to include "' + b.keyword + '".');
  }
  // Save the new agenda next to last week's (works with year subfolders too).
  const parents = source.getParents();
  const dest = parents.hasNext() ? parents.next() : folder;
  const copy = source.makeCopy(b.fileName, dest);
  const r = fill_(copy.getId(), b.fields, b.changes);
  return { docId: copy.getId(), docUrl: copy.getUrl(), docName: copy.getName(), reused: false, source: source.getName(), missing: r.missing, changes: r.changes };
}

/** Finds an existing agenda Doc for a date (one made by hand, or before the app). */
function findAgenda_(b) {
  const folder = agendasFolder_(b.folderUrl);
  const docs = allDocs_(folder, 2);
  const targetKey = String(b.date).slice(2, 4) + String(b.date).slice(5, 7) + String(b.date).slice(8, 10);
  const kw = String(b.keyword || '').toLowerCase();
  const f = docs.filter(function (d) { return d.getName() === b.fileName; })[0] ||
    docs.filter(function (d) { return nameKey_(d.getName()) === targetKey && d.getName().toLowerCase().indexOf(kw) >= 0; })[0];
  if (!f) return { notFound: true };
  return { docId: f.getId(), docUrl: f.getUrl(), docName: f.getName() };
}

function updateAgenda_(b) {
  let file;
  try { file = DriveApp.getFileById(b.docId); } catch (e) { return { notFound: true }; }
  if (file.isTrashed()) return { notFound: true };
  const r = fill_(b.docId, b.fields, b.changes);
  return { docId: file.getId(), docUrl: file.getUrl(), docName: file.getName(), missing: r.missing, changes: r.changes };
}

/**
 * Replaces the text after each label, keeping the label and its formatting.
 * fields: { date, attendees, hymn, openPrayer, thought, closePrayer, nextThought }
 */
function fill_(docId, fields, changes) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const changeResult = changes ? applyChanges_(body, changes) : null;
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
  return { missing: missing, changes: changeResult };
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
/* Meeting Mode: read a Doc, and carry changes into next week's        */
/* ------------------------------------------------------------------ */

function readAgenda_(b) {
  let doc;
  try { doc = DocumentApp.openById(b.docId); } catch (e) { return { notFound: true }; }
  const body = doc.getBody();
  const out = [];
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    const type = el.getType();
    if (type === DocumentApp.ElementType.LIST_ITEM) {
      const li = el.asListItem();
      out.push({ type: 'li', text: li.getText(), level: li.getNestingLevel(), links: links_(li.editAsText()) });
    } else if (type === DocumentApp.ElementType.PARAGRAPH) {
      const p = el.asParagraph();
      out.push({ type: 'p', text: p.getText(), heading: String(p.getHeading()) !== 'NORMAL', links: links_(p.editAsText()) });
    } else if (type === DocumentApp.ElementType.TABLE) {
      const t = el.asTable(), rows = [];
      for (let r = 0; r < t.getNumRows(); r++) {
        const row = t.getRow(r), cells = [];
        for (let c = 0; c < row.getNumCells(); c++) cells.push(row.getCell(c).getText());
        rows.push(cells);
      }
      out.push({ type: 'table', rows: rows });
    }
  }
  return { name: doc.getName(), url: doc.getUrl(), elements: out };
}

/** Linked stretches of text: [{ start, end, url }]. */
function links_(t) {
  const out = [];
  const s = t.getText();
  if (!s) return out;
  const idx = t.getTextAttributeIndices();
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k], end = (k + 1 < idx.length ? idx[k + 1] : s.length) - 1;
    const url = t.getLinkUrl(start);
    if (url && end >= start) {
      const prev = out[out.length - 1];
      if (prev && prev.url === url && prev.end + 1 === start) prev.end = end; else out.push({ start: start, end: end, url: url });
    }
  }
  return out;
}

const norm_ = function (s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); };

function findItem_(body, text) {
  const want = norm_(text);
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    if (el.getType() === DocumentApp.ElementType.LIST_ITEM && norm_(el.asListItem().getText()) === want) return { index: i, item: el.asListItem() };
  }
  return null;
}

function actionTable_(body) {
  const tables = body.getTables();
  for (let i = 0; i < tables.length; i++) {
    const head = norm_(tables[i].getRow(0).getText());
    if (head.indexOf('task') >= 0 && head.indexOf('assign') >= 0) return tables[i];
  }
  return null;
}

/** Removes a list item and anything nested under it. */
function removeItem_(body, text) {
  const f = findItem_(body, text);
  if (!f) return false;
  const level = f.item.getNestingLevel();
  let j = f.index + 1;
  while (j < body.getNumChildren()) {
    const el = body.getChild(j);
    if (el.getType() !== DocumentApp.ElementType.LIST_ITEM || el.asListItem().getNestingLevel() <= level) break;
    j++;
  }
  for (let k = j - 1; k >= f.index; k--) body.removeChild(body.getChild(k));
  return true;
}

function removeActionRow_(body, task) {
  const t = actionTable_(body);
  if (!t) return false;
  for (let r = t.getNumRows() - 1; r >= 1; r--) {
    if (norm_(t.getRow(r).getCell(0).getText()) === norm_(task)) { t.removeRow(r); return true; }
  }
  return false;
}

/** Adds a list item at the end of the items nested under the anchor. */
function insertUnder_(body, anchor, text) {
  const f = findItem_(body, anchor);
  if (!f) return false;
  const level = f.item.getNestingLevel();
  let j = f.index + 1, template = null;
  while (j < body.getNumChildren()) {
    const el = body.getChild(j);
    if (el.getType() !== DocumentApp.ElementType.LIST_ITEM) break;
    const li = el.asListItem();
    if (li.getNestingLevel() <= level) break;
    if (li.getNestingLevel() === level + 1) template = li;
    j++;
  }
  const item = (template || f.item).copy();
  if (!template) item.setNestingLevel(level + 1);
  item.setText(text);
  item.editAsText().setLinkUrl(null);
  body.insertListItem(j, item);
  return true;
}

function addActionRow_(body, a) {
  const t = actionTable_(body);
  if (!t) return false;
  const last = t.getRow(t.getNumRows() - 1);
  const row = last.copy();
  const values = [a.task, a.who || '', a.status || '', a.date || ''];
  for (let c = 0; c < row.getNumCells(); c++) {
    row.getCell(c).setText(c < values.length ? values[c] : '');
    row.getCell(c).editAsText().setLinkUrl(null);
  }
  t.appendTableRow(row);
  return true;
}

function editItem_(body, text, newText) {
  const f = findItem_(body, text);
  if (f) { f.item.setText(newText); return true; }
  const t = actionTable_(body);
  if (t) {
    for (let r = 1; r < t.getNumRows(); r++) {
      if (norm_(t.getRow(r).getCell(0).getText()) === norm_(text)) { t.getRow(r).getCell(0).setText(newText); return true; }
    }
  }
  return false;
}

/** changes: { removes: [text], adds: [{ anchor, text }], actions: [{ task, who, date }], edits: [{ text, newText }] } */
function applyChanges_(body, ch) {
  const res = { removed: 0, added: 0, edited: 0, notFound: [] };
  (ch.removes || []).forEach(function (t) {
    if (removeItem_(body, t) || removeActionRow_(body, t)) res.removed++; else res.notFound.push(t);
  });
  (ch.adds || []).forEach(function (a) {
    if (insertUnder_(body, a.anchor, a.text)) res.added++; else res.notFound.push(a.text);
  });
  (ch.actions || []).forEach(function (a) {
    if (addActionRow_(body, a)) res.added++; else res.notFound.push(a.task);
  });
  (ch.edits || []).forEach(function (e) {
    if (editItem_(body, e.text, e.newText)) res.edited++; else res.notFound.push(e.text);
  });
  return res;
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
