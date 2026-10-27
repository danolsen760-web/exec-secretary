'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { md } from '@/lib/youth';
import { recipient, message, smsHref, whenLabel, longName, ivForLeader, people } from '@/lib/ivclient';

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
export function BookSheet({ ctx, person, appt, onClose }) {
  const { data, H, toast } = ctx;
  const rescheduling = !!appt;
  const leaderId = rescheduling ? appt.interviewer : person.interviewer;
  const [ivId, setIvId] = useState(() => (ivForLeader(data, leaderId) || data.interviewers[0]).id);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load(id = ivId) {
    setRes(null); setErr(''); setPick(null);
    try { setRes(await api(`/api/interviews/openings?iv=${id}&days=28`)); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(ivId); }, [ivId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const r = await api('/api/interviews/book', {
          childId: person.childId, trackId: person.trackId, interviewerId: ivId, start: pick.start, minutes: pick.minutes, place: pick.place
        });
        ctx.setData(r.data);
        const fresh = r.data.appointments.find(a => a.id === r.appointmentId);
        toast('Booked and added to the calendar');
        ctx.openSheet({ type: 'text', appt: fresh, kind: 'confirm' });
      }
    } catch (e) { toast(e.message, true); setBusy(false); }
  }

  const name = rescheduling ? (ctx.personName(appt) || 'Interview') : person.name;
  return (
    <Sheet title={rescheduling ? 'Pick a new time' : 'Schedule interview'} onClose={onClose}>
      <div><div className="ttl">{name}</div>
        <div className="sub">{rescheduling ? `Now: ${whenLabel(appt)}` : `${person.type}${person.due ? ` · due ${md(person.due)}` : ''} · suggested: ${H.short(person.interviewer)}`}</div></div>
      <div className="chips">
        {data.interviewers.map(iv => (
          <button key={iv.id} className="chip" type="button" aria-pressed={iv.id === ivId} onClick={() => setIvId(iv.id)}>{H.short(iv.leaderId)}</button>
        ))}
      </div>
      {err && <div className="err">{err}</div>}
      {!res && !err && <div className="sub">Checking the calendar…</div>}
      {res && !res.calendarConnected && <div className="note">This interviewer has no Google Calendar chosen yet, so the app can't see what's already booked. Choose one in Settings → Interviewers and hours.</div>}
      {res && res.days.length === 0 && <div className="sub">No times in the next 4 weeks. Check this interviewer's hours in Settings.</div>}
      {res && res.days.map(d => (
        <div key={d.date} className="dayblock">
          <div className="prow"><span className="name">{d.label}</span>
            <button className="link" type="button" onClick={() => dayOff(d.date, !d.off)}>{d.off ? 'Turn this day back on' : 'No interviews this day'}</button></div>
          {d.off ? <div className="sub">Marked as no interviews.</div> : (
            <div className="slots">
              {d.slots.map(s => (
                <button key={s.start} className="chip" type="button" disabled={s.taken} aria-pressed={pick?.start === s.start} onClick={() => setPick(s)}>{s.label.replace(' ', ' ')}</button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button className="btn primary big stickybtn" type="button" disabled={!pick || busy} onClick={confirm}>
        {busy ? 'Saving…' : pick ? `${rescheduling ? 'Move to' : 'Book'} ${data && res ? res.days.find(d => d.slots.includes(pick))?.label : ''}, ${pick.label}` : 'Pick a time'}
      </button>
    </Sheet>
  );
}

/* ---------- Text someone (opens Messages with the text filled in) ---------- */
export function TextSheet({ ctx, appt, kind, onClose }) {
  const { data, toast } = ctx;
  const [which, setWhich] = useState(null);
  const rec = recipient(data, appt, which);
  const [text, setText] = useState(() => message(data, appt, kind, rec));
  useEffect(() => { setText(message(data, appt, kind, recipient(data, appt, which))); }, [which]); // eslint-disable-line react-hooks/exhaustive-deps
  const titles = { confirm: 'Send confirmation', remind: 'Send reminder', follow: 'Follow up', reschedule: 'Send the new time' };

  async function sent() {
    try {
      ctx.setData(await api('/api/interviews/update', { id: appt.id, action: kind === 'remind' ? 'reminded' : 'texted' }));
    } catch (e) { toast(e.message, true); }
    onClose();
  }
  if (!rec) return <Sheet title={titles[kind]} onClose={onClose}><div className="err">Couldn't find who to text for this interview.</div></Sheet>;
  return (
    <Sheet title={titles[kind]} onClose={onClose}>
      <div className="sub">{ctx.personName(appt)} · {whenLabel(appt)} · {longName(data, appt.interviewer)}</div>
      <div>
        <div className="mini">To</div>
        <div className="name">{rec.label} · {rec.phone || 'No phone on file'}</div>
        {rec.alt && <button className="link" type="button" onClick={() => setWhich(rec.alt)}>Text {rec.altLabel} instead</button>}
      </div>
      <textarea aria-label="Message" value={text} onChange={e => setText(e.target.value)} />
      {rec.phone
        ? <a className="btn primary big" href={smsHref(rec.phone, text)} onClick={() => setTimeout(sent, 300)}>Open in Messages</a>
        : <div className="err">Add a phone number for this family in Members first.</div>}
      <div className="foot">Your Messages app opens with this filled in. Tap Send there. The app marks it as texted.</div>
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
          {a.textedAt && !a.confirmedAt && <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act('confirmed', 'Marked as confirmed')}>They confirmed</button>}
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
