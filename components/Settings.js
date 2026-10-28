'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DAYS, TITLES } from '@/lib/youth';
import { dayShort } from '@/lib/time';
import { IvTag, Caret, saver } from './bits';
import { GROUP_TEMPLATES } from '@/lib/ivclient';

export default function Settings({ ctx }) {
  const { data, setOpen, setSetOpen } = ctx;
  const toggle = (id, isOpen) => setSetOpen(prev => { const n = new Set(prev); isOpen ? n.add(id) : n.delete(id); return n; });
  const active = data.leaders.filter(l => l.active !== false);


  return (
    <>
      <SettingsSection id="people" isOpen={setOpen.has('people')} onToggle={toggle} title="Meeting attendees" sub={`${active.length} active · callings, agenda titles, emails`}><Leaders ctx={ctx} /></SettingsSection>
      <SettingsSection id="ivr" isOpen={setOpen.has('ivr')} onToggle={toggle} title="Interviewers and hours" sub="Calendars, times, days off">
        {data.interviewers.map(iv => <InterviewerForm key={iv.id} iv={iv} ctx={ctx} />)}
      </SettingsSection>
      <SettingsSection id="youth" isOpen={setOpen.has('youth')} onToggle={toggle} title="Youth interview rules" sub={data.settings.splitConfirmed === 'TRUE' ? 'Counselor split confirmed' : 'Counselor split not confirmed yet'}><YouthRules ctx={ctx} /></SettingsSection>
      <SettingsSection id="prayers" isOpen={setOpen.has('prayers')} onToggle={toggle} title="Prayer assignments" sub="Who gets suggested for sacrament prayers"><PrayerRules ctx={ctx} /></SettingsSection>
      <SettingsSection id="texts" isOpen={setOpen.has('texts')} onToggle={toggle} title="Text templates" sub="Confirmation, reminder, follow-up"><Templates ctx={ctx} /></SettingsSection>
      <SettingsSection id="rems" isOpen={setOpen.has('rems')} onToggle={toggle} title="My reminders" sub="When your phone reminds you"><Reminders ctx={ctx} /></SettingsSection>
      <SettingsSection id="agendas" isOpen={setOpen.has('agendas')} onToggle={toggle} title="Agendas" sub="Drive folders, file names, email"><AgendaSettings ctx={ctx} /></SettingsSection>
      <SettingsSection id="data" isOpen={setOpen.has('data')} onToggle={toggle} title="Data and sign-in" sub="Backups and signing out"><DataSection ctx={ctx} /></SettingsSection>
      <p className="foot">Times use Arizona time.</p>
    </>
  );
}

function SettingsSection({ id, title, sub, isOpen, onToggle, children }) {
  return (
    <details className="card set" data-set={id} open={isOpen} onToggle={e => { if (e.currentTarget.open !== isOpen) onToggle(id, e.currentTarget.open); }}>
      <summary><div><div className="ttl">{title}</div><div className="sub">{sub}</div></div><Caret /></summary>
      {isOpen && <div className="setbody">{children}</div>}
    </details>
  );
}

/* ---------- Meeting attendees ---------- */
function Leaders({ ctx }) {
  const { data, H } = ctx;
  const [editing, setEditing] = useState(null);
  const active = data.leaders.filter(l => l.active !== false);
  const released = data.leaders.filter(l => l.active === false);
  const meetings = l => [l.bishopric && 'Bishopric', l.council && 'Ward Council'].filter(Boolean).join(', ') || 'No meetings';

  const row = l => editing === l.id
    ? <LeaderForm key={l.id} l={l} ctx={ctx} onDone={() => setEditing(null)} />
    : (
      <div className="lrow" key={l.id}>
        <div>
          <div className="name">{l.first} {l.last}</div>
          <div className="det">{l.calling} · {H.short(l.id)} · {meetings(l)} {!l.email && <span className="pill warn">No email</span>}</div>
        </div>
        <button className="link" type="button" onClick={() => setEditing(l.id)}>Edit</button>
      </div>
    );

  return (
    <>
      {active.map(row)}
      {editing === 'new'
        ? <LeaderForm l={{ id: '', first: '', last: '', calling: '', title: 'Bro.', email: '', phone: '', bishopric: false, council: true, active: true }} ctx={ctx} onDone={() => setEditing(null)} />
        : <button className="btn ghost" type="button" onClick={() => setEditing('new')}>+ Add person</button>}
      {released.length > 0 && <><div className="mini" style={{ marginTop: 6 }}>Released</div>{released.map(row)}</>}
    </>
  );
}

