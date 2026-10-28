// Sacrament prayers: saving members, history, and asks.
import { db } from './supabase';
import { fail } from './auth';
import { loadAll } from './data';
import { matchName, norm } from './prayerNames';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
const t = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const isDate = s => /^\d{4}-\d\d-\d\d$/.test(String(s || ''));
const camel = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

/** Links Wardbullet names to members wherever there's one clear match. */
export async function autoMatch() {
  const s = db();
  const [rows, members, leaders] = await Promise.all([
    q(s.from('sacrament_history').select('name, member_id, visitor')),
    q(s.from('ward_members').select('*').eq('active', true)),
    q(s.from('leaders').select('*'))
  ]);
  const ms = members.map(camel);
  const names = [...new Set(rows.filter(r => !r.member_id && !r.visitor).map(r => r.name))];
  let matched = 0;
  const jobs = names.map(name => async () => {
    const r = matchName(name, ms, leaders);
    if (r.member) { await q(s.from('sacrament_history').update({ member_id: r.member.id }).eq('name', name).is('member_id', null).select('id')); matched++; }
    else if (r.visitor) await q(s.from('sacrament_history').update({ visitor: true }).eq('name', name).is('member_id', null).select('id'));
  });
  for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map(j => j()));
  return matched;
}

/* ---------- Import the LCR member list ---------- */
async function importMembers(b) {
  const list = Array.isArray(b.members) ? b.members.slice(0, 2000) : [];
  if (!list.length) throw fail('No members to import.');
  const s = db();
  const rows = list.map(m => ({
    import_key: t(m.key, 200), last: t(m.last, 60), first: t(m.first, 80), gender: m.gender === 'F' ? 'F' : m.gender === 'M' ? 'M' : '',
    birth_date: isDate(m.birthDate) ? m.birthDate : null, phone: t(m.phone, 40), email: t(m.email, 120),
    flags: t((m.flags || []).join(', '), 80), household: t(m.household, 160), active: true, updated_at: new Date().toISOString()
  })).filter(r => r.import_key && r.last && r.first);
  const existing = await q(s.from('ward_members').select('id, import_key, active'));
  const have = new Set(existing.map(r => r.import_key));
  for (let i = 0; i < rows.length; i += 200) await q(s.from('ward_members').upsert(rows.slice(i, i + 200), { onConflict: 'import_key' }).select('id'));
  // People no longer on the list have moved out
  const keys = new Set(rows.map(r => r.import_key));
  const gone = existing.filter(r => r.active && !keys.has(r.import_key)).map(r => r.id);
  for (let i = 0; i < gone.length; i += 100) await q(s.from('ward_members').update({ active: false }).in('id', gone.slice(i, i + 100)).select('id'));
  const matched = await autoMatch();
  return { data: await loadAll(), summary: { added: rows.filter(r => !have.has(r.import_key)).length, updated: rows.filter(r => have.has(r.import_key)).length, moved: gone.length, matched } };
}

/* ---------- Match a Wardbullet name by hand ---------- */
async function matchByHand(b) {
  const name = t(b.name, 120);
  if (!name) throw fail('Missing name.');
  const s = db();
  if (b.visitor) {
    await q(s.from('sacrament_history').update({ visitor: true, member_id: null }).eq('name', name).select('id'));
  } else {
    const m = (await q(s.from('ward_members').select('id, aliases').eq('id', t(b.memberId, 60))))[0];
    if (!m) throw fail("Couldn't find that member.");
    await q(s.from('sacrament_history').update({ member_id: m.id, visitor: false }).eq('name', name).select('id'));
    const aliases = new Set(String(m.aliases || '').split('|').filter(Boolean));
    aliases.add(norm(name));
    await q(s.from('ward_members').update({ aliases: [...aliases].join('|').slice(0, 1000) }).eq('id', m.id).select('id'));
  }
  return { data: await loadAll() };
}

