// Sacrament prayer suggestions, slot status, and texts. Runs in the browser.
import { ageOf, displayName, matchName } from './prayerNames';
import { addDaysIso, phxDow, dayLong } from './time';
import { fillTemplate } from './names';

export const SLOTS = [
  { key: 'open', label: 'Opening prayer', kind: 'invocation', word: 'opening prayer' },
  { key: 'close', label: 'Closing prayer', kind: 'benediction', word: 'closing prayer' }
];
const slotOf = key => SLOTS.find(s => s.key === key);

export const md = iso => { const [, m, d] = iso.split('-').map(Number); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`; };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);
export const ago = (iso, today) => {
  const d = daysBetween(iso, today);
  if (d < 0) return md(iso);
  if (d === 0) return 'today';
  if (d < 7) return 'last Sunday';
  if (d < 63) return `${Math.round(d / 7)} wk ago`;
  return `${Math.round(d / 30.4)} mo ago`;
};
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? d : Number(v));

export const PRAYER_TEXTS = {
  tplPrayerAsk: 'Hi {name}, this is {me}. The bishopric would like to invite you to give the {prayer} in sacrament meeting on {day}. Would you be able to? Thank you!',
  tplPrayerAskParent: 'Hi {parent}, this is {me}. The bishopric would like to invite {name} to give the {prayer} in sacrament meeting on {day}. Would that work? Thank you!',
  tplPrayerRemind: "Hi {name}, just a reminder that you're giving the {prayer} in sacrament meeting {when}. Thank you! – {me}",
  tplPrayerRemindParent: 'Hi {parent}, just a reminder that {name} is giving the {prayer} in sacrament meeting {when}. Thank you! – {me}'
};

export function prayerConfig(S) {
  return {
    baptizedOnly: S.prBaptizedOnly !== 'FALSE',
    minAge: num(S.prMinAge, 12),
    spokeWeeks: num(S.prSpokeWeeks, 8),
    prayedMonths: num(S.prPrayedMonths, 6),
    askedWeeks: num(S.prAskedWeeks, 4),
    needPhone: S.prNeedPhone !== 'FALSE',
    activeFirst: S.prActiveFirst !== 'FALSE',
    mix: S.prMix !== 'FALSE',
    skipBishopric: S.prSkipBishopric !== 'FALSE',
    weeksAhead: num(S.prWeeksAhead, 3)
  };
}

/** The next Sundays, starting today if it's Sunday. */
export function upcomingSundays(today, n) {
  const dow = phxDow(today);
  const first = dow === 0 ? today : addDaysIso(today, 7 - dow);
  return Array.from({ length: n }, (_, i) => addDaysIso(first, i * 7));
}

export function makePrayers(data) {
  const today = data.today;
  const cfg = prayerConfig(data.settings);
  const all = data.wardMembers || [];
  const members = all.filter(m => m.active !== false);
  const byId = new Map(all.map(m => [m.id, m]));
  const history = data.sacramentHistory || [];
  const asks = data.prayerAsks || [];
  const days = data.sacramentDays || [];

  const push = (map, id, v) => { if (!map.has(id)) map.set(id, []); map.get(id).push(v); };
  const spoke = new Map(), prayed = new Map();
  history.forEach(h => { if (h.memberId) push(h.kind === 'speaker' ? spoke : prayed, h.memberId, h.date); });
  asks.forEach(a => { if (a.status === 'yes') push(prayed, a.memberId, a.date); });
  [spoke, prayed].forEach(map => map.forEach(v => v.sort()));

  // The bishop and his counselors conduct, so they aren't asked
  const bishopric = new Set((data.leaders || []).filter(l => l.active !== false && l.bishopric && /bishop|counselor/i.test(`${l.title} ${l.calling}`))
    .map(l => matchName(`${l.first} ${l.last}`, members).member).filter(Boolean).map(m => m.id));

  const houseOf = m => m.household || `id:${m.id}`;
  const yearAgo = addDaysIso(today, -400);
  const activeHouses = new Set();
  [spoke, prayed].forEach(map => map.forEach((dates, id) => { const m = byId.get(id); if (m && dates.some(d => d >= yearAgo)) activeHouses.add(houseOf(m)); }));

  const lastBefore = (map, id, iso) => { const v = (map.get(id) || []).filter(d => d <= iso); return v.length ? v[v.length - 1] : ''; };
  const housemates = m => (m.household ? members.filter(x => x.household === m.household && x.id !== m.id) : []);

  /** Who gets the text: the person, or a parent for youth. `useSelf` forces the youth. */
  function contact(m, useSelf) {
    if (!m) return null;
    const age = ageOf(m, today);
    const greet = (m.goesBy || m.first.split(' ')[0]);
    const parents = age < 18 ? housemates(m).filter(x => ageOf(x, today) >= 18 && x.phone)
      .sort((a, b) => (a.last === m.last ? 0 : 1) - (b.last === m.last ? 0 : 1) || (a.gender === 'F' ? 0 : 1) - (b.gender === 'F' ? 0 : 1)) : [];
    const parent = parents[0];
    if (parent && !useSelf) {
      return { phone: parent.phone, parent: true, label: `${parent.gender === 'F' ? 'Sis.' : 'Bro.'} ${displayName(parent)} (parent)`, greet: `${parent.gender === 'F' ? 'Sister' : 'Brother'} ${parent.last}`, name: greet, canSelf: !!m.phone };
    }
    return { phone: m.phone, parent: false, label: displayName(m), greet, name: greet, canParent: !!parent };
  }

  // Asks still active for a slot (asked or said yes)
  const liveAsk = (date, slot) => asks.filter(a => a.date === date && a.slot === slot && (a.status === 'asked' || a.status === 'yes'))
    .sort((a, b) => (b.askedAt || '').localeCompare(a.askedAt || ''))[0] || null;
  const wbEntry = (date, slot) => history.find(h => h.date === date && h.kind === slotOf(slot).kind) || null;

  function slotState(date, slot) {
    const ask = liveAsk(date, slot);
    if (ask) return { type: ask.status === 'yes' ? 'yes' : 'asked', ask, member: byId.get(ask.memberId) };
    const wb = wbEntry(date, slot);
    if (wb) return { type: 'wardbullet', entry: wb, member: wb.memberId ? byId.get(wb.memberId) : null, name: wb.name };
    return { type: 'open' };
  }
  const dayInfo = date => days.find(d => d.date === date && d.noMeeting) || null;
  const speakersOn = date => history.filter(h => h.date === date && h.kind === 'speaker');

  /** Why someone wouldn't be suggested for this Sunday. Empty list = OK. */
  function reasons(m, date, other) {
    const out = [];
    if (cfg.skipBishopric && bishopric.has(m.id)) out.push('Bishopric');
    if (m.neverAsk) out.push(m.note ? `Don't ask: ${m.note}` : "On your don't-ask list");
    if (cfg.baptizedOnly && /not baptized/i.test(m.flags || '')) out.push('Not baptized');
    const age = ageOf(m, date);
    if (age < cfg.minAge) out.push(`Age ${age}`);
    if (cfg.needPhone && !(contact(m) || {}).phone) out.push('No phone');
    if (cfg.spokeWeeks > 0) {
      const s = (spoke.get(m.id) || []).find(d => d <= date && d >= addDaysIso(date, -7 * cfg.spokeWeeks));
      if (s) out.push(s === date ? 'Speaking that Sunday' : `Spoke ${md(s)}`);
    }
    const sched = asks.find(a => a.memberId === m.id && (a.status === 'asked' || a.status === 'yes') && a.date >= today);
    if (sched) out.push(`${sched.status === 'yes' ? 'Praying' : 'Asked for'} ${md(sched.date)}`);
    const wb = history.find(h => h.memberId === m.id && h.kind !== 'speaker' && h.date >= today);
    if (wb && !sched) out.push(`Praying ${md(wb.date)}`);
    if (cfg.askedWeeks > 0) {
      const since = new Date(Date.now() - cfg.askedWeeks * 7 * 864e5).toISOString();
      const no = asks.find(a => a.memberId === m.id && (a.status === 'no' || a.status === 'noreply') && (a.answeredAt || a.askedAt) >= since);
      if (no) out.push(no.status === 'no' ? `Said no ${md((no.answeredAt || no.askedAt).slice(0, 10))}` : 'Didn\'t reply last time');
    }
    if (other && (other.id === m.id || (m.household && other.household === m.household))) out.push(other.id === m.id ? 'Giving the other prayer' : 'Same family as the other prayer');
    return out;
  }

  function info(m, date) {
    const lp = lastBefore(prayed, m.id, today), ls = lastBefore(spoke, m.id, today);
    const bits = [`${ageOf(m, date)}`, lp ? `Prayed ${ago(lp, today)}` : 'No prayer in the past year', ls ? `Spoke ${ago(ls, today)}` : null];
    return { lastPrayed: lp, lastSpoke: ls, line: bits.filter(Boolean).join(' · '), active: activeHouses.has(houseOf(m)) };
  }

  /** Everyone, best fit first, for one slot. */
  function ranked(date, slot, other, { includeSkipped = false } = {}) {
    const cutoff = cfg.prayedMonths > 0 ? addDaysIso(date, -Math.round(cfg.prayedMonths * 30.44)) : null;
    const list = members.map(m => {
      const why = reasons(m, date, other);
      const i = info(m, date);
      const recent = cutoff && i.lastPrayed && i.lastPrayed > cutoff ? 1 : 0;
      const sleepy = cfg.activeFirst && !i.active ? 1 : 0;
      const same = cfg.mix && other && other.gender && m.gender === other.gender ? 1 : 0;
      return { m, why, info: i, key: [recent, sleepy, same, i.lastPrayed || '0000', hash(m.id + date + slot)] };
    });
    return list
      .filter(x => includeSkipped || !x.why.length)
      .sort((a, b) => (a.why.length ? 1 : 0) - (b.why.length ? 1 : 0) || a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.key[3].localeCompare(b.key[3]) || a.key[4] - b.key[4]);
  }

  /**
   * The plan for the coming Sundays: each slot's status, or a suggestion for open ones.
   * `offsets` maps "date|slot" → how many times you tapped "Someone else".
   */
  function plan(offsets = {}) {
    const taken = new Set();
    return upcomingSundays(today, Math.max(1, cfg.weeksAhead)).map(date => {
      const skip = dayInfo(date);
      const states = SLOTS.map(s => ({ ...s, state: skip ? { type: 'none' } : slotState(date, s.key) }));
      if (!skip) {
        states.forEach(s => { if (s.state.member) taken.add(s.state.member.id); });
        states.forEach((s, i) => {
          if (s.state.type !== 'open') return;
          const otherSlot = states[1 - i];
          const other = otherSlot.state.member || otherSlot.state.suggestion?.m || null;
          const list = ranked(date, s.key, other).filter(x => !taken.has(x.m.id));
          if (!list.length) return;
          const pick = list[(offsets[`${date}|${s.key}`] || 0) % list.length];
          s.state = { type: 'open', suggestion: pick, poolSize: list.length };
          taken.add(pick.m.id);
        });
      }
      return { date, skip, speakers: speakersOn(date), slots: states };
    });
  }

  function message(kind, m, date, slot, c) {
    const S = data.settings;
    const key = kind === 'ask' ? (c.parent ? 'tplPrayerAskParent' : 'tplPrayerAsk') : (c.parent ? 'tplPrayerRemindParent' : 'tplPrayerRemind');
    const tpl = S[key] || PRAYER_TEXTS[key];
    const diff = daysBetween(today, date);
    const when = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `on ${dayLong(date)}`;
    return fillTemplate(tpl, { name: c.parent ? c.name : c.greet, parent: c.greet, prayer: slotOf(slot).word, day: dayLong(date), when, me: S.me || '' });
  }

  /** Things to do: for Home and the tab badge. */
  function todo() {
    const p = plan();
    const next = p[0];
    const soon = daysBetween(today, next.date) <= 6;
    const out = { open: 0, waiting: 0, remind: [], wardbullet: 0, next };
    p.forEach(w => w.slots.forEach(s => {
      if (s.state.type === 'open' && !w.skip) out.open++;
      if (s.state.type === 'asked') out.waiting++;
      if (s.state.type === 'yes' && !s.state.ask.inWardbullet) out.wardbullet++;
    }));
    if (soon && !next.skip && daysBetween(today, next.date) <= 1) {
      next.slots.forEach(s => {
        const st = s.state;
        if (st.type === 'yes' && !st.ask.remindedAt) out.remind.push(s);
        if (st.type === 'wardbullet' && st.member && !(data.prayerAsks || []).some(a => a.date === next.date && a.slot === s.key)) out.remind.push(s);
      });
    }
    out.badge = (soon ? next.slots.filter(s => s.state.type === 'open' && !next.skip).length : 0) + out.remind.length;
    return out;
  }

  const unmatched = () => {
    const names = new Map();
    history.filter(h => !h.memberId && !h.visitor).forEach(h => names.set(h.name, (names.get(h.name) || 0) + 1));
    return [...names.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  };

  return { cfg, members, byId, contact, slotState, plan, ranked, reasons, info, message, todo, unmatched, spoke, prayed, today };
}
