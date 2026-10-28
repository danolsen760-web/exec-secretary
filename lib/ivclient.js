// Interview helpers that run in the browser: who's due, who to text, and what to say.
import { parseDate } from './youth';
import { fillTemplate } from './names';
import { phxDate, phxTime, dayLong, time12 } from './time';

const LONG = { 'Bro.': 'Brother', 'Sis.': 'Sister', 'Pres.': 'President', Bishop: 'Bishop', Elder: 'Elder' };
export const longName = (data, leaderId) => {
  const l = data.leaders.find(x => x.id === leaderId);
  return l ? `${LONG[l.title] || l.title} ${l.last}` : '';
};
export const ivForLeader = (data, leaderId) => data.interviewers.find(i => i.leaderId === leaderId);

export const isUpcoming = a => a.status === 'scheduled' && new Date(a.startsAt).getTime() > Date.now() - 3 * 3600 * 1000;
export const apptFor = (data, childId, trackId) => data.appointments.find(a => isUpcoming(a) && ((childId && a.childId === childId) || (trackId && a.trackId === trackId)));

/** Everyone with an interview to track: youth (from Members) and adult interviews. */
export function people(data, H) {
  const today = H.today;
  const out = H.allYouth().map(({ c, h, y }) => ({
    key: `c:${c.id}`, childId: c.id, trackId: null, name: `${c.first} ${h.family}`, first: c.first, age: y.age,
    type: 'Youth', interviewer: y.next, due: y.due, status: y.status, household: h
  }));
  data.tracks.filter(t => t.active !== false).forEach(t => {
    const h = data.households.find(x => x.id === t.householdId);
    if (h && h.active === false) return;
    const due = t.due ? parseDate(t.due) : null;
    const status = !due ? 'missing' : due < today ? 'over' : (due - today) / 864e5 <= 42 ? 'soon' : 'later';
    out.push({ key: `t:${t.id}`, childId: null, trackId: t.id, name: t.name, first: t.name, type: t.type, interviewer: t.interviewer, due, status, household: h });
  });
  out.forEach(p => { p.appt = apptFor(data, p.childId, p.trackId); if (p.appt) p.status = 'sch'; });
  return out;
}

export function personOf(data, H, appt) {
  return people(data, H).find(p => (appt.childId && p.childId === appt.childId) || (appt.trackId && p.trackId === appt.trackId)) || null;
}

/** Who gets the text. For youth, a parent. `which` overrides the default parent (1, 2, or 'both'). */
export function recipient(data, appt, which) {
  if (appt.childId) {
    const c = data.children.find(x => x.id === appt.childId);
    const h = c && data.households.find(x => x.id === c.householdId);
    if (!h) return null;
    const noParent = !h.p1First && !h.p2First;
    // Text the youth directly: chosen in Members, or no parent in the household
    if ((c.textSelf || noParent) && which !== 1 && which !== 2) {
      const pn = h.p1Phone ? 1 : h.p2Phone ? 2 : null;
      return {
        label: `${c.first} ${h.family} (youth)`, phone: c.phone, greet: c.first, youth: c.first, parent: false,
        alt: !noParent && pn ? pn : null, altLabel: pn ? `${h[`p${pn}Title`]} ${h.family}` : ''
      };
    }
    const n = Number(which || h.textTo || 1);
    const other = n === 1 ? 2 : 1;
    return {
      label: `${h[`p${n}Title`]} ${h[`p${n}First`]} ${h.family}`, phone: h[`p${n}Phone`],
      greet: `${LONG[h[`p${n}Title`]] || ''} ${h.family}`.trim(), youth: c.first, parent: true,
      alt: h[`p${other}First`] ? other : null, altLabel: h[`p${other}First`] ? `${h[`p${other}Title`]} ${h.family}` : ''
    };
  }
  const t = data.tracks.find(x => x.id === appt.trackId);
  const h = t && data.households.find(x => x.id === t.householdId);
  if (!t) return null;
  const who = which || t.who || 'p1';
  const n = who === 'p2' ? 2 : 1;
  const greet = who === 'both' && h && h.p2First ? `${h.p1First} and ${h.p2First}` : (h ? h[`p${n}First`] : t.name.split(' ')[0]);
  return {
    label: h ? (who === 'both' ? `${h.p1First} & ${h.p2First} ${h.family}` : `${h[`p${n}Title`]} ${h[`p${n}First`]} ${h.family}`) : t.name,
    phone: h ? (h[`p${n}Phone`] || h.p1Phone || h.p2Phone) : '', greet, parent: false, alt: null
  };
}