/* ---------- One member's prayer settings ---------- */
async function saveMember(b) {
  const id = t(b.id, 60);
  const patch = {};
  if ('goesBy' in b) patch.goes_by = t(b.goesBy, 40);
  if ('phone' in b) patch.phone = t(b.phone, 40);
  if ('neverAsk' in b) patch.never_ask = !!b.neverAsk;
  if ('note' in b) patch.note = t(b.note, 120);
  await q(db().from('ward_members').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id'));
  return { data: await loadAll() };
}

/* ---------- Asking someone ---------- */
async function ask(b) {
  if (!isDate(b.date) || !['open', 'close'].includes(b.slot)) throw fail('Pick a Sunday and a prayer.');
  const memberId = t(b.memberId, 60);
  if (!memberId) throw fail('Pick who to ask.');
  const s = db();
  // Whoever was down for this prayer before is replaced
  const open = await q(s.from('prayer_asks').select('id, status').eq('date', b.date).eq('slot', b.slot).in('status', ['asked', 'yes']));
  if (open.length) await q(s.from('prayer_asks').delete().in('id', open.map(a => a.id)));
  const now = new Date().toISOString();
  const status = b.status === 'yes' ? 'yes' : 'asked';
  await q(s.from('prayer_asks').insert({
    date: b.date, slot: b.slot, member_id: memberId, status, asked_at: now, answered_at: status === 'yes' ? now : null,
    reminded_at: b.reminded ? now : null, in_wardbullet: !!b.inWardbullet
  }).select('id'));
  return { data: await loadAll() };
}

async function updateAsk(b) {
  const id = t(b.id, 60);
  const s = db();
  const a = (await q(s.from('prayer_asks').select('*').eq('id', id)))[0];
  if (!a) throw fail('That ask was already removed.');
  const now = new Date().toISOString();
  const patch = {};
  if (b.op === 'yes') Object.assign(patch, { status: 'yes', answered_at: now });
  else if (b.op === 'no') Object.assign(patch, { status: 'no', answered_at: now });
  else if (b.op === 'noreply') Object.assign(patch, { status: 'noreply', answered_at: now });
  else if (b.op === 'again') Object.assign(patch, { asked_at: now });
  else if (b.op === 'reminded') Object.assign(patch, { reminded_at: now });
  else if (b.op === 'wardbullet') Object.assign(patch, { in_wardbullet: b.value !== false });
  else if (b.op === 'remove') { await q(s.from('prayer_asks').delete().eq('id', id)); return { data: await loadAll() }; }
  else throw fail('Unknown action.');
  await q(s.from('prayer_asks').update(patch).eq('id', id).select('id'));
  return { data: await loadAll() };
}

/* ---------- History ---------- */
async function addHistory(b) {
  if (!isDate(b.date) || !['speaker', 'invocation', 'benediction'].includes(b.kind)) throw fail('Pick a date.');
  const s = db();
  let name = t(b.name, 120), memberId = t(b.memberId, 60) || null;
  if (memberId) {
    const m = (await q(s.from('ward_members').select('first, last, goes_by').eq('id', memberId)))[0];
    if (!m) throw fail("Couldn't find that member.");
    name = `${m.goes_by || m.first.split(' ')[0]} ${m.last}`;
  }
  if (!name) throw fail('Add a name.');
  await q(s.from('sacrament_history').upsert({ date: b.date, kind: b.kind, name, member_id: memberId, visitor: !memberId && !!b.visitor }, { onConflict: 'date,kind,name' }).select('id'));
  if (!memberId && !b.visitor) await autoMatch();
  return { data: await loadAll() };
}

async function removeHistory(b) {
  await q(db().from('sacrament_history').delete().eq('id', t(b.id, 60)));
  return { data: await loadAll() };
}

/** Lines like "Speaker  Jim Talbot  9" or "Invocation\tArjay Gamble\t2", copied from the Wardbullet report. */
export function parseWardbullet(text, asOf) {
  const out = [];
  const base = new Date(`${asOf}T12:00:00Z`);
  String(text || '').split(/\r?\n/).forEach(line => {
    const m = line.trim().match(/^(speaker|invocation|benediction)\s+(.+?)\s+(-?\d{1,4})$/i);
    if (!m) return;
    const d = new Date(base.getTime() - Number(m[3]) * 864e5);
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (dow <= 3 ? -dow : 7 - dow)); // nearest Sunday
    out.push({ date: d.toISOString().slice(0, 10), kind: m[1].toLowerCase(), name: m[2].replace(/\s+/g, ' ').trim() });
  });
  return out;
}

async function importWardbullet(b) {
  const asOf = isDate(b.asOf) ? b.asOf : new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
  const rows = parseWardbullet(b.text, asOf);
  if (!rows.length) throw fail('No lines looked like "Speaker  Name  9". Check what you pasted.');
  await q(db().from('sacrament_history').upsert(rows, { onConflict: 'date,kind,name', ignoreDuplicates: true }).select('id'));
  const matched = await autoMatch();
  return { data: await loadAll(), summary: { lines: rows.length, matched } };
}

/* ---------- Sundays with no sacrament meeting ---------- */
async function setDay(b) {
  if (!isDate(b.date)) throw fail('Pick a Sunday.');
  const s = db();
  if (b.noMeeting) await q(s.from('sacrament_days').upsert({ date: b.date, no_meeting: true, note: t(b.note, 80) }, { onConflict: 'date' }).select('date'));
  else await q(s.from('sacrament_days').delete().eq('date', b.date));
  return { data: await loadAll() };
}

const ACTIONS = { importMembers, matchByHand, saveMember, ask, updateAsk, addHistory, removeHistory, importWardbullet, setDay };
export async function prayersAction(b) {
  const fn = ACTIONS[b && b.action];
  if (!fn) throw fail('Unknown request.');
  return fn(b);
}
