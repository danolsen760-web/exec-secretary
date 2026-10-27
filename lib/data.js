import { db } from './supabase';
import { fail } from './auth';

const toCamel = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()), v]));
const toSnake = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]));

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

const text = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const slug = s => (text(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x');
const rand = () => Math.random().toString(36).slice(2, 8);

export function todayPhoenix() {
  // Arizona doesn't change clocks, so this is always the right local date.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function loadAll() {
  const s = db();
  const [leaders, interviewers, settings, households, children, agendas, pendingMarks, windows, daysOff, tracks, appointments] = await Promise.all([
    q(s.from('leaders').select('*').order('sort').order('last')),
    q(s.from('interviewers').select('*').order('id')),
    q(s.from('settings').select('*')),
    q(s.from('households').select('*').order('family')),
    q(s.from('children').select('*').order('birth_year')),
    q(s.from('agendas').select('*').order('date', { ascending: false }).limit(300)),
    q(s.from('meeting_marks').select('id, meeting, date, kind').is('applied_to', null)),
    q(s.from('iv_windows').select('*')),
    q(s.from('iv_days_off').select('*').gte('date', todayPhoenix())),
    q(s.from('iv_tracks').select('*').order('due')),
    q(s.from('appointments').select('*').gte('starts_at', new Date(Date.now() - 120 * 864e5).toISOString()).order('starts_at'))
  ]);
  return {
    leaders: leaders.map(toCamel),
    interviewers: interviewers.map(toCamel),
    settings: Object.fromEntries(settings.map(r => [r.key, r.value])),
    households: households.map(toCamel),
    children: children.map(toCamel),
    agendas: agendas.map(toCamel),
    pendingMarks: pendingMarks.map(toCamel),
    windows: windows.map(toCamel),
    daysOff: daysOff.map(toCamel),
    tracks: tracks.map(toCamel),
    appointments: appointments.map(toCamel),
    today: todayPhoenix()
  };
}

/* ---------- Settings → Meeting attendees ---------- */
export async function saveLeader(b) {
  const l = {
    id: text(b.id, 60),
    first: text(b.first, 60),
    last: text(b.last, 60),
    title: text(b.title, 20) || 'Bro.',
    calling: text(b.calling, 80),
    email: text(b.email, 120),
    phone: text(b.phone, 40),
    bishopric: !!b.bishopric,
    council: !!b.council,
    active: b.active !== false
  };
  if (!l.first || !l.last) throw fail('First and last name are required.');
  if (l.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)) throw fail(`"${l.email}" doesn't look like an email address.`);
  if (!l.id) l.id = `${slug(l.last)}-${rand()}`;
  await q(db().from('leaders').upsert(toSnake(l)).select());
  return loadAll();
}

/* ---------- Settings → Interviewers and hours ---------- */
export async function saveInterviewer(b) {
  const id = text(b.id, 60);
  if (!id) throw fail('Missing interviewer.');
  const iv = {
    leaderId: text(b.leaderId, 60),
    calendarName: text(b.calendarName, 120),
    place: text(b.place, 80),
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(b.day) ? b.day : 'Sun',
    startTime: text(b.startTime, 5),
    endTime: text(b.endTime, 5),
    slotMinutes: int(b.slotMinutes, 5, 120) || 15
  };
  if (!iv.leaderId) throw fail('Choose who this interviewer is.');
  if (!/^\d\d:\d\d$/.test(iv.startTime) || !/^\d\d:\d\d$/.test(iv.endTime)) throw fail('Enter a start and end time.');
  if (iv.startTime >= iv.endTime) throw fail('The end time needs to be after the start time.');
  await q(db().from('interviewers').update(toSnake(iv)).eq('id', id).select());
  await q(db().from('settings').upsert({ key: 'hoursConfirmed', value: 'TRUE' }).select());
  return loadAll();
}

/* ---------- Settings (rules, templates, reminders, agendas) ---------- */
export async function saveSettings(b) {
  const map = b && b.settings;
  if (!map || typeof map !== 'object') throw fail('Nothing to save.');
  const rows = Object.entries(map)
    .filter(([k]) => /^[a-zA-Z0-9]{1,40}$/.test(k))
    .map(([key, value]) => ({ key, value: text(value, 4000) }));
  if (rows.length) await q(db().from('settings').upsert(rows).select());
  return loadAll();
}

/* ---------- Members → a family and its children ---------- */
export async function saveHousehold(b) {
  const h = b.household || {};
  const id = text(h.id, 60);
  const row = {
    family: text(h.family, 60),
    p1Title: text(h.p1Title, 10) || 'Bro.', p1First: text(h.p1First, 60), p1Phone: text(h.p1Phone, 40), p1Email: text(h.p1Email, 120),
    p2Title: text(h.p2Title, 10) || 'Sis.', p2First: text(h.p2First, 60), p2Phone: text(h.p2Phone, 40), p2Email: text(h.p2Email, 120),
    textTo: int(h.textTo, 1, 2) || 1,
    active: h.active !== false,
    updatedAt: new Date().toISOString()
  };
  if (!row.family) throw fail('Add the family name.');
  if (!row.p1First && !row.p2First) throw fail('Add at least one parent.');
  if (!row[`p${row.textTo}First`]) row.textTo = row.p1First ? 1 : 2;

  const kids = (Array.isArray(b.kids) ? b.kids : []).map(k => {
    const kid = {
      id: text(k.id, 60),
      first: text(k.first, 60),
      birthMonth: int(k.birthMonth, 1, 12),
      birthDay: int(k.birthDay, 1, 31),
      birthYear: int(k.birthYear, 1900, 2100),
      lastInterview: /^\d{4}-\d\d-\d\d$/.test(k.lastInterview || '') ? k.lastInterview : null,
      lastWith: text(k.lastWith, 60) || null,
      override: text(k.override, 60) || 'auto',
      active: k.active !== false
    };
    if (!kid.first) throw fail('Each child needs a first name.');
    if (!kid.birthMonth || !kid.birthDay || !kid.birthYear) throw fail(`Check ${kid.first}'s age and birthday.`);
    return kid;
  });

  const s = db();
  let householdId = id;
  if (householdId) {
    await q(s.from('households').update(toSnake(row)).eq('id', householdId).select());
  } else {
    const created = await q(s.from('households').insert(toSnake(row)).select('id').single());
    householdId = created.id;
  }

  const existing = await q(s.from('children').select('id').eq('household_id', householdId));
  const keep = new Set(kids.filter(k => k.id).map(k => k.id));
  const remove = existing.map(r => r.id).filter(x => !keep.has(x));
  if (remove.length) await q(s.from('children').delete().in('id', remove));

  for (const k of kids.filter(k => k.id)) {
    const { id: kidId, ...rest } = k;
    await q(s.from('children').update(toSnake(rest)).eq('id', kidId).eq('household_id', householdId).select());
  }
  const fresh = kids.filter(k => !k.id).map(({ id: _drop, ...rest }) => toSnake({ ...rest, householdId }));
  if (fresh.length) await q(s.from('children').insert(fresh).select());

  return loadAll();
}

/* ---------- Settings → Data: download everything as a file ---------- */
export async function exportAll() {
  const s = db();
  const tables = ['leaders', 'interviewers', 'settings', 'households', 'children', 'agendas', 'meeting_marks', 'iv_windows', 'iv_days_off', 'iv_tracks', 'appointments'];
  const out = { exportedAt: new Date().toISOString() };
  for (const t of tables) out[t] = await q(s.from(t).select('*'));
  return out;
}
