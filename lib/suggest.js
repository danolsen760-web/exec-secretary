// Suggestions for the Agenda Builder (runs in the browser).
import { suggestionPool } from './hymns';
import { addDays, isCouncilSunday, toIso } from './names';

// Saturday prep → tomorrow. Sunday before 3 pm → today. Otherwise the coming Sunday.
export function defaultSunday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getDay() === 0 && now.getHours() < 15) return toIso(d);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return toIso(d);
}

export const meetingsOn = (iso, settings) => (isCouncilSunday(iso, settings.councilSundays) ? ['B', 'W'] : ['B']);

export function defaultAttendees(data, m) {
  return data.leaders.filter(l => l.active !== false && (m === 'B' ? l.bishopric : l.council)).map(l => l.id);
}

/** Who prayed / gave a thought most recently (this meeting, before this date). */
export function lastDone(data, m, date) {
  const prayed = {}, thought = {};
  data.agendas
    .filter(a => a.meeting === m && a.date < date && !a.skipped)
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(a => {
      [a.openPrayer, a.closePrayer].forEach(id => { if (id && !prayed[id]) prayed[id] = a.date; });
      if (a.thought && !thought[a.thought]) thought[a.thought] = a.date;
    });
  return { prayed, thought };
}

/** Attendees ordered by who has gone longest (never first). */
export function rotation(data, attendees, lastMap, exclude = []) {
  const order = data.leaders.map(l => l.id);
  return attendees
    .filter(id => !exclude.includes(id))
    .sort((a, b) => (lastMap[a] || '').localeCompare(lastMap[b] || '') || order.indexOf(a) - order.indexOf(b));
}

/** Hymn numbers to suggest, in a stable shuffled order for this date + meeting. */
export function hymnCandidates(data, m, date, avoid) {
  const cutoff = addDays(date, -182);
  const recent = new Set(data.agendas.filter(a => a.date >= cutoff && a.date < date && a.hymn).map(a => a.hymn));
  let pool = suggestionPool(date).filter(n => !recent.has(n) && n !== avoid);
  if (!pool.length) pool = suggestionPool(date);
  let seed = 0;
  for (const ch of date + m) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Starting picks: saved agenda if there is one, otherwise suggestions. */
export function initialPicks(data, m, date, otherHymn) {
  const saved = data.agendas.find(a => a.meeting === m && a.date === date && !a.skipped);
  if (saved) {
    return {
      attendees: saved.attendees, hymn: saved.hymn, openPrayer: saved.openPrayer, closePrayer: saved.closePrayer,
      thought: saved.thought, thoughtNote: saved.thoughtNote || '', nextThought: saved.nextThought, nextNote: saved.nextNote || '', hymnIdx: 0
    };
  }
  const attendees = defaultAttendees(data, m);
  const prev = data.agendas.filter(a => a.meeting === m && a.date < date && !a.skipped).sort((a, b) => b.date.localeCompare(a.date))[0];
  const { prayed, thought: thoughtLast } = lastDone(data, m, date);
  const thought = prev && prev.nextThought && attendees.includes(prev.nextThought)
    ? prev.nextThought : rotation(data, attendees, thoughtLast)[0];
  const openPrayer = rotation(data, attendees, prayed, [thought])[0] || null;
  const closePrayer = rotation(data, attendees, prayed, [thought, openPrayer])[0] || null;
  const nextThought = rotation(data, attendees, thoughtLast, [thought])[0] || null;
  return {
    attendees, hymn: hymnCandidates(data, m, date, otherHymn)[0], openPrayer, closePrayer,
    thought, thoughtNote: prev && prev.nextThought === thought ? prev.nextNote || '' : '',
    nextThought, nextNote: '', hymnIdx: 0
  };
}

// Meeting Mode opens on today if it's Sunday, otherwise the coming Sunday.
export function meetingSunday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getDay() !== 0) d.setDate(d.getDate() + (7 - d.getDay()));
  return toIso(d);
}
