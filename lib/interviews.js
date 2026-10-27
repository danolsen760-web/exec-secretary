import { db } from './supabase';
import { fail } from './auth';
import { bridge } from './bridge';
import { loadAll, exportAll } from './data';
import { phx, phxDate, phxTime, phxDow, DOW, addDaysIso, addMonthsIso, toMinutes, fromMinutes, dayShort, time12 } from './time';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const isDate = s => /^\d{4}-\d\d-\d\d$/.test(s || '');
const isTime = s => /^\d\d:\d\d$/.test(s || '');

async function base() {
  const s = db();
  const [leaders, interviewers, windows, daysOff, settingsRows] = await Promise.all([
    q(s.from('leaders').select('*')),
    q(s.from('interviewers').select('*').order('id')),
    q(s.from('iv_windows').select('*')),
    q(s.from('iv_days_off').select('*')),
    q(s.from('settings').select('*'))
  ]);
  return { leaders, interviewers, windows, daysOff, settings: Object.fromEntries(settingsRows.map(r => [r.key, r.value])) };
}
const ivById = (ctx, id) => {
  const iv = ctx.interviewers.find(i => i.id === id);
  if (!iv) throw fail('Unknown interviewer.');
  return iv;
};

/* Event title, e.g. "Youth interview – Emma T." (counselor calendars start with the counselor's name). */
async function titleFor(ctx, iv, who) {
  const leader = ctx.leaders.find(l => l.id === iv.leader_id);
  const prefix = iv.kind === 'counselor' && leader ? `${leader.last} – ` : '';
  return `${prefix}${who.type} interview – ${who.label}`;
}
const initialOf = name => {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1][0]}.`;
};

async function whoFrom(b) {
  const s = db();
  if (b.childId) {
    const c = (await q(s.from('children').select('*').eq('id', b.childId)))[0];
    if (!c) throw fail('That youth was not found.');
    const h = (await q(s.from('households').select('family').eq('id', c.household_id)))[0];
    return { childId: c.id, trackId: null, type: 'Youth', label: `${c.first} ${(h?.family || ' ')[0]}.` };
  }
  if (b.trackId) {
    const t = (await q(s.from('iv_tracks').select('*').eq('id', b.trackId)))[0];
    if (!t) throw fail('That interview was not found.');
    return { childId: null, trackId: t.id, type: t.type, label: initialOf(t.name) };
  }
  throw fail('Choose who the interview is for.');
}

/* ---------- Openings: every free slot in the next few weeks ---------- */
export async function openings(b) {
  const ctx = await base();
  const iv = ivById(ctx, b.interviewerId);
  const days = Math.min(Number(b.days) || 21, 42);
  const now = new Date();
  const today = phxDate(now);
  const to = phx(addDaysIso(today, days), '23:59');

  // What's already on the calendar
  let busy = [], calendarConnected = !!iv.calendar_id;
  if (iv.calendar_id) {
    const r = await bridge('events', { calendarIds: [iv.calendar_id], from: now.toISOString(), to: to.toISOString() });
    busy = r.events[iv.calendar_id] || [];
    if (iv.kind === 'counselor') {
      // Shared counselor calendar: the other counselor's interviews don't block this one
      const me = (ctx.leaders.find(l => l.id === iv.leader_id) || {}).last || '';
      const others = ctx.interviewers.filter(x => x.kind === 'counselor' && x.id !== iv.id)
        .map(x => (ctx.leaders.find(l => l.id === x.leader_id) || {}).last).filter(Boolean);
      busy = busy.filter(e => {
        const t = String(e.title).toLowerCase();
        return !(others.some(o => t.includes(o.toLowerCase())) && !t.includes(me.toLowerCase()));
      });
    }
  }
  const appts = await q(db().from('appointments').select('*').eq('interviewer', iv.leader_id).eq('status', 'scheduled')
    .gte('starts_at', now.toISOString()).lte('starts_at', to.toISOString()));
  const off = new Set(ctx.daysOff.filter(d => d.interviewer_id === iv.id).map(d => d.date));
  const myWindows = ctx.windows.filter(w => w.interviewer_id === iv.id);

  const out = [];
  for (let i = 0; i <= days; i++) {
    const date = addDaysIso(today, i);
    const dw = DOW[phxDow(date)];
    const ws = myWindows.filter(w => w.day === dw).sort((a, c) => a.start_time.localeCompare(c.start_time));
    if (!ws.length) continue;
    const day = { date, label: dayShort(date), off: off.has(date), slots: [] };
    const allDay = busy.some(e => e.allDay && phxDate(e.start) <= date && date < phxDate(new Date(new Date(e.end).getTime())));
    for (const w of ws) {
      const step = w.slot_minutes || 15;
      for (let m = toMinutes(w.start_time); m + step <= toMinutes(w.end_time); m += step) {
        const time = fromMinutes(m);
        const start = phx(date, time), end = new Date(start.getTime() + step * 60000);
        if (start.getTime() < now.getTime() + 30 * 60000) continue;
        const overlaps = (s, e) => new Date(s) < end && new Date(e) > start;
        const taken = allDay || busy.some(e => !e.allDay && overlaps(e.start, e.end)) ||
          appts.some(a => overlaps(a.starts_at, new Date(new Date(a.starts_at).getTime() + a.minutes * 60000)));
        day.slots.push({ time, label: time12(time), start: start.toISOString(), minutes: step, place: w.place, taken });
      }
    }
    if (day.slots.length) out.push(day);
  }
  return { days: out, calendarConnected };
}

/* ---------- Book a time ---------- */
export async function book(b) {
  const ctx = await base();
  const iv = ivById(ctx, b.interviewerId);
  const who = await whoFrom(b);
  const start = new Date(b.start);
  if (isNaN(start)) throw fail('Pick a time.');
  const minutes = Math.min(Math.max(parseInt(b.minutes, 10) || 15, 5), 120);
  const end = new Date(start.getTime() + minutes * 60000);
  const title = await titleFor(ctx, iv, who);
  let eventId = '';
  if (iv.calendar_id) {
    const r = await bridge('createEvent', { calendarId: iv.calendar_id, title, start: start.toISOString(), end: end.toISOString(),
      location: clean(b.place), description: 'Scheduled by the executive secretary.' });
    eventId = r.eventId;
  }
  const row = (await q(db().from('appointments').insert({
    child_id: who.childId, track_id: who.trackId, interviewer: iv.leader_id, type: who.type,
    starts_at: start.toISOString(), minutes, place: clean(b.place), calendar_id: iv.calendar_id || '', event_id: eventId, event_title: title
  }).select()))[0];
  return { data: await loadAll(), appointmentId: row.id };
}

/* ---------- Text sent, confirmed, done, missed, cancel ---------- */
export async function updateAppointment(b) {
  const s = db();
  const a = (await q(s.from('appointments').select('*').eq('id', b.id)))[0];
  if (!a) throw fail('That appointment was not found.');
  const now = new Date().toISOString();
  const set = patch => q(s.from('appointments').update(patch).eq('id', a.id).select());
  switch (b.action) {
    case 'texted': await set({ texted_at: now }); break;
    case 'untexted': await set({ texted_at: null }); break;
    case 'reminded': await set({ reminded_at: now }); break;
    case 'unreminded': await set({ reminded_at: null }); break;
    case 'confirmed': await set({ confirmed_at: now }); break;
    case 'missed': await set({ status: 'missed' }); break;
    case 'cancel':
      if (a.event_id && a.calendar_id) await bridge('deleteEvent', { calendarId: a.calendar_id, eventId: a.event_id });
      await set({ status: 'cancelled' });
      break;
    case 'done': {
      const date = phxDate(a.starts_at);
      await set({ status: 'done' });
      if (a.child_id) await q(s.from('children').update({ last_interview: date, last_with: a.interviewer }).eq('id', a.child_id).select());
      if (a.track_id) {
        const t = (await q(s.from('iv_tracks').select('*').eq('id', a.track_id)))[0];
        if (t) await q(s.from('iv_tracks').update(t.repeat_months
          ? { last_date: date, due: addMonthsIso(date, t.repeat_months) }
          : { last_date: date, active: false }).eq('id', t.id).select());
      }
      break;
    }
    default: throw fail('Unknown action.');
  }
  return loadAll();
}

export async function reschedule(b) {
  const s = db();
  const a = (await q(s.from('appointments').select('*').eq('id', b.id)))[0];
  if (!a) throw fail('That appointment was not found.');
  const start = new Date(b.start);
  if (isNaN(start)) throw fail('Pick a new time.');
  const minutes = parseInt(b.minutes, 10) || a.minutes;
  const end = new Date(start.getTime() + minutes * 60000);
  if (a.event_id && a.calendar_id) {
    const r = await bridge('updateEvent', { calendarId: a.calendar_id, eventId: a.event_id, start: start.toISOString(), end: end.toISOString() });
    if (r.notFound) throw fail('The calendar event was deleted. Cancel this one and book a new time.');
  }
  await q(s.from('appointments').update({ starts_at: start.toISOString(), minutes, place: clean(b.place) || a.place,
    texted_at: null, confirmed_at: null, reminded_at: null }).eq('id', a.id).select());
  return loadAll();
}

/* ---------- Calendar events not booked through the app ---------- */
export async function unlinkedEvents() {
  const ctx = await base();
  const cals = [...new Set(ctx.interviewers.map(i => i.calendar_id).filter(Boolean))];
  if (!cals.length) return { events: [] };
  const now = Date.now();
  const r = await bridge('events', { calendarIds: cals, from: new Date(now - 7 * 864e5).toISOString(), to: new Date(now + 21 * 864e5).toISOString() });
  const known = new Set((await q(db().from('appointments').select('event_id').neq('event_id', ''))).map(x => x.event_id));
  const out = [];
  for (const calId of cals) {
    for (const e of r.events[calId] || []) {
      if (e.allDay || known.has(e.id)) continue;
      const onCal = ctx.interviewers.filter(i => i.calendar_id === calId);
      const guess = onCal.length === 1 ? onCal[0] : onCal.find(i => {
        const l = ctx.leaders.find(x => x.id === i.leader_id);
        return l && String(e.title).toLowerCase().includes(l.last.toLowerCase());
      });
      out.push({ ...e, calendarId: calId, interviewerId: guess ? guess.id : (onCal[0] || {}).id, date: phxDate(e.start), time: phxTime(e.start) });
    }
  }
  return { events: out.sort((a, c) => a.start.localeCompare(c.start)) };
}

export async function linkEvent(b) {
  const ctx = await base();
  const iv = ivById(ctx, b.interviewerId);
  const start = new Date(b.start), end = new Date(b.end);
  const row = { interviewer: iv.leader_id, starts_at: start.toISOString(), minutes: Math.max(5, Math.round((end - start) / 60000) || 15),
    place: '', calendar_id: clean(b.calendarId, 300), event_id: clean(b.eventId, 300), event_title: clean(b.title) };
  if (b.ignore) Object.assign(row, { status: 'ignored', type: 'Other' });
  else {
    const who = await whoFrom(b);
    Object.assign(row, { child_id: who.childId, track_id: who.trackId, type: who.type });
  }
  await q(db().from('appointments').insert(row).select());
  return loadAll();
}

/* ---------- Adult interviews you track ---------- */
export async function saveTrack(b) {
  const t = {
    household_id: clean(b.householdId, 60) || null,
    who: ['p1', 'p2', 'both'].includes(b.who) ? b.who : 'p1',
    name: clean(b.name, 80),
    type: clean(b.type, 60) || 'Other',
    interviewer: clean(b.interviewer, 60) || null,
    due: isDate(b.due) ? b.due : null,
    repeat_months: parseInt(b.repeatMonths, 10) || null,
    active: b.active !== false
  };
  if (!t.name) throw fail('Add who the interview is for.');
  if (!t.due) throw fail('Add when it\'s due.');
  const s = db();
  if (b.id) await q(s.from('iv_tracks').update(t).eq('id', b.id).select());
  else await q(s.from('iv_tracks').insert(t).select());
  return loadAll();
}

/* ---------- Settings: interviewer, calendar, availability ---------- */
export async function saveInterviewerFull(b) {
  const id = clean(b.id, 60);
  const s = db();
  const leaderId = clean(b.leaderId, 60);
  if (!leaderId) throw fail('Choose who this interviewer is.');
  const windows = (Array.isArray(b.windows) ? b.windows : []).map(w => ({
    interviewer_id: id,
    day: DOW.includes(w.day) ? w.day : 'Sun',
    start_time: clean(w.startTime, 5), end_time: clean(w.endTime, 5),
    slot_minutes: Math.min(Math.max(parseInt(w.slotMinutes, 10) || 15, 5), 120),
    place: clean(w.place, 80)
  }));
  for (const w of windows) {
    if (!isTime(w.start_time) || !isTime(w.end_time)) throw fail('Enter a start and end time for each time window.');
    if (w.start_time >= w.end_time) throw fail(`On ${w.day}, the end time needs to be after the start time.`);
  }
  await q(s.from('interviewers').update({ leader_id: leaderId, calendar_id: clean(b.calendarId, 300), calendar_name: clean(b.calendarName, 120) }).eq('id', id).select());
  await q(s.from('iv_windows').delete().eq('interviewer_id', id));
  if (windows.length) await q(s.from('iv_windows').insert(windows).select());
  await q(s.from('settings').upsert({ key: 'hoursConfirmed', value: 'TRUE' }).select());
  return loadAll();
}

export async function setDayOff(b) {
  if (!isDate(b.date)) throw fail('Pick a date.');
  const s = db();
  if (b.off) await q(s.from('iv_days_off').upsert({ interviewer_id: clean(b.interviewerId, 60), date: b.date }).select());
  else await q(s.from('iv_days_off').delete().eq('interviewer_id', clean(b.interviewerId, 60)).eq('date', b.date));
  return loadAll();
}

export async function listCalendars() {
  return bridge('listCalendars');
}

/* ---------- Your phone reminders (weekly events on your own calendar) ---------- */
const REMINDERS = [
  ['remAgendas', 'Exec Sec: create and send agendas'],
  ['remReminders', 'Exec Sec: send interview reminder texts'],
  ['remReminders2', 'Exec Sec: send interview reminder texts'],
  ['remFill', 'Exec Sec: fill next week\'s interview calendars'],
  ['remConfirm', 'Exec Sec: confirm who came to interviews']
];
export async function syncReminders(b, appUrl) {
  const { settings } = await base();
  const items = REMINDERS
    .filter(([k]) => settings[`${k}Day`] && settings[`${k}Time`] && settings[`${k}Day`] !== 'off')
    .map(([k, title]) => ({ key: k, title, day: settings[`${k}Day`], time: settings[`${k}Time`], description: `Open the app: ${appUrl}` }));
  let old = {};
  try { old = JSON.parse(settings.reminderIds || '{}'); } catch { old = {}; }
  const r = await bridge('syncReminders', { items: b && b.off ? [] : items, old });
  await q(db().from('settings').upsert({ key: 'reminderIds', value: JSON.stringify(r.ids || {}) }).select());
  return { data: await loadAll(), count: Object.keys(r.ids || {}).length };
}

/* ---------- Weekly backup to Google Drive (Vercel cron) ---------- */
export async function backupToDrive() {
  const data = await exportAll();
  const stamp = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const r = await bridge('saveBackup', { fileName: `Exec Secretary backup ${stamp}.json`, content: JSON.stringify(data, null, 1) });
  await q(db().from('settings').upsert({ key: 'lastBackup', value: stamp }).select());
  return { ok: true, folderUrl: r.folderUrl };
}