function LeaderForm({ l, ctx, onDone }) {
  const [f, setF] = useState({ ...l });
  const [busy, setBusy] = useState(false);
  const run = saver(ctx);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function save() {
    if (!f.first.trim() || !f.last.trim()) return ctx.toast('Add a first and last name.', true);
    if (await run(setBusy, () => api('/api/leaders', f), `Saved ${f.first} ${f.last}`)) onDone();
  }
  return (
    <div className="box">
      <div className="two">
        <label className="f">First name<input type="text" value={f.first} onChange={e => set('first', e.target.value)} /></label>
        <label className="f">Last name<input type="text" value={f.last} onChange={e => set('last', e.target.value)} /></label>
      </div>
      <div className="two">
        <label className="f">Calling<input type="text" value={f.calling} onChange={e => set('calling', e.target.value)} /></label>
        <label className="f">Title on agenda
          <select value={f.title} onChange={e => set('title', e.target.value)}>{TITLES.map(t => <option key={t}>{t}</option>)}</select>
        </label>
      </div>
      <label className="f">Email (for sending agendas)<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
      <label className="f">Phone<input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
      <div className="checks">
        <label><input type="checkbox" checked={!!f.bishopric} onChange={e => set('bishopric', e.target.checked)} />Bishopric</label>
        <label><input type="checkbox" checked={!!f.council} onChange={e => set('council', e.target.checked)} />Ward Council</label>
        <label><input type="checkbox" checked={f.active !== false} onChange={e => set('active', e.target.checked)} />Active</label>
      </div>
      <div className="sub">When someone is released, uncheck Active and add the new person. Past agendas and history keep the old name.</div>
      <div className="btns">
        <button className="btn ghost" type="button" onClick={onDone}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

/* ---------- Interviewers ---------- */
let calendarCache = null;
function useCalendars() {
  const [cals, setCals] = useState(calendarCache);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (calendarCache) return;
    api('/api/calendars').then(r => { calendarCache = r.calendars; setCals(r.calendars); }).catch(e => setErr(e.message));
  }, []);
  return { cals, err };
}

