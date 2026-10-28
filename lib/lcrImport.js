// Reads two lists copied from LCR (Leader and Clerk Resources) and turns them into families.
//  1. Household list: "Last, Heads" heading, members with ages, address, household phone/email.
//  2. Member list: "Last, First", gender, age, birth date, phone, email (one person per entry).
// Runs in the browser. Nothing is saved until you confirm the preview.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const FLAGS = /^(out-of-unit|not baptized|not a member|deceased|moved)$/i;
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = s => String(s || '').replace(/\D/g, '');
const blocks = text => String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim())).filter(b => b.length);

function phoneOf(s) {
  const d = digits(s);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 7) return `(520) ${d.slice(0, 3)}-${d.slice(3)}`; // local numbers listed without an area code
  return ''; // anything else isn't a usable mobile number
}

function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return { day: Number(m[1]), month: MONTHS[m[2].toLowerCase()], year: Number(m[3]) };
}

/* ---------- Member list ---------- */
export function parseMembers(text) {
  const out = [];
  for (const b of blocks(text)) {
    const tokens = b.join('\t').split('\t').map(t => t.trim());
    const name = tokens[0];
    if (!name || !name.includes(',')) continue; // header rows
    const g = tokens.findIndex((t, i) => i > 0 && /^[MF]$/.test(t));
    if (g < 0) continue;
    const flags = tokens.slice(1, g).filter(t => FLAGS.test(t));
    const [last, first] = name.split(',').map(s => s.trim());
    out.push({
      last, first, full: `${last}, ${first}`, gender: tokens[g],
      age: parseInt(tokens[g + 1], 10), birth: parseDate(tokens[g + 2]),
      phone: phoneOf(tokens[g + 3]), email: /@/.test(tokens[g + 4] || '') ? tokens[g + 4] : '',
      flags
    });
  }
  return out;
}

/* ---------- Household list ---------- */
export function parseHouseholds(text) {
  const out = [];
  for (const b of blocks(text)) {
    const head = b[0].trim();
    if (!head.includes(',') || /^household members/i.test(head)) continue;
    const comma = head.indexOf(',');
    const family = head.slice(0, comma).trim();
    const headNames = head.slice(comma + 1).split('&').map(s => s.trim()).filter(Boolean);
    const members = [];
    let i = 1;
    for (; i < b.length; i++) {
      const line = b[i].trim();
      const m = line.match(/^(.+?)\s*\((\d+)\)$/);
      if (m) {
        const nm = m[1].trim();
        const own = nm.includes(',') ? nm.split(',').map(s => s.trim()) : null;
        members.push({ last: own ? own[0] : family, first: own ? own[1] : nm, age: Number(m[2]), flags: [] });
        continue;
      }
      if (FLAGS.test(line) && members.length) { members[members.length - 1].flags.push(line); continue; }
      break;
    }
    // Remaining lines: address, then a contact line (phone and/or email)
    let phone = '', email = '';
    const rest = b.slice(i);
    if (rest.length) {
      const last = rest[rest.length - 1];
      const parts = last.split('\t').map(s => s.trim()).filter(Boolean);
      const contact = parts.some(p => /@/.test(p) || digits(p).length >= 7);
      if (contact && (rest.length > 2 || /@/.test(last) || /\t/.test(last) || /^\(?\d{3}\)?[\s-]*\d{3}-\d{4}$/.test(last.trim()))) {
        parts.forEach(p => { if (/@/.test(p)) email = p; else if (!phone) phone = phoneOf(p); });
        rest.pop();
      }
    }
    out.push({ key: head, family, headNames, members, address: rest.join(', '), phone, email });
  }
  return out;
}

/* ---------- Put the two lists together ---------- */
export function findMember(people, last, first, age) {
  const full = norm(`${last} ${first}`);
  let hit = people.filter(p => norm(`${p.last} ${p.first}`) === full);
  if (hit.length === 1) return hit[0];
  const firstWord = norm(first).split(' ')[0];
  hit = people.filter(p => norm(p.last) === norm(last) && norm(p.first).split(' ')[0] === firstWord && (!age || Math.abs(p.age - age) <= 1));
  if (hit.length === 1) return hit[0];
  hit = people.filter(p => norm(p.first).split(' ')[0] === firstWord && p.age === age);
  return hit.length === 1 ? hit[0] : null;
}

const isYouthAge = age => age >= 11 && age <= 17;

/**
 * Returns families ready to preview.
 * Each: { key, family, parents: [{ title, first, phone, email, member }], kids: [...], youth, notes }
 */
