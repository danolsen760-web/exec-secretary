// Shared naming + date helpers (used by the browser and the server).

export const MEETINGS = {
  B: { name: 'Bishopric Meeting', short: 'Bishopric', file: 'Bishopric', keyword: 'Bishopric', folderKey: 'bishopricFolder' },
  W: { name: 'Ward Council', short: 'Ward Council', file: 'Council', keyword: 'Council', folderKey: 'councilFolder' }
};

export function shortName(l) {
  if (!l) return '';
  return l.title === 'Bishop' ? `Bishop ${l.last}` : `${l.title} ${l.last}`;
}

// Matches the attendee lines on the current agendas.
export function attendeeLine(leaders, ids, meeting) {
  return leaders
    .filter(l => ids.includes(l.id))
    .map(l => (l.title === 'Bishop'
      ? (meeting === 'W' ? `Bishop ${l.first} ${l.last}` : `Bishop ${l.last}`)
      : `${l.first} ${l.last} (${l.calling})`))
    .join(', ');
}

const parse = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
export const longDate = iso => parse(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
export const sundayLabel = iso => parse(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
export const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return toIso(d); };
export const isSunday = iso => parse(iso).getDay() === 0;

// Is this Sunday one of the Ward Council Sundays (e.g. "2,4")?
export function isCouncilSunday(iso, councilSundays) {
  const nth = Math.ceil(parse(iso).getDate() / 7);
  return String(councilSundays || '2,4').split(/[\s,]+/).map(Number).includes(nth);
}

export function fileName(pattern, iso, meeting) {
  return String(pattern || '{yy}_{MMdd}_Cienega_Ward_{meeting}_Meeting')
    .replace('{yy}', iso.slice(2, 4))
    .replace('{MMdd}', iso.slice(5, 7) + iso.slice(8, 10))
    .replace('{meeting}', MEETINGS[meeting].file);
}

export const fillTemplate = (tpl, values) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
