// Shared date + youth interview logic (runs in the browser).

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const TITLES = ['Bishop', 'Bro.', 'Sis.', 'Pres.', 'Elder'];

export const parseDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const md = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
export const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

export function makeHelpers(data) {
  const today = parseDate(data.today);
  const passed = (bm, bd) => today.getMonth() + 1 > bm || (today.getMonth() + 1 === bm && today.getDate() >= bd);
  const ageOf = c => today.getFullYear() - c.birthYear - (passed(c.birthMonth, c.birthDay) ? 0 : 1);
  const birthYearFrom = (age, bm, bd) => today.getFullYear() - age - (passed(bm, bd) ? 0 : 1);

  const L = id => data.leaders.find(l => l.id === id);
  const short = id => {
    const l = L(id);
    if (!l) return 'Not set';
    return l.title === 'Bishop' ? `Bishop ${l.last}` : `${l.title} ${l.last}`;
  };
  const bishopId = (data.interviewers.find(i => i.kind === 'bishop') || {}).leaderId;
  const counselorIds = data.interviewers.filter(i => i.kind === 'counselor').map(i => i.leaderId);
  const otherCounselor = id => counselorIds.find(c => c !== id) || id;
  const youngCounselor = counselorIds.includes(data.settings.youngCounselor) ? data.settings.youngCounselor : counselorIds[0];
  const ivColor = id => ['var(--c1)', 'var(--c2)', 'var(--c3)'][data.interviewers.findIndex(v => v.leaderId === id)] || 'var(--muted)';

  const household = id => data.households.find(h => h.id === id);
  const kidsOf = id => data.children.filter(c => c.householdId === id);

  /* General Handbook 31.1.8: twice a year, at least once with the bishop;
     from the year a youth turns 16, both with the bishop. */
  function youthInfo(c) {
    if (!c.birthYear) return null;
    const age = ageOf(c);
    if (age < 11 || age > 17) return { age, youth: false };
    const yearAge = today.getFullYear() - c.birthYear;
    const splitAge = data.settings.ageFrom === 'birthday' ? age : yearAge;
    const auto = splitAge <= Number(data.settings.youngMax) ? youngCounselor : otherCounselor(youngCounselor);
    const counselor = c.override && c.override !== 'auto' && c.override !== 'bishop' ? c.override : auto;
    let next;
    if (c.override === 'bishop' || yearAge >= 16 || !c.lastInterview) next = bishopId;
    else next = c.lastWith === bishopId ? counselor : bishopId;
    const due = c.lastInterview ? addMonths(parseDate(c.lastInterview), 6) : null;
    const status = !due ? 'missing' : due < today ? 'over' : (due - today) / 864e5 <= 42 ? 'soon' : 'later';
    return { age, youth: true, next, due, status, counselor };
  }

  function allYouth() {
    return data.children
      .filter(c => c.active !== false)
      .map(c => {
        const h = household(c.householdId);
        if (!h || h.active === false) return null;
        const y = youthInfo(c);
        return y && y.youth ? { c, h, y } : null;
      })
      .filter(Boolean);
  }

  return { today, ageOf, birthYearFrom, L, short, bishopId, counselorIds, otherCounselor, youngCounselor, ivColor, household, kidsOf, youthInfo, allYouth };
}