const TEMPLATES = {
  confirm: ['tplConfirmParent', 'tplConfirmAdult'],
  remind: ['tplReminderParent', 'tplReminderAdult'],
  follow: ['tplFollowParent', 'tplFollowAdult'],
  reschedule: ['tplReschedule', 'tplReschedule']
};

export function message(data, appt, kind, rec) {
  if (!rec) return '';
  const [parentKey, adultKey] = TEMPLATES[kind];
  const tpl = data.settings[rec.parent ? parentKey : adultKey] || '';
  const date = phxDate(appt.startsAt);
  return fillTemplate(tpl, {
    parent: rec.greet, youth: rec.youth || '', name: rec.greet, interviewer: longName(data, appt.interviewer),
    day: dayLong(date), time: time12(phxTime(appt.startsAt)), place: appt.place || 'church', type: String(appt.type || '').toLowerCase(),
    me: data.settings.me || ''
  });
}

export const smsHref = (phone, body) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;

export const whenLabel = a => `${dayLong(phxDate(a.startsAt))} · ${time12(phxTime(a.startsAt))}`;

/* ---------- One text for brothers and sisters ---------- */
const digitsOf = s => String(s || '').replace(/\D/g, '');
const NEEDS = {
  confirm: a => !a.textedAt,
  remind: a => !a.remindedAt,
  follow: a => !!a.textedAt && !a.confirmedAt,
  confirmed: a => !a.confirmedAt
};

/** Youth interviews on the same day whose texts go to the same parent, and that need the same text. */
export function familyGroup(data, appt, kind) {
  if (!appt.childId || !NEEDS[kind]) return [appt];
  const rec = recipient(data, appt);
  if (!rec || !rec.parent || !digitsOf(rec.phone)) return [appt];
  const day = phxDate(appt.startsAt);
  const group = data.appointments.filter(a => a.id === appt.id || (
    a.childId && a.status === 'scheduled' && isUpcoming(a) && phxDate(a.startsAt) === day && NEEDS[kind](a) &&
    digitsOf((recipient(data, a) || {}).phone) === digitsOf(rec.phone) && (recipient(data, a) || {}).parent));
  return group.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export const GROUP_TEMPLATES = {
  tplConfirmGroup: "Hi {parent}, this is {me}, the ward executive secretary. We'd like to meet with {youth} for youth interviews on {day}:\n{list}\nA parent is welcome to join or wait nearby. Do those times work for your family?",
  tplReminderGroup: 'Hi {parent}, a reminder of youth interviews tomorrow:\n{list}\nSee you there!',
  tplFollowGroup: "Hi {parent}, just checking whether these times on {day} work for {youth}'s interviews:\n{list}\nHappy to find other times if that's easier."
};
const GROUP_KEY = { confirm: 'tplConfirmGroup', remind: 'tplReminderGroup', follow: 'tplFollowGroup' };
const joinNames = n => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

export function groupMessage(data, appts, kind, rec) {
  const first = name => String(name).split(' ')[0];
  const kids = appts.map(a => { const c = data.children.find(x => x.id === a.childId); return c ? c.first : ''; });
  const samePlace = appts.every(a => a.place === appts[0].place);
  const list = appts.map((a, i) => `• ${time12(phxTime(a.startsAt))} – ${first(kids[i])} with ${longName(data, a.interviewer)}${samePlace ? '' : ` (${a.place || 'church'})`}`).join('\n')
    + (samePlace && appts[0].place ? `\nAll in the ${appts[0].place}.` : '');
  const key = GROUP_KEY[kind];
  return fillTemplate(data.settings[key] || GROUP_TEMPLATES[key], {
    parent: rec.greet, youth: joinNames(kids.map(first)), day: dayLong(phxDate(appts[0].startsAt)), list, me: data.settings.me || ''
  });
}
