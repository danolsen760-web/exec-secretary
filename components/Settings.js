'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { DAYS, TITLES } from '@/lib/youth';
import { IvTag, Caret, saver } from './bits';

export default function Settings({ ctx }) {
  const { data, setOpen, setSetOpen } = ctx;
  const toggle = (id, isOpen) => setSetOpen(prev => { const n = new Set(prev); isOpen ? n.add(id) : n.delete(id); return n; });
  const active = data.leaders.filter(l => l.active !== false);


  return (
    <>
      <SettingsSection id="people" isOpen={setOpen.has('people')} onToggle={toggle} title="Meeting attendees" sub={`${active.length} active · callings, agenda titles, emails`}><Leaders ctx={ctx} /></SettingsSection>
      <SettingsSection id="ivr" isOpen={setOpen.has('ivr')} onToggle={toggle} title="Interviewers and hours" sub="Days, times, and where they meet">
        {data.interviewers.map(iv => <InterviewerForm key={iv.id} iv={iv} ctx={ctx} />)}
      </SettingsSection>
      <SettingsSection id="youth" isOpen={setOpen.has('youth')} onToggle={toggle} title="Youth interview rules" sub={data.settings.splitConfirmed === 'TRUE' ? 'Counselor split confirmed' : 'Counselor split not confirmed yet'}><YouthRules ctx={ctx} /></SettingsSection>
      <SettingsSection id="texts" isOpen={setOpen.has('texts')} onToggle={toggle} title="Text templates" sub="Confirmation, reminder, follow-up"><Templates ctx={ctx} /></SettingsSection>
      <SettingsSection id="rems" isOpen={setOpen.has('rems')} onToggle={toggle} title="My reminders" sub="When your phone reminds you"><Reminders ctx={ctx} /></SettingsSection>
      <SettingsSection id="agendas" isOpen={setOpen.has('agendas')} onToggle={toggle} title="Agendas" sub="Drive folders, file names, email"><AgendaSettings ctx={ctx} /></SettingsSection>
      <SettingsSection id="data" isOpen={setOpen.has('data')} onToggle={toggle} title="Data and sign-in" sub="Backups and signing out"><DataSection /></SettingsSection>
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
function InterviewerForm({ iv, ctx }) {
  const { data, H } = ctx;
  const [f, setF] = useState({ ...iv });
  const [busy, setBusy] = useState(false);
  const run = saver(ctx);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const active = data.leaders.filter(l => l.active !== false || l.id === iv.leaderId);
  async function save() {
    if (f.startTime >= f.endTime) return ctx.toast('The end time needs to be after the start time.', true);
    await run(setBusy, () => api('/api/interviewers', f), `Saved ${H.short(f.leaderId)}'s interview hours`);
  }
  return (
    <div className="box">
      <div className="prow"><span className="ttl"><IvTag id={iv.leaderId} H={H} /></span><span className="pill plain">{iv.kind === 'bishop' ? 'Bishop' : 'Counselor'}</span></div>
      <label className="f">Person
        <select value={f.leaderId} onChange={e => set('leaderId', e.target.value)}>
          {active.map(l => <option key={l.id} value={l.id}>{l.first} {l.last} ({l.calling})</option>)}
        </select>
      </label>
      <label className="f">Google Calendar name<input type="text" value={f.calendarName} onChange={e => set('calendarName', e.target.value)} /></label>
      <label className="f">Where they meet<input type="text" value={f.place} onChange={e => set('place', e.target.value)} /></label>
      <label className="f">Day<select value={f.day} onChange={e => set('day', e.target.value)}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></label>
      <div className="two">
        <label className="f">From<input type="time" value={f.startTime} onChange={e => set('startTime', e.target.value)} /></label>
        <label className="f">To<input type="time" value={f.endTime} onChange={e => set('endTime', e.target.value)} /></label>
      </div>
      <label className="f">Minutes per interview<input type="number" min="5" max="120" step="5" value={f.slotMinutes} onChange={e => set('slotMinutes', e.target.value)} /></label>
      <div className="sub">The calendar connects in stage 2. Use the calendar's exact name.</div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
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

const TEMPLATES = [
  ['tplConfirmParent', 'Confirmation · to a parent'], ['tplConfirmAdult', 'Confirmation · adult'],
  ['tplReminderParent', 'Reminder · to a parent'], ['tplReminderAdult', 'Reminder · adult'],
  ['tplFollowParent', 'Follow-up · to a parent'], ['tplFollowAdult', 'Follow-up · adult'], ['tplReschedule', 'New time']
];
function Templates({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, ['me', ...TEMPLATES.map(t => t[0])]);
  return (
    <>
      <label className="f">How you sign texts<input type="text" value={f.me} onChange={e => set('me', e.target.value)} /></label>
      {TEMPLATES.map(([k, label]) => (
        <label className="f" key={k}>{label}<textarea value={f[k]} onChange={e => set(k, e.target.value)} /></label>
      ))}
      <div className="legend">
        Fill-ins: <code>{'{parent}'}</code> Sister Torres · <code>{'{youth}'}</code> Emma · <code>{'{name}'}</code> person's first name · <code>{'{interviewer}'}</code> Brother Butler ·{' '}
        <code>{'{day}'}</code> Sunday, Nov 1 · <code>{'{time}'}</code> 9:15 am · <code>{'{place}'}</code> clerk's office · <code>{'{type}'}</code> temple recommend · <code>{'{me}'}</code> your signature
      </div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Text templates saved')}>{busy ? 'Saving…' : 'Save'}</button></div>
    </>
  );
}

const REMINDERS = [['remAgendas', 'Create and send agendas'], ['remReminders', 'Interview reminder texts'], ['remFill', "Fill next Sunday's calendars"], ['remConfirm', 'Confirm who came']];
function Reminders({ ctx }) {
  const { f, set, save, busy } = useSettingsForm(ctx, [...REMINDERS.flatMap(([k]) => [`${k}Day`, `${k}Time`]), 'followUpDays']);
  return (
    <>
      {REMINDERS.map(([k, label]) => (
        <div className="box" key={k}>
          <div className="name">{label}</div>
          <div className="two">
            <select aria-label={`${label} day`} value={f[`${k}Day`]} onChange={e => set(`${k}Day`, e.target.value)}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
            <input type="time" aria-label={`${label} time`} value={f[`${k}Time`]} onChange={e => set(`${k}Time`, e.target.value)} />
          </div>
        </div>
      ))}
      <label className="f">Follow up when there's no reply after (days)<input type="number" min="1" max="14" value={f.followUpDays} onChange={e => set('followUpDays', e.target.value)} /></label>
      <div className="sub">These start sending in stage 2.</div>
      <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={() => save('Reminder times saved')}>{busy ? 'Saving…' : 'Save'}</button></div>
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

function DataSection() {
  return (
    <>
      <div className="kv"><span>Your data</span><span>Stored in your Supabase project</span></div>
      <div className="kv"><span>Backups</span><span>Download a copy any time. Automatic weekly backups to Google Drive come in stage 2.</span></div>
      <div className="btns">
        <a className="btn ghost" href="/api/backup">Download a backup</a>
        <form method="post" action="/api/logout"><button className="btn danger" type="submit">Sign out</button></form>
      </div>
    </>
  );
}
