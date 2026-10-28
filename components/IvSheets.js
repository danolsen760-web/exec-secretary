'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { md } from '@/lib/youth';
import { recipient, message, smsHref, whenLabel, longName, ivForLeader, people, familyGroup, groupMessage } from '@/lib/ivclient';
import { phxDate, dayLong } from '@/lib/time';

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="wrap">
          <button className="close" type="button" onClick={onClose} aria-label="Close">✕</button>
          <h2>{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------- Pick a time (new booking or reschedule) ---------- */
const GAP = 15 * 60000; // at most one empty slot between family members
const tms = x => new Date(x.start).getTime();

export function BookSheet({ ctx, person, appt, onClose }) {
  const { data, H, toast } = ctx;
  const rescheduling = !!appt;
  const leaderId = rescheduling ? appt.interviewer : person.interviewer;
  const [ivId, setIvId] = useState(() => (ivForLeader(data, leaderId) || data.interviewers[0]).id);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);

  // Others in the family who could come the same day
  const [fam, setFam] = useState(() => {
    if (rescheduling || !person.household) return [];
    return people(data, H)
      .filter(p => p.key !== person.key && p.household && p.household.id === person.household.id && p.status !== 'sch')
      .sort((a, b) => (a.due || 0) - (b.due || 0))
      .map(p => ({ p, on: ['over', 'missing', 'soon'].includes(p.status), ivId: (ivForLeader(data, p.interviewer) || data.interviewers[0]).id }));
  });
  const [extra, setExtra] = useState({}); // openings for the other interviewers
  const [together, setTogether] = useState(true); // different interviewers can meet at the same time
  const famOn = fam.filter(f => f.on);

  async function load(id = ivId) {
    setRes(null); setErr(''); setPick(null);
    try { setRes(await api(`/api/interviews/openings?iv=${id}&days=28`)); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(ivId); }, [ivId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    famOn.map(f => f.ivId).filter((id, i, all) => id !== ivId && !extra[id] && all.indexOf(id) === i).forEach(id => {
      setExtra(x => ({ ...x, [id]: 'loading' }));
      api(`/api/interviews/openings?iv=${id}&days=28`).then(r => setExtra(x => ({ ...x, [id]: r }))).catch(() => setExtra(x => ({ ...x, [id]: null })));
    });
  }, [fam, ivId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Times for the whole family, back to back around the time you picked. Null if it doesn't fit. */
  function planFor(anchor, date) {
    const out = [{ p: person, ivId, slot: anchor }];
    const used = new Set([`${ivId}|${anchor.start}`]);
    let lo = tms(anchor), hi = lo + anchor.minutes * 60000;
    for (const f of famOn) {
      const r = f.ivId === ivId ? res : extra[f.ivId];
      if (!r || r === 'loading') return null;
      const day = r.days.find(d => d.date === date);
      if (!day || day.off) return null;
      const free = day.slots.filter(x => !x.taken && !used.has(`${f.ivId}|${x.start}`));
      const end = x => tms(x) + x.minutes * 60000;
      // Different interviewer: same time as someone else in the family, if they're free then
      const same = together && free.filter(x => out.some(o => o.ivId !== f.ivId && tms(o.slot) === tms(x)) && !out.some(o => o.ivId === f.ivId && tms(o.slot) === tms(x)))
        .sort((a, b) => tms(a) - tms(b))[0];
      if (same) { used.add(`${f.ivId}|${same.start}`); out.push({ p: f.p, ivId: f.ivId, slot: same }); continue; }
      const after = free.filter(x => tms(x) >= hi && tms(x) - hi <= GAP).sort((a, b) => tms(a) - tms(b))[0];
      const got = after || free.filter(x => end(x) <= lo && lo - end(x) <= GAP).sort((a, b) => tms(b) - tms(a))[0];
      if (!got) return null;
      used.add(`${f.ivId}|${got.start}`);
      out.push({ p: f.p, ivId: f.ivId, slot: got });
      lo = Math.min(lo, tms(got)); hi = Math.max(hi, end(got));
    }
    return out.sort((a, b) => tms(a.slot) - tms(b.slot));
  }
  const pickDay = pick && res ? res.days.find(d => d.slots.includes(pick)) : null;
  const plan = pick && pickDay ? planFor(pick, pickDay.date) : null;
  const loadingExtra = famOn.some(f => f.ivId !== ivId && (!extra[f.ivId] || extra[f.ivId] === 'loading'));

  async function dayOff(date, off) {
    try { ctx.setData(await api('/api/interviews/dayoff', { interviewerId: ivId, date, off })); load(); toast(off ? 'Marked as no interviews that day' : 'Back on for that day'); }
    catch (e) { toast(e.message, true); }
  }

  async function confirm() {
    setBusy(true);
    try {
      if (rescheduling) {
        const d = await api('/api/interviews/reschedule', { id: appt.id, start: pick.start, minutes: pick.minutes, place: pick.place });
        ctx.setData(d);
        const fresh = d.appointments.find(a => a.id === appt.id);
        toast('Moved on the calendar');
        ctx.openSheet({ type: 'text', appt: fresh, kind: 'reschedule' });
      } else {
        const items = plan || [{ p: person, ivId, slot: pick }];
        let last, mainId;
        for (const it of items) {
          last = await api('/api/interviews/book', {
            childId: it.p.childId, trackId: it.p.trackId, interviewerId: it.ivId, start: it.slot.start, minutes: it.slot.minutes, place: it.slot.place
          });
          if (it.p.key === person.key) mainId = last.appointmentId;
        }
        ctx.setData(last.data);
        const fresh = last.data.appointments.find(a => a.id === mainId);
        toast(items.length > 1 ? `Booked ${items.length} interviews back to back` : 'Booked and added to the calendar');
        ctx.openSheet({ type: 'text', appt: fresh, kind: 'confirm' });
      }
    } catch (e) { toast(e.message, true); setBusy(false); }
  }

  const name = rescheduling ? (ctx.personName(appt) || 'Interview') : person.name;
  const dueText = p => (p.status === 'missing' ? 'due now' : p.due ? `due ${md(p.due)}` : '');
  return (
    <Sheet title={rescheduling ? 'Pick a new time' : 'Schedule interview'} onClose={onClose}>
      <div><div className="ttl">{name}</div>
        <div className="sub">{rescheduling ? `Now: ${whenLabel(appt)}` : `${person.type}${person.due ? ` · due ${md(person.due)}` : ''} · suggested: ${H.short(person.interviewer)}`}</div></div>
      <div className="chips">
        {data.interviewers.map(iv => (
          <button key={iv.id} className="chip" type="button" aria-pressed={iv.id === ivId} onClick={() => setIvId(iv.id)}>{H.short(iv.leaderId)}</button>
        ))}
      </div>
      {fam.length > 0 && (
        <div className="box">
          <div className="name">Same trip for the family</div>
          <div className="sub">Checked people are booked back to back with {person.first || name}, so the family comes once.</div>
          {fam.map((f, i) => (
            <div className="famrow" key={f.p.key}>
              <label className="checks"><input type="checkbox" checked={f.on} onChange={e => { setPick(null); setFam(x => x.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y))); }} />
                <span><b>{f.p.first || f.p.name}</b>{f.p.age ? ` ${f.p.age}` : ''} · {f.p.type === 'Youth' ? '' : `${f.p.type} · `}{dueText(f.p)}</span></label>
              {f.on && (
                <select aria-label={`Who interviews ${f.p.first || f.p.name}`} value={f.ivId} onChange={e => { setPick(null); setFam(x => x.map((y, j) => (j === i ? { ...y, ivId: e.target.value } : y))); }}>
                  {data.interviewers.map(iv => <option key={iv.id} value={iv.id}>with {H.short(iv.leaderId)}{iv.leaderId === f.p.interviewer ? ' (their turn)' : ''}</option>)}
                </select>
              )}
            </div>
          ))}
          {famOn.some(f => f.ivId !== ivId) && (
            <label className="checks"><input type="checkbox" checked={together} onChange={e => { setPick(null); setTogether(e.target.checked); }} />Same time when it's a different interviewer</label>
          )}
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {(!res || loadingExtra) && !err && <div className="sub">Checking the calendar…</div>}
      {res && !res.calendarConnected && <div className="note">This interviewer has no Google Calendar chosen yet, so the app can't see what's already booked. Choose one in Settings → Interviewers and hours.</div>}
      {res && res.days.length === 0 && <div className="sub">No times in the next 4 weeks. Check this interviewer's hours in Settings.</div>}
      {res && !loadingExtra && famOn.length > 0 && !res.days.some(d => !d.off && d.slots.some(s => !s.taken && planFor(s, d.date))) && (
        <div className="note">No time in the next 4 weeks fits everyone back to back. Try having one person do all of them, or uncheck someone.</div>
      )}
      {res && !loadingExtra && res.days.map(d => (
        <div key={d.date} className="dayblock">
          <div className="prow"><span className="name">{d.label}</span>
            <button className="link" type="button" onClick={() => dayOff(d.date, !d.off)}>{d.off ? 'Turn this day back on' : 'No interviews this day'}</button></div>
          {d.off ? <div className="sub">Marked as no interviews.</div> : (
            <div className="slots">
              {d.slots.map(s => (
                <button key={s.start} className="chip" type="button" disabled={s.taken || (famOn.length > 0 && !planFor(s, d.date))} aria-pressed={pick?.start === s.start} onClick={() => setPick(s)}>{s.label.replace(' ', ' ')}</button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="stickybar">
      {plan && plan.length > 1 && (
        <div className="box plan">
          <div className="name">{pickDay.label}</div>
          {plan.map(it => <div key={it.p.key} className="sub">{it.slot.label} · <b>{it.p.first || it.p.name}</b> with {H.short(data.interviewers.find(v => v.id === it.ivId).leaderId)}</div>)}
        </div>
      )}
      <button className="btn primary big stickybtn" type="button" disabled={!pick || busy} onClick={confirm}>
        {busy ? 'Saving…' : !pick ? 'Pick a time' : plan && plan.length > 1 ? `Book all ${plan.length}` : `${rescheduling ? 'Move to' : 'Book'} ${pickDay ? pickDay.label : ''}, ${pick.label}`}
      </button>
      </div>
    </Sheet>
  );
}

/* ---------- Text someone (opens Messages with the text filled in) ---------- */
export function TextSheet({ ctx, appt, kind, onClose }) {
  const { data, toast } = ctx;
  const [which, setWhich] = useState(null);
  const rec = recipient(data, appt, which);
  const group = familyGroup(data, appt, kind);
  const [include, setInclude] = useState(true);
  const together = include && group.length > 1;
  const build = r => (together ? groupMessage(data, group, kind, r) : message(data, appt, kind, r));
  const [text, setText] = useState(() => (rec ? build(rec) : ''));
  useEffect(() => { const r = recipient(data, appt, which); if (r) setText(build(r)); }, [which, include]); // eslint-disable-line react-hooks/exhaustive-deps
  const titles = { confirm: 'Send confirmation', remind: 'Send reminder', follow: 'Follow up', reschedule: 'Send the new time' };

  async function sent() {
    try {
      const action = kind === 'remind' ? 'reminded' : 'texted';
      for (const a of (together ? group : [appt])) ctx.setData(await api('/api/interviews/update', { id: a.id, action }));
    } catch (e) { toast(e.message, true); }
    onClose();
  }
  if (!rec) return <Sheet title={titles[kind]} onClose={onClose}><div className="err">Couldn't find who to text for this interview.</div></Sheet>;
  return (
    <Sheet title={titles[kind]} onClose={onClose}>
      <div className="sub">{together ? `${group.map(a => ctx.personName(a)).join(', ')} · ${dayLong(phxDate(appt.startsAt))}` : `${ctx.personName(appt)} · ${whenLabel(appt)} · ${longName(data, appt.interviewer)}`}</div>
      {group.length > 1 && (
        <label className="checks"><input type="checkbox" checked={include} onChange={e => setInclude(e.target.checked)} />One text for {group.length} interviews that day</label>
      )}
      <div>
        <div className="mini">To</div>
        <div className="name">{rec.label} · {rec.phone || 'No phone on file'}</div>
        {rec.alt && <button className="link" type="button" onClick={() => setWhich(rec.alt)}>Text {rec.altLabel} instead</button>}
      </div>
      <textarea aria-label="Message" value={text} onChange={e => setText(e.target.value)} />
      {rec.phone
        ? <a className="btn primary big" href={smsHref(rec.phone, text)} onClick={() => setTimeout(sent, 300)}>Open in Messages</a>
        : <div className="err">Add a phone number for this family in Members first.</div>}
      <div className="foot">Your Messages app opens with this filled in. Tap Send there. The app marks {together ? 'all of them' : 'it'} as texted.</div>
    </Sheet>
  );
}

/* ---------- One booked interview ---------- */
export function ApptSheet({ ctx, appt, onClose }) {
  const { data, toast } = ctx;
  const [busy, setBusy] = useState('');
  const [sure, setSure] = useState(false);
  const a = data.appointments.find(x => x.id === appt.id) || appt;
  async function act(action, msg) {
    setBusy(action);
    try { ctx.setData(await api('/api/interviews/update', { id: a.id, action })); toast(msg); onClose(); }
    catch (e) { toast(e.message, true); setBusy(''); }
  }
  const past = new Date(a.startsAt) < new Date();
  return (
    <Sheet title={ctx.personName(a) || 'Interview'} onClose={onClose}>
      <div className="sub">{a.type} interview · {whenLabel(a)} · {longName(data, a.interviewer)}{a.place ? ` · ${a.place}` : ''}</div>
      <div className="det">
        {a.textedAt ? <span className="pill ok">Texted {md(new Date(a.textedAt))}</span> : <span className="pill warn">Not texted yet</span>}
        {a.confirmedAt && <span className="pill ok">Confirmed</span>}
        {a.remindedAt && <span className="pill ok">Reminder sent</span>}
      </div>
      {past ? (
        <div className="btns">
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act('missed', 'Back on the due list')}>They didn't come</button>
          <button className="btn primary" type="button" disabled={!!busy} onClick={() => act('done', 'Done. Next due date updated.')}>Done</button>
        </div>
      ) : (
        <div className="stack">
          <button className="btn soft" type="button" onClick={() => ctx.openSheet({ type: 'text', appt: a, kind: a.textedAt ? 'remind' : 'confirm' })}>{a.textedAt ? 'Send a reminder' : 'Send confirmation'}</button>
          {a.textedAt && !a.confirmedAt && <button className="btn ghost" type="button" disabled={!!busy} onClick={async () => {
            const g = familyGroup(data, a, 'confirmed');
            if (g.length < 2) return act('confirmed', 'Marked as confirmed');
            setBusy('confirmed');
            try { for (const x of g) ctx.setData(await api('/api/interviews/update', { id: x.id, action: 'confirmed' })); toast(`Marked ${g.length} family interviews as confirmed`); onClose(); }
            catch (e) { toast(e.message, true); setBusy(''); }
          }}>They confirmed</button>}
          <button className="btn ghost" type="button" onClick={() => ctx.openSheet({ type: 'book', appt: a })}>Pick a new time</button>
          {!sure ? <button className="btn danger" type="button" onClick={() => setSure(true)}>Cancel interview</button> : (
            <div className="box"><div className="sub">This removes it from the calendar and puts them back on the due list.</div>
              <div className="btns"><button className="btn ghost" type="button" onClick={() => setSure(false)}>Keep it</button>
                <button className="btn danger" type="button" disabled={!!busy} onClick={() => act('cancel', 'Interview cancelled')}>Yes, cancel it</button></div></div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------- A calendar event someone else added ---------- */
export function LinkSheet({ ctx, event, onClose }) {
  const { data, H, toast } = ctx;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = people(data, H).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  async function link(body, msg) {
    setBusy(true);
    try { ctx.setData(await api('/api/interviews/link', { eventId: event.id, calendarId: event.calendarId, start: event.start, end: event.end, title: event.title, interviewerId: event.interviewerId, ...body })); toast(msg); onClose(); }
    catch (e) { toast(e.message, true); setBusy(false); }
  }
  return (
    <Sheet title="Who is this interview for?" onClose={onClose}>
      <div><div className="name">{event.title || '(No title)'}</div><div className="sub">{event.label}</div></div>
      <input type="text" placeholder="Search names" value={q} onChange={e => setQ(e.target.value)} aria-label="Search names" />
      <ul className="rows">
        {list.map(p => (
          <li className="row" key={p.key}><div className="who"><div className="name">{p.name}</div><div className="det">{p.type}</div></div>
            <button className="btn soft" type="button" disabled={busy} onClick={() => link({ childId: p.childId, trackId: p.trackId }, `Linked to ${p.name}`)}>This one</button></li>
        ))}
      </ul>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => link({ ignore: true }, 'Hidden from this list')}>Not an interview</button>
    </Sheet>
  );
}

/* ---------- Add or edit an adult interview ---------- */
export function TrackSheet({ ctx, household, track, onClose }) {
  const { data, H, toast } = ctx;
  const h = household;
  const names = { p1: h.p1First ? `${h.p1First} ${h.family}` : '', p2: h.p2First ? `${h.p2First} ${h.family}` : '' };
  const [f, setF] = useState(() => track ? {
    id: track.id, who: track.who, type: track.type, interviewer: track.interviewer, due: track.due || '', repeatMonths: String(track.repeatMonths || ''), active: track.active !== false
  } : { id: '', who: h.p1First ? 'p1' : 'p2', type: 'Temple recommend', interviewer: H.bishopId, due: '', repeatMonths: '24', active: true });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const nameFor = who => (who === 'both' ? `${h.p1First} & ${h.p2First} ${h.family}` : names[who]);
  async function save(extra = {}) {
    setBusy(true);
    try {
      ctx.setData(await api('/api/interviews/track', { ...f, ...extra, householdId: h.id, name: nameFor(f.who) }));
      toast(extra.active === false ? 'Removed' : 'Saved'); onClose();
    } catch (e) { toast(e.message, true); setBusy(false); }
  }
  return (
    <Sheet title={track ? 'Edit interview' : 'Add an interview'} onClose={onClose}>
      <label className="f">For
        <select value={f.who} onChange={e => set('who', e.target.value)}>
          {h.p1First && <option value="p1">{names.p1}</option>}
          {h.p2First && <option value="p2">{names.p2}</option>}
          {h.p1First && h.p2First && <option value="both">Both ({h.p1First} & {h.p2First})</option>}
        </select>
      </label>
      <label className="f">Interview
        <input type="text" list="iv-types" value={f.type} onChange={e => set('type', e.target.value)} />
        <datalist id="iv-types"><option value="Temple recommend" /><option value="Calling" /><option value="Ecclesiastical endorsement" /><option value="Other" /></datalist>
      </label>
      <label className="f">With
        <select value={f.interviewer || ''} onChange={e => set('interviewer', e.target.value)}>
          {data.interviewers.map(iv => <option key={iv.id} value={iv.leaderId}>{H.short(iv.leaderId)}</option>)}
        </select>
      </label>
      <label className="f">{f.type === 'Temple recommend' ? 'Recommend expires (or when to renew)' : 'Due by'}
        <input type="date" value={f.due} onChange={e => set('due', e.target.value)} /></label>
      <label className="f">Repeats
        <select value={f.repeatMonths} onChange={e => set('repeatMonths', e.target.value)}>
          <option value="">One time</option><option value="6">Every 6 months</option><option value="12">Every year</option><option value="24">Every 2 years</option>
        </select>
      </label>
      <button className="btn primary big" type="button" disabled={busy || !f.due} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
      {track && <button className="btn danger" type="button" disabled={busy} onClick={() => save({ active: false })}>Stop tracking this</button>}
    </Sheet>
  );
}