function InterviewerForm({ iv, ctx }) {
  const { data, H } = ctx;
  const { cals, err } = useCalendars();
  const [f, setF] = useState(() => ({
    id: iv.id, leaderId: iv.leaderId, calendarId: iv.calendarId || '', calendarName: iv.calendarName || '',
    windows: data.windows.filter(w => w.interviewerId === iv.id)
      .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
      .map(w => ({ day: w.day, startTime: w.startTime, endTime: w.endTime, slotMinutes: String(w.slotMinutes), place: w.place }))
  }));
  const [busy, setBusy] = useState(false);
  const [offDate, setOffDate] = useState('');
  const run = saver(ctx);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setW = (i, k, v) => setF(p => ({ ...p, windows: p.windows.map((w, j) => (j === i ? { ...w, [k]: v } : w)) }));
  const active = data.leaders.filter(l => l.active !== false || l.id === iv.leaderId);
  const daysOff = data.daysOff.filter(d => d.interviewerId === iv.id).sort((a, b) => a.date.localeCompare(b.date));
  async function save() {
    for (const w of f.windows) if (w.startTime >= w.endTime) return ctx.toast(`On ${w.day}, the end time needs to be after the start time.`, true);
    await run(setBusy, () => api('/api/interviewers', f), `Saved ${H.short(f.leaderId)}'s interview hours`);
  }
  async function dayOff(date, off) {
    if (!date) return;
    await run(setBusy, () => api('/api/interviews/dayoff', { interviewerId: iv.id, date, off }), off ? 'Day off added' : 'Day off removed');
    setOffDate('');
  }
  return (
    <div className="box">
      <div className="prow"><span className="ttl"><IvTag id={iv.leaderId} H={H} /></span><span className="pill plain">{iv.kind === 'bishop' ? 'Bishop' : 'Counselor'}</span></div>
      <label className="f">Person
        <select value={f.leaderId} onChange={e => set('leaderId', e.target.value)}>
          {active.map(l => <option key={l.id} value={l.id}>{l.first} {l.last} ({l.calling})</option>)}
        </select>
      </label>
      <label className="f">Google Calendar to book into
        {cals ? (
          <select value={f.calendarId} onChange={e => { const c = cals.find(x => x.id === e.target.value); setF(p => ({ ...p, calendarId: e.target.value, calendarName: c ? c.name : '' })); }}>
            <option value="">Choose a calendar</option>
            {cals.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <div className="sub">{err ? `Couldn't load your calendars: ${err}` : 'Loading your calendars…'}{f.calendarName ? ` (now: ${f.calendarName})` : ''}</div>}
      </label>
      <div className="mini">When they interview</div>
      {f.windows.map((w, i) => (
        <div className="windowrow" key={i}>
          <label className="f">Day<select value={w.day} onChange={e => setW(i, 'day', e.target.value)}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></label>
          <label className="f">Minutes each<input type="number" min="5" max="120" step="5" value={w.slotMinutes} onChange={e => setW(i, 'slotMinutes', e.target.value)} /></label>
          <label className="f">From<input type="time" value={w.startTime} onChange={e => setW(i, 'startTime', e.target.value)} /></label>
          <label className="f">To<input type="time" value={w.endTime} onChange={e => setW(i, 'endTime', e.target.value)} /></label>
          <label className="f full">Where<input type="text" value={w.place} onChange={e => setW(i, 'place', e.target.value)} /></label>
          <button className="link full" type="button" onClick={() => setF(p => ({ ...p, windows: p.windows.filter((_, j) => j !== i) }))}>Remove this time</button>
        </div>
      ))}
      <button className="btn ghost" type="button" onClick={() => setF(p => ({ ...p, windows: [...p.windows, { day: 'Sun', startTime: '09:00', endTime: '10:00', slotMinutes: '15', place: p.windows[0]?.place || '' }] }))}>+ Add another time</button>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>

      <div className="mini">Days off</div>
      {daysOff.length === 0 && <div className="sub">None coming up. Interviews are on for every time above.</div>}
      {daysOff.map(d => (
        <div className="prow" key={d.date}><span>{dayShort(d.date)}</span><button className="link" type="button" disabled={busy} onClick={() => dayOff(d.date, false)}>Remove</button></div>
      ))}
      <div className="pick"><input type="date" aria-label="Add a day off" value={offDate} onChange={e => setOffDate(e.target.value)} />
        <button className="swap" type="button" disabled={!offDate || busy} onClick={() => dayOff(offDate, true)}>Add day off</button></div>
    </div>
  );
}

/* ---------- Settings forms that save key/value pairs ---------- */
function useSettingsForm(ctx, keys) {
  const [f, setF] = useState(() => Object.fromEntries(keys.map(k => [k, ctx.data.settings[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const run = saver(ctx);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = (msg, extra = {}) => run(setBusy, () => api('/api/settings', { settings: { ...f, ...extra } }), msg);
  return { f, set, save, busy };
}

function YouthRules({ ctx }) {
  const { H } = ctx;
  const { f, set, save, busy } = useSettingsForm(ctx, ['youngCounselor', 'youngMax', 'ageFrom', 'splitConfirmed']);
  const young = H.counselorIds.includes(f.youngCounselor) ? f.youngCounselor : H.counselorIds[0];
  const max = Number(f.youngMax) || 13;
  const older = H.otherCounselor(young);
  return (
    <>
      <div className="note">General Handbook 31.1.8: each youth meets with a bishopric member twice a year, at least once with the bishop. From the year they turn 16, both are with the bishop.</div>
      <div className="two">
        <label className="f">Younger youth go to
          <select value={young} onChange={e => set('youngCounselor', e.target.value)}>
            {H.counselorIds.map(id => <option key={id} value={id}>{H.short(id)}</option>)}
          </select>
        </label>
        <label className="f">Up to and including age
          <select value={max} onChange={e => set('youngMax', e.target.value)}>{[11, 12, 13, 14, 15].map(a => <option key={a} value={a}>{a}</option>)}</select>
        </label>
      </div>
      <div className="box">
        <div>{H.short(young)}: ages 11–{max}</div>
        <div>{max < 15 ? `${H.short(older)}: ages ${max + 1}–15` : `${H.short(older)}: no youth under 16`}</div>
        <div>{H.short(H.bishopId)}: every other interview, and both from the year they turn 16</div>
      </div>
      <label className="f">Count age for the split from
        <select value={f.ageFrom} onChange={e => set('ageFrom', e.target.value)}>
          <option value="jan1">January 1 (the age they turn this year)</option>
          <option value="birthday">Their birthday</option>
        </select>
      </label>
      <div className="checks"><label><input type="checkbox" checked={f.splitConfirmed === 'TRUE'} onChange={e => set('splitConfirmed', e.target.checked ? 'TRUE' : 'FALSE')} />Confirmed with the bishop</label></div>
      <div className="sub">A family that needs a different counselor can be set on that youth in Members.</div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Youth interview rules saved', { youngCounselor: young })}>{busy ? 'Saving…' : 'Save'}</button></div>
    </>
  );
}

/* ---------- Prayer assignments ---------- */
const PR_KEYS = ['prBaptizedOnly', 'prMinAge', 'prSpokeWeeks', 'prPrayedMonths', 'prAskedWeeks', 'prNeedPhone', 'prActiveFirst', 'prMix', 'prSkipBishopric', 'prWeeksAhead',
  'tplPrayerAsk', 'tplPrayerAskParent', 'tplPrayerRemind', 'tplPrayerRemindParent'];
const PR_DEFAULTS = { prBaptizedOnly: 'TRUE', prMinAge: '12', prSpokeWeeks: '8', prPrayedMonths: '6', prAskedWeeks: '4', prNeedPhone: 'TRUE', prActiveFirst: 'TRUE', prMix: 'TRUE', prSkipBishopric: 'TRUE', prWeeksAhead: '3' };
function PrayerRules({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, PR_KEYS);
  const v = k => (f[k] === '' || f[k] == null ? PR_DEFAULTS[k] : f[k]);
  const box = (k, label) => <label><input type="checkbox" checked={v(k) !== 'FALSE'} onChange={e => set(k, e.target.checked ? 'TRUE' : 'FALSE')} />{label}</label>;
  const sel = (k, label, opts) => (
    <label className="f">{label}
      <select value={v(k)} onChange={e => set(k, e.target.value)}>{opts.map(([val, text]) => <option key={val} value={val}>{text}</option>)}</select>
    </label>
  );
  const weeks = n => (n === 0 ? "Don't skip anyone" : `${n} weeks`);
  return (
    <>
      <div className="checks stackchecks">{box('prBaptizedOnly', 'Baptized members only')}</div>
      <div className="two">
        {sel('prMinAge', 'Minimum age', [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(a => [String(a), `${a} and up`]))}
        {sel('prWeeksAhead', 'Plan ahead', [1, 2, 3, 4, 5, 6, 8].map(n => [String(n), `${n} ${n === 1 ? 'Sunday' : 'Sundays'}`]))}
      </div>
      {sel('prSpokeWeeks', "Don't ask people who spoke in the past", [0, 2, 4, 6, 8, 10, 12, 16, 26].map(n => [String(n), weeks(n)]))}
      {sel('prPrayedMonths', "Prefer people who haven't prayed in the past", [[0, 'No preference'], ...[1, 2, 3, 4, 5, 6, 8, 9, 12].map(n => [n, `${n} ${n === 1 ? 'month' : 'months'}`])].map(([a, b]) => [String(a), b]))}
      {sel('prAskedWeeks', "Don't re-ask people who said no or didn't reply for", [0, 2, 4, 6, 8, 12].map(n => [String(n), n === 0 ? 'No wait' : `${n} weeks`]))}
      <div className="checks stackchecks">
        {box('prNeedPhone', 'Only suggest people I can text (they or a parent have a phone)')}
        {box('prActiveFirst', "Suggest families who've spoken or prayed in the past year first")}
        {box('prMix', 'Try to pair a man and a woman each Sunday')}
        {box('prSkipBishopric', 'Skip the bishop and his counselors')}
      </div>
      <div className="sub">Couples and families are never suggested for both prayers on the same Sunday. Anyone can be left out for good from the Ward list on the Prayers tab.</div>
      <label className="f">Asking · to the person<textarea value={f.tplPrayerAsk} onChange={e => set('tplPrayerAsk', e.target.value)} /></label>
      <label className="f">Asking · to a parent (youth)<textarea value={f.tplPrayerAskParent} onChange={e => set('tplPrayerAskParent', e.target.value)} /></label>
      <label className="f">Reminder · to the person<textarea value={f.tplPrayerRemind} onChange={e => set('tplPrayerRemind', e.target.value)} /></label>
      <label className="f">Reminder · to a parent (youth)<textarea value={f.tplPrayerRemindParent} onChange={e => set('tplPrayerRemindParent', e.target.value)} /></label>
      <div className="legend">Fill-ins: <code>{'{name}'}</code> their first name · <code>{'{parent}'}</code> Sister Torres · <code>{'{prayer}'}</code> opening prayer · <code>{'{day}'}</code> Sunday, Nov 8 · <code>{'{when}'}</code> tomorrow · <code>{'{me}'}</code> your signature</div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Prayer settings saved', Object.fromEntries(Object.keys(PR_DEFAULTS).map(k => [k, v(k)])))}>{busy ? 'Saving…' : 'Save'}</button></div>
    </>
  );
}

const TEMPLATES = [
  ['tplConfirmParent', 'Confirmation · to a parent'], ['tplConfirmAdult', 'Confirmation · adult'],
  ['tplReminderParent', 'Reminder · to a parent'], ['tplReminderAdult', 'Reminder · adult'],
  ['tplFollowParent', 'Follow-up · to a parent'], ['tplFollowAdult', 'Follow-up · adult'], ['tplReschedule', 'New time'],
  ['tplConfirmGroup', 'Confirmation · brothers and sisters together'], ['tplReminderGroup', 'Reminder · brothers and sisters together'], ['tplFollowGroup', 'Follow-up · brothers and sisters together']
];
function Templates({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, ['me', ...TEMPLATES.map(t => t[0])]);
  const val = k => f[k] || GROUP_TEMPLATES[k] || '';
  return (
    <>
      <label className="f">How you sign texts<input type="text" value={f.me} onChange={e => set('me', e.target.value)} /></label>
      {TEMPLATES.map(([k, label]) => (
        <label className="f" key={k}>{label}<textarea value={val(k)} onChange={e => set(k, e.target.value)} /></label>
      ))}
      <div className="legend">
        Fill-ins: <code>{'{parent}'}</code> Sister Torres · <code>{'{youth}'}</code> Emma · <code>{'{name}'}</code> person's first name · <code>{'{interviewer}'}</code> Brother Butler ·{' '}
        <code>{'{day}'}</code> Sunday, Nov 1 · <code>{'{time}'}</code> 9:15 am · <code>{'{place}'}</code> clerk's office · <code>{'{type}'}</code> temple recommend · <code>{'{me}'}</code> your signature · <code>{'{list}'}</code> each person's time and interviewer (together texts)
      </div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Text templates saved', Object.fromEntries(Object.keys(GROUP_TEMPLATES).map(k => [k, val(k)])))}>{busy ? 'Saving…' : 'Save'}</button></div>
    </>
  );
}

const REMINDERS = [['remAgendas', 'Create and send agendas'], ['remReminders', 'Interview reminder texts (for Sunday)'], ['remReminders2', 'Interview reminder texts (for Wednesday)'], ['remFill', "Fill next week's interview calendars"], ['remConfirm', 'Confirm who came'], ['remPrayers', 'Ask for sacrament prayers'], ['remPrayerRem', 'Prayer reminder texts']];
function Reminders({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, [...REMINDERS.flatMap(([k]) => [`${k}Day`, `${k}Time`]), 'followUpDays']);
  const [syncing, setSyncing] = useState(false);
  const on = !!ctx.data.settings.reminderIds && ctx.data.settings.reminderIds !== '{}';
  async function sync(off) {
    if (!off && !(await save())) return;
    setSyncing(true);
    try { const r = await api('/api/reminders', { off }); ctx.setData(r.data); ctx.toast(off ? 'Phone reminders turned off' : `Added ${r.count} weekly ${r.count === 1 ? 'reminder' : 'reminders'} to your Google Calendar`); }
    catch (e) { ctx.toast(e.message, true); }
    setSyncing(false);
  }
  return (
    <>
      {REMINDERS.map(([k, label]) => (
        <div className="box" key={k}>
          <div className="name">{label}</div>
          <div className="two">
            <select aria-label={`${label} day`} value={f[`${k}Day`]} onChange={e => set(`${k}Day`, e.target.value)}>
              <option value="off">Off</option>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
            <input type="time" aria-label={`${label} time`} value={f[`${k}Time`]} disabled={f[`${k}Day`] === 'off'} onChange={e => set(`${k}Time`, e.target.value)} />
          </div>
        </div>
      ))}
      <label className="f">Follow up when there's no reply after (days)<input type="number" min="1" max="14" value={f.followUpDays} onChange={e => set('followUpDays', e.target.value)} /></label>
      <div className="sub">The app adds these as weekly events on your own Google Calendar, so your phone notifies you at that time. After changing a time, tap the button again.</div>
      <div className="btns">
        {on && <button className="btn ghost" type="button" disabled={syncing || busy} onClick={() => sync(true)}>Turn off</button>}
        <button className="btn primary" type="button" disabled={syncing || busy} onClick={() => sync(false)}>{syncing ? 'Updating your calendar…' : on ? 'Save and update reminders' : 'Turn on phone reminders'}</button>
      </div>
    </>
  );
}

function AgendaSettings({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, ['bishopricFolder', 'councilFolder', 'filePattern', 'councilSundays', 'tplAgendaSubject', 'tplAgendaEmail', 'callingsLink', 'calendarLink']);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  async function test() {
    setChecking(true); setCheck(null);
    try { setCheck(await api('/api/bridge')); } catch (e) { setCheck({ error: e.message }); }
    setChecking(false);
  }
  const folderLine = (label, r) => (
    <div>
      <div className="name">{label}</div>
      {!r ? null : r.error ? <div className="err">{r.error}</div>
        : <div className="sub">Folder: {r.folderName}<br />{r.latest ? <>Newest agenda: <a href={r.latest.url} target="_blank" rel="noopener">{r.latest.name}</a></> : 'No agenda Docs found in it yet'}</div>}
    </div>
  );
  return (
    <>
      <label className="f">Bishopric Drive folder (link)<input type="url" value={f.bishopricFolder} placeholder="https://drive.google.com/drive/folders/…" onChange={e => set('bishopricFolder', e.target.value)} /></label>
      <label className="f">Ward Council Drive folder (link)<input type="url" value={f.councilFolder} placeholder="https://drive.google.com/drive/folders/…" onChange={e => set('councilFolder', e.target.value)} /></label>
      <div className="sub">The app saves new agendas in the "Agendas" folder inside each one.</div>
      <label className="f">File name<input type="text" value={f.filePattern} onChange={e => set('filePattern', e.target.value)} /></label>
      <div className="legend"><code>{'{yy}'}</code> 26 · <code>{'{MMdd}'}</code> 1101 · <code>{'{meeting}'}</code> Bishopric or Council</div>
      <label className="f">Ward Council Sundays of the month<input type="text" value={f.councilSundays} placeholder="2,4" onChange={e => set('councilSundays', e.target.value)} /></label>
      <label className="f">Email subject<input type="text" value={f.tplAgendaSubject} onChange={e => set('tplAgendaSubject', e.target.value)} /></label>
      <label className="f">Email message<textarea value={f.tplAgendaEmail} onChange={e => set('tplAgendaEmail', e.target.value)} /></label>
      <div className="legend"><code>{'{meeting}'}</code> Bishopric Meeting · <code>{'{date}'}</code> Sunday, Nov 1 · <code>{'{link}'}</code> the agenda link · <code>{'{me}'}</code> your signature from Text templates</div>
      <label className="f">Callings spreadsheet (link)<input type="url" value={f.callingsLink} onChange={e => set('callingsLink', e.target.value)} /></label>
      <label className="f">Ward and Stake Calendar (link)<input type="url" value={f.calendarLink} onChange={e => set('calendarLink', e.target.value)} /></label>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Agenda settings saved')}>{busy ? 'Saving…' : 'Save'}</button></div>

      <div className="box">
        <div className="name">Google connection</div>
        <div className="sub">Checks the bridge and both folders. Save any folder changes first.</div>
        {check && (check.error ? <div className="err">{check.error}</div> : (
          <div className="checkres">
            <div className="sub">Connected as {check.email}</div>
            {folderLine('Bishopric', check.folders.B)}
            {folderLine('Ward Council', check.folders.W)}
          </div>
        ))}
        <div className="btns"><button className="btn soft" type="button" disabled={checking} onClick={test}>{checking ? 'Checking…' : 'Test Google connection'}</button></div>
      </div>
    </>
  );
}

function DataSection({ ctx }) {
  const [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try { await api('/api/backup/drive', {}); ctx.setData(await api('/api/data')); ctx.toast('Backup saved to Google Drive'); }
    catch (e) { ctx.toast(e.message, true); }
    setBusy(false);
  }
  return (
    <>
      <div className="kv"><span>Your data</span><span>Stored in your Supabase project</span></div>
      <div className="kv"><span>Weekly backup</span><span>Mondays to "Exec Secretary Backups" in your Google Drive, keeping the last 12<br />Last: {ctx.data.settings.lastBackup || 'None yet'}</span></div>
      <div className="btns">
        <a className="btn ghost" href="/api/backup">Download a backup</a>
        <button className="btn soft" type="button" disabled={busy} onClick={backup}>{busy ? 'Backing up…' : 'Back up to Drive now'}</button>
      </div>
      <form method="post" action="/api/logout" className="btns"><button className="btn danger" type="submit">Sign out</button></form>
    </>
  );
}