export function buildFamilies(householdText, memberText) {
  const households = parseHouseholds(householdText);
  const people = parseMembers(memberText);
  const used = new Set();

  const fams = households.map(h => {
    const resolved = h.members.map(m => {
      const p = findMember(people, m.last, m.first, m.age);
      if (p) used.add(p);
      return { ...m, person: p };
    });
    // Heads of household are the names in the heading (e.g. "Joe & Sonja")
    const headFirsts = h.headNames.map(n => norm(n).split(' ')[0]).filter(w => w && w !== 'mr' && w !== 'mrs');
    const sameFamily = m => norm(h.family).split(' ').includes(norm(m.last).split(' ').pop()) || norm(m.last) === norm(h.family);
    const isHead = m => sameFamily(m) && headFirsts.includes(norm(m.first).split(' ')[0]) && m.age >= 18;
    let heads = resolved.filter(isHead);
    // A single adult listed first in a one-name heading is the head too
    if (!heads.length && resolved[0] && resolved[0].age >= 18 && h.headNames.length === 1) heads = [resolved[0]];
    // Heading lists one parent, but a spouse-aged adult with the same last name lives there too
    if (heads.length === 1 && h.headNames.length === 1) {
      const spouse = resolved.find(m => !heads.includes(m) && sameFamily(m) && m.age >= 25 && Math.abs(m.age - heads[0].age) <= 15);
      if (spouse) heads = [heads[0], spouse];
    }

    const parents = heads.slice(0, 2).map(m => {
      const p = m.person || {};
      return { title: p.gender === 'F' ? 'Sis.' : 'Bro.', first: m.first.split(' ')[0] === m.first ? m.first : m.first, phone: p.phone || '', email: p.email || '', member: true };
    });
    // Spouse named in the heading but not listed (usually not a member): keep the name, no phone
    if (parents.length === 1 && h.headNames.length === 2) {
      const missing = h.headNames.find(n => !heads.some(m => norm(m.first).split(' ')[0] === norm(n).split(' ')[0]));
      if (missing && !/^mr\.?$/i.test(missing)) {
        parents.push({ title: parents[0].title === 'Bro.' ? 'Sis.' : 'Bro.', first: missing.split(' ')[0], phone: '', email: '', member: false });
      }
    }
    // The household phone belongs to the first head if they don't have their own
    if (parents[0] && !parents[0].phone && h.phone) parents[0].phone = h.phone;
    const parentPhones = new Set(parents.map(p => digits(p.phone)).concat(digits(h.phone)).filter(Boolean));

    const kids = resolved.filter(m => !heads.includes(m) && m.age < 18).map(m => {
      const p = m.person;
      const ownPhone = p && p.phone && !parentPhones.has(digits(p.phone)) ? p.phone : '';
      return {
        first: m.first, last: m.last, age: m.age,
        birth: p && p.birth ? p.birth : null,
        phone: ownPhone,
        flags: [...new Set([...(m.flags || []), ...((p && p.flags) || [])])],
        youth: isYouthAge(m.age)
      };
    });
    const youth = kids.filter(k => k.youth);
    const outOfUnitOnly = youth.length > 0 && youth.every(k => k.flags.some(f => /out-of-unit/i.test(f)));
    const noParents = parents.length === 0;

    // A youth living without a member parent: they're their own contact
    if (noParents) {
      kids.forEach(k => {
        const p = resolved.find(m => m.first === k.first)?.person;
        if (!k.phone && p && p.phone) k.phone = p.phone;
        if (!k.phone && h.phone) k.phone = h.phone;
        k.textSelf = true;
      });
    }
    const notes = [];
    if (outOfUnitOnly) notes.push('Out-of-Unit');
    if (noParents) notes.push('No parent in household');
    if (kids.some(k => !k.birth)) notes.push('Missing a birthday');
    if (!noParents && !parents.some(p => p.phone)) notes.push('No parent phone');

    // Who gets youth texts: first parent with a phone
    const textTo = parents.findIndex(p => p.phone) + 1 || 1;
    return { key: h.key, family: h.family, parents, kids, youth: youth.length, textTo, notes, outOfUnitOnly, adultsOnly: kids.length === 0 };
  });

  return { families: fams, householdCount: households.length, memberCount: people.length, unmatched: people.filter(p => !used.has(p)) };
}

/** Find a family you already entered by last name + a parent's or child's first name. */
export function matchExisting(fam, data) {
  const first = s => norm(s).split(' ')[0];
  return data.households.find(h => {
    if (norm(h.family) !== norm(fam.family)) return false;
    const pNames = [h.p1First, h.p2First].filter(Boolean).map(first);
    const kNames = data.children.filter(c => c.householdId === h.id).map(c => first(c.first));
    return fam.parents.some(p => pNames.includes(first(p.first))) || fam.kids.some(k => kNames.includes(first(k.first)));
  }) || null;
}
