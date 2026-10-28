// Matches names as written in Wardbullet ("Jim Talbot", "Bishop Bryner") to people on the LCR member list
// ("Talbot, James Allen"). Runs in the browser and on the server.

export const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => norm(s).replace(/ /g, '');

const NICKS = [
  ['james', 'jim', 'jimmy', 'jamie'], ['mitchell', 'mitch'], ['richard', 'rick', 'ricky', 'rich', 'dick'], ['christopher', 'chris'],
  ['christina', 'chris', 'christy', 'tina'], ['david', 'dave', 'davey'], ['donald', 'donnie', 'don'], ['joseph', 'joe', 'joey'],
  ['abraham', 'abe', 'abraao'], ['abraao', 'abe'], ['benjamin', 'ben', 'benji'], ['matthew', 'matt'], ['timothy', 'tim', 'timmy'],
  ['katherine', 'kate', 'katie', 'kathy', 'kat'], ['catherine', 'kate', 'katie', 'cathy'], ['katrina', 'kate', 'katie', 'trina'],
  ['jacob', 'jake'], ['john', 'johnny', 'jack', 'jon'], ['jonathan', 'jon', 'johnny'], ['william', 'will', 'bill', 'billy', 'liam'],
  ['robert', 'rob', 'bob', 'bobby', 'robbie', 'bert'], ['samuel', 'sam', 'sammy'], ['samantha', 'sam', 'sammy'], ['nathan', 'nate'],
  ['nathaniel', 'nate', 'nathan'], ['susan', 'sue', 'susie'], ['suzanne', 'sue', 'suzy'], ['margaret', 'peggy', 'maggie', 'meg', 'marge'],
  ['nancy', 'nan'], ['curtis', 'curt'], ['terrance', 'terry'], ['terence', 'terry'], ['teresa', 'terry', 'tess'], ['thomas', 'tom', 'tommy'],
  ['michael', 'mike', 'mikey'], ['steven', 'steve'], ['stephen', 'steve'], ['daniel', 'dan', 'danny'], ['anthony', 'tony'],
  ['elizabeth', 'liz', 'beth', 'betsy', 'eliza', 'lizzy'], ['jennifer', 'jen', 'jenny'], ['rebecca', 'becky', 'becca'],
  ['kimberly', 'kim'], ['patricia', 'pat', 'patty', 'trish'], ['andrew', 'andy', 'drew'], ['zachary', 'zach', 'zack'],
  ['alexander', 'alex', 'xander'], ['alexandra', 'alex', 'lexi'], ['gregory', 'greg'], ['kenneth', 'ken', 'kenny'], ['jeffrey', 'jeff'],
  ['douglas', 'doug'], ['lawrence', 'larry'], ['raymond', 'ray'], ['ronald', 'ron', 'ronnie'], ['gerald', 'jerry'],
  ['edward', 'ed', 'eddie', 'ted'], ['theodore', 'ted', 'teddy', 'theo'], ['charles', 'charlie', 'chuck'], ['frederick', 'fred'],
  ['randall', 'randy'], ['randal', 'randy'], ['philip', 'phil'], ['phillip', 'phil'], ['nicholas', 'nick'], ['joshua', 'josh'],
  ['jessica', 'jess', 'jessie'], ['victoria', 'tori', 'vicki'], ['madison', 'maddie'], ['abigail', 'abby'], ['tamara', 'tami', 'tammy'],
  ['deborah', 'debbie', 'deb'], ['pamela', 'pam'], ['cynthia', 'cindy'], ['sandra', 'sandy'], ['judith', 'judy'], ['barbara', 'barb'],
  ['gabriel', 'gabe'], ['isaac', 'ike'], ['benson', 'ben'], ['emily', 'em'], ['eleanor', 'ellie', 'nora'], ['oliver', 'ollie'],
  ['harold', 'harry', 'hal'], ['henry', 'hank'], ['leonard', 'leo', 'len'], ['vincent', 'vince'], ['wesley', 'wes'], ['bradley', 'brad'],
  ['jeremiah', 'jeremy'], ['jerome', 'jerry'], ['carolyn', 'carol'], ['caroline', 'carol'], ['mary louise', 'mary'], ['allison', 'allie'],
  ['tomasina', 'tomi'], ['naomi', 'nomi'], ['shawn', 'sean', 'shaun'], ['sean', 'shawn', 'shaun']
];
const nickMap = new Map();
NICKS.forEach(g => g.forEach(a => g.forEach(b => { if (a !== b) { if (!nickMap.has(a)) nickMap.set(a, new Set()); nickMap.get(a).add(b); } })));

