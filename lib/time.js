// Arizona time helpers. Arizona is UTC-7 all year (no daylight saving).
const OFFSET = 7 * 3600 * 1000;

export const phx = (date, time) => new Date(`${date}T${time}:00-07:00`);
export const phxDate = d => new Date(new Date(d).getTime() - OFFSET).toISOString().slice(0, 10);
export const phxTime = d => new Date(new Date(d).getTime() - OFFSET).toISOString().slice(11, 16);
export const phxDow = date => new Date(`${date}T12:00:00-07:00`).getUTCDay();
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function addDaysIso(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1 + n, d, 12));
  return x.toISOString().slice(0, 10);
}

export function time12(hhmm) {
  let [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export const dayLong = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
export const dayShort = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
export const toMinutes = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
export const fromMinutes = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
