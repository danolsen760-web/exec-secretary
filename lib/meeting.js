import { db } from './supabase';
import { fail } from './auth';
import { bridge } from './bridge';
import { MEETINGS, fileName } from './names';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
const toCamel = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()), v]));
const check = (meeting, date) => {
  if (!['B', 'W'].includes(meeting) || !/^\d{4}-\d\d-\d\d$/.test(date || '')) throw fail('Unknown meeting.');
};

async function marksFor(meeting, date) {
  return (await q(db().from('meeting_marks').select('*').eq('meeting', meeting).eq('date', date).order('created_at'))).map(toCamel);
}

/* Meeting Mode: this Sunday's agenda straight from the Doc, plus your changes. */
export async function readMeeting(meeting, date) {
  check(meeting, date);
  let row = (await q(db().from('agendas').select('*').eq('meeting', meeting).eq('date', date)))[0];
  if (row && row.skipped) return { status: 'skipped', reason: row.skip_reason };
  if (!row || !row.doc_id) {
    // Not linked yet (made by hand, or before the app): look for it in the Agendas folder by name.
    const settings = Object.fromEntries((await q(db().from('settings').select('*'))).map(r => [r.key, r.value]));
    const m = MEETINGS[meeting];
    if (!settings[m.folderKey]) return { status: 'none' };
    const found = await bridge('findAgenda', { folderUrl: settings[m.folderKey], keyword: m.keyword, date, fileName: fileName(settings.filePattern, date, meeting) });
    if (found.notFound) return { status: 'none' };
    const link = { doc_id: found.docId, doc_url: found.docUrl, doc_name: found.docName };
    if (row) await q(db().from('agendas').update(link).eq('id', row.id).select());
    else await q(db().from('agendas').insert({ meeting, date, ...link }).select());
    row = { ...(row || {}), ...link };
  }
  const doc = await bridge('readAgenda', { docId: row.doc_id });
  if (doc.notFound) return { status: 'missing', docUrl: row.doc_url };
  return { status: 'ok', doc, docUrl: row.doc_url, marks: await marksFor(meeting, date) };
}

/* Save or undo one change: { meeting, date, kind, text, anchor, newText, who } or { meeting, date, deleteId } */
export async function saveMark(b) {
  check(b.meeting, b.date);
  const s = db();
  const clean = (v, n = 500) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  if (b.deleteId) {
    await q(s.from('meeting_marks').delete().eq('id', b.deleteId).eq('meeting', b.meeting).eq('date', b.date).is('applied_to', null));
    return { marks: await marksFor(b.meeting, b.date) };
  }
  const kind = b.kind;
  if (!['done', 'edit', 'add', 'action'].includes(kind)) throw fail('Unknown change.');
  const row = { meeting: b.meeting, date: b.date, kind, text: clean(b.text), anchor: clean(b.anchor), new_text: clean(b.newText), who: clean(b.who, 60) };
  if (!row.text) throw fail(kind === 'action' ? 'Type the action item.' : 'Type the item.');
  if (kind === 'add' && !row.anchor) throw fail('Missing where the item goes.');
  if (kind === 'edit' && !row.new_text) throw fail('Type the new wording.');
  // One 'done' or 'edit' per item: replace an earlier one
  if (kind === 'done' || kind === 'edit') {
    await q(s.from('meeting_marks').delete().eq('meeting', b.meeting).eq('date', b.date).eq('kind', kind).eq('text', row.text).is('applied_to', null));
  }
  await q(s.from('meeting_marks').insert(row).select());
  return { marks: await marksFor(b.meeting, b.date) };
}