function dist(a, b) { // edit distance, small strings only
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// How well a written first name fits a member's given names. 0 = no.
function firstScore(written, member) {
  const w = norm(written);
  if (!w) return 0;
  const given = norm(member.first);
  const words = given.split(' ');
  const goes = norm(member.goesBy);
  if (w === given || (goes && w === goes)) return 5;
  if (w === words[0]) return 4.5;
  if (words.includes(w)) return 3.5; // goes by a middle name
  const w1 = w.split(' ')[0];
  const nicks = nickMap.get(w1);
  if (nicks && (nicks.has(words[0]) || (goes && nicks.has(goes)))) return 3.5;
  if (w1.length >= 3 && words[0].startsWith(w1)) return 3; // Chris → Christopher
  if (w1.length >= 4 && dist(w1, words[0]) <= 1) return 2.5; // Randall/Randal, Kendal/Kendall
  if (w1.length >= 5 && words[0].length >= 5 && dist(w1, words[0]) <= 2) return 1.5;
  return 0;
}
function lastScore(written, member) {
  const w = squash(written), l = squash(member.last);
  if (!w) return 0;
  if (w === l) return 3;
  if (l.length >= 6 && dist(w, l) <= 1) return 2; // Vilas Bolas / Vilas Boas
  if (l.includes('-') || norm(member.last).includes(' ')) { if (norm(member.last).split(' ').includes(norm(written))) return 2; }
  return 0;
}

const TITLES = /^(brother|bro|sister|sis|bishop|president|pres|elder|dr|mr|mrs|ms)\.?\s+/i;

/** Splits "Bishop Bryner" into { title: 'bishop', rest: 'Bryner' }. */
export function splitTitle(name) {
  const s = String(name || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const m = s.match(TITLES);
  return m ? { title: norm(m[1]).replace(/^bro$/, 'brother').replace(/^sis$/, 'sister').replace(/^pres$/, 'president'), rest: s.slice(m[0].length).trim() } : { title: '', rest: s };
}

/**
 * Finds who a written name refers to.
 * Returns { member, candidates, visitor } — member when there's one clear match.
 */
export function matchName(name, members, leaders = []) {
  const { title, rest } = splitTitle(name);
  const key = norm(name);
  // Names you matched by hand before
  const known = members.filter(m => String(m.aliases || '').split('|').map(norm).includes(key));
  if (known.length === 1) return { member: known[0], candidates: known, visitor: false };

  const tokens = rest.split(' ').filter(Boolean);
  const scored = [];
  if (tokens.length === 1) {
    // Only a last name: "Bishop Bryner", "Brother Rand", "Elder Olsen"
    let pool = members.filter(m => lastScore(tokens[0], m) >= 3);
    if (title === 'bishop') {
      const l = leaders.find(x => x.title === 'Bishop' && norm(x.last) === norm(tokens[0]));
      if (l) pool = pool.filter(m => firstScore(l.first, m) >= 3);
    } else if (title === 'elder' || title === 'president') {
      return { member: null, candidates: [], visitor: true }; // missionaries and stake leaders
    } else if (title === 'brother') pool = pool.filter(m => m.gender === 'M');
    else if (title === 'sister') pool = pool.filter(m => m.gender === 'F');
    pool = pool.filter(m => ageOf(m) >= 18);
    return { member: pool.length === 1 ? pool[0] : null, candidates: pool, visitor: false };
  }
  for (let i = 1; i < tokens.length; i++) {
    const first = tokens.slice(0, i).join(' '), last = tokens.slice(i).join(' ');
    for (const m of members) {
      const ls = lastScore(last, m);
      if (!ls) continue;
      const fs = firstScore(first, m);
      if (!fs) continue;
      scored.push({ m, s: ls + fs });
    }
  }
  const best = new Map();
  scored.forEach(x => { if (!best.has(x.m) || best.get(x.m) < x.s) best.set(x.m, x.s); });
  const list = [...best.entries()].sort((a, b) => b[1] - a[1]);
  const candidates = list.map(x => x[0]);
  if (!list.length) {
    // Nothing close: offer people with the same last name to choose from
    const same = members.filter(m => lastScore(tokens.slice(1).join(' ') || tokens[0], m) >= 2 || lastScore(tokens[tokens.length - 1], m) >= 3);
    return { member: null, candidates: same.filter(m => ageOf(m) >= 8), visitor: title === 'elder' || title === 'president' };
  }
  const top = list[0][1];
  const tied = list.filter(x => x[1] === top);
  // Two people with the same name (a father and son, say): pick the adult only when the other is a child
  if (tied.length > 1) {
    const adults = tied.filter(x => ageOf(x[0]) >= 18);
    if (adults.length === 1 && tied.every(x => x[0] === adults[0][0] || ageOf(x[0]) < 12)) return { member: adults[0][0], candidates, visitor: false };
    return { member: null, candidates, visitor: false };
  }
  return { member: top >= 4.5 ? list[0][0] : null, candidates, visitor: false };
}

export function ageOf(m, onIso) {
  if (!m.birthDate) return Number(m.age) || 0;
  const [y, mo, d] = m.birthDate.split('-').map(Number);
  const on = onIso ? onIso.split('-').map(Number) : (() => { const t = new Date(); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; })();
  let a = on[0] - y;
  if (on[1] < mo || (on[1] === mo && on[2] < d)) a--;
  return a;
}

/** "Talbot, April Dawn" (goes by April Dawn) → "April Dawn Talbot" */
export function displayName(m) {
  if (!m) return '';
  const first = m.goesBy || String(m.first || '').split(' ')[0];
  return `${first} ${m.last}`;
}
