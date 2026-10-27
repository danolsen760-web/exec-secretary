import { db } from './supabase';
import { fail } from './auth';
import { bridge } from './bridge';
import { loadAll } from './data';
import { hymnLabel } from './hymns';
import { MEETINGS, shortName, attendeeLine, longDate, sundayLabel, fileName, isSunday, fillTemplate } from './names';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

async function context() {
  const s = db();
  const [leaders, settingsRows] = await Promise.all([
    q(s.from('leaders').select('*').order('sort').order('last')),
    q(s.from('settings').select('*'))
  ]);
  return { leaders, settings: Object.fromEntries(settingsRows.map(r => [r.key, r.value])) };
}

const clean = v => String(v == null ? '' : v).trim().slice(0, 300);

function readPicks(b, leaders) {
  const meeting = b.meeting;
  if (!MEETINGS[meeting]) throw fail('Unknown meeting.');
  if (!/^\d{4}-\d\d-\d\d$/.test(b.date || '') || !isSunday(b.date)) throw fail('Pick a Sunday.');
  const ids = new Set(leaders.map(l => l.id));
  const who = v => (ids.has(v) ? v : null);
  const p = {
    meeting, date: b.date,
    attendees: (Array.isArray(b.attendees) ? b.attendees : []).filter(x => ids.has(x)),
    hymn: parseInt(b.hymn, 10) || null,
    openPrayer: who(b.openPrayer), closePrayer: who(b.closePrayer),
    thought: who(b.thought), thoughtNote: clean(b.thoughtNote),
    nextThought: who(b.nextThought), nextNote: clean(b.nextNote)
  };
  if (!p.attendees.length) throw fail('Check at least one attendee.');
  if (!p.hymn) throw fail('Choose an opening hymn.');
  if (!p.openPrayer || !p.closePrayer) throw fail('Choose both prayers.');
  if (!p.thought) throw fail('Choose who gives the thought.');
  if (!p.nextThought) throw fail("Choose next week's thought.");
  return p;
}

function docFields(p, leaders) {
  const L = id => leaders.find(l => l.id === id);
  const withNote = (id, note) => shortName(L(id)) + (note ? ` (${note})` : '');
  return {
    date: longDate(p.date),
    attendees: attendeeLine(leaders, p.attendees, p.meeting),
    hymn: hymnLabel(p.hymn),
    openPrayer: shortName(L(p.openPrayer)),
    thought: withNote(p.thought, p.thoughtNote),
    closePrayer: shortName(L(p.closePrayer)),
    nextThought: withNote(p.nextThought, p.nextNote)
  };
}

const toRow = p => ({
  meeting: p.meeting, date: p.date, attendees: p.attendees, hymn: p.hymn,
  open_prayer: p.openPrayer, close_prayer: p.closePrayer, thought: p.thought, thought_note: p.thoughtNote,
  next_thought: p.nextThought, next_note: p.nextNote
});

/* Create the Doc (or update it if it already exists) and save the picks. */
export async function createAgenda(b) {
  const { leaders, settings } = await context();
  const p = readPicks(b, leaders);
  const m = MEETINGS[p.meeting];
  const folderUrl = settings[m.folderKey];
  if (!folderUrl) throw fail(`Add the ${m.short} Drive folder in Settings → Agendas.`);

  const fields = docFields(p, leaders);
  const s = db();
  const existing = (await q(s.from('agendas').select('*').eq('meeting', p.meeting).eq('date', p.date)))[0];

  let doc = null, updated = false;
  if (existing && existing.doc_id) {
    const r = await bridge('updateAgenda', { docId: existing.doc_id, fields });
    if (!r.notFound) { doc = r; updated = true; }
  }
  if (!doc) {
    doc = await bridge('createAgenda', {
      folderUrl, keyword: m.keyword, date: p.date,
      fileName: fileName(settings.filePattern, p.date, p.meeting), fields
    });
    updated = !!doc.reused;
  }

  await q(s.from('agendas').upsert(
    { ...toRow(p), doc_id: doc.docId, doc_url: doc.docUrl, doc_name: doc.docName },
    { onConflict: 'meeting,date' }
  ).select());

  return { data: await loadAll(), result: { docUrl: doc.docUrl, docName: doc.docName, source: doc.source || '', updated, missing: doc.missing || [] } };
}

/* Email the Doc link to everyone attending who has an email. */
export async function sendAgenda(b) {
  const { leaders, settings } = await context();
  if (!MEETINGS[b.meeting] || !/^\d{4}-\d\d-\d\d$/.test(b.date || '')) throw fail('Unknown agenda.');
  const s = db();
  const row = (await q(s.from('agendas').select('*').eq('meeting', b.meeting).eq('date', b.date)))[0];
  if (!row || !row.doc_url) throw fail('Create the agenda first.');

  const going = leaders.filter(l => row.attendees.includes(l.id) && l.active !== false);
  const to = going.filter(l => l.email).map(l => l.email);
  const noEmail = going.filter(l => !l.email).map(l => `${l.first} ${l.last}`);
  if (!to.length) throw fail('No one attending has an email yet. Add emails in Settings → Meeting attendees.');

  const values = { meeting: MEETINGS[b.meeting].name, date: sundayLabel(b.date), link: row.doc_url, me: settings.me || '' };
  const subject = fillTemplate(settings.tplAgendaSubject || '{meeting} Agenda – {date}', values);
  const text = fillTemplate(settings.tplAgendaEmail || "Here's the agenda for {meeting} on {date}:\n{link}", values);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = esc(text)
    .replace(esc(row.doc_url), `<a href="${esc(row.doc_url)}">${esc(row.doc_name || 'Open the agenda')}</a>`)
    .replace(/\n/g, '<br>');

  await bridge('sendEmail', { to, subject, text, html, fromName: settings.me || '' });
  await q(s.from('agendas').update({ sent_at: new Date().toISOString() }).eq('id', row.id).select());
  return { data: await loadAll(), result: { count: to.length, noEmail } };
}

/* Settings → Agendas → Test Google connection */
export async function checkBridge() {
  const { settings } = await context();
  const ping = await bridge('ping');
  const out = { email: ping.email, folders: {} };
  for (const key of ['B', 'W']) {
    const m = MEETINGS[key];
    const url = settings[m.folderKey];
    if (!url) { out.folders[key] = { error: 'No folder link yet' }; continue; }
    try { out.folders[key] = await bridge('folderInfo', { folderUrl: url, keyword: m.keyword }); }
    catch (e) { out.folders[key] = { error: e.message }; }
  }
  return out;
}
