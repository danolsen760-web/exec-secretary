'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { md } from '@/lib/youth';
import { people, whenLabel, recipient, isUpcoming, familyGroup } from '@/lib/ivclient';
import { phxDate, phxTime, dayShort, time12 } from '@/lib/time';
import { IvTag } from './bits';

const HOUR = 3600 * 1000;

export function todoCounts(data) {
  const now = Date.now();
  const follow = Number(data.settings.followUpDays || 3) * 24 * HOUR;
  const live = data.appointments.filter(a => a.status === 'scheduled');
  return {
    remind: live.filter(a => { const t = new Date(a.startsAt).getTime(); return t > now && t - now < 36 * HOUR && !a.remindedAt && a.textedAt; }),
    confirm: live.filter(a => new Date(a.startsAt).getTime() > now && !a.textedAt),
    follow: live.filter(a => new Date(a.startsAt).getTime() > now && a.textedAt && !a.confirmedAt && now - new Date(a.textedAt).getTime() > follow),
    came: live.filter(a => new Date(a.startsAt).getTime() + a.minutes * 60000 < now)
  };
}

export default function Interviews({ ctx }) {
  const { data, H } = ctx;
  const [tab, setTab] = useState(ctx.ivTab || 'todo');
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState(null);
  const all = people(data, H);

  useEffect(() => {
    if (!data.interviewers.some(i => i.calendarId)) { setEvents([]); return; }
    api('/api/interviews/events').then(r => setEvents(r.events)).catch(() => setEvents([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (
    <div className="seg" role="tablist">
      {[['todo', 'To do'], ['due', 'Due list'], ['sched', 'Scheduled']].map(([k, l]) => (
        <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
      ))}
    </div>
  );

  /* ---------- To do ---------- */
  if (tab === 'todo') {
    const t = todoCounts(data);
    const linked = new Set(data.appointments.map(a => a.eventId).filter(Boolean));
    const shownEvents = (events || []).filter(e => !linked.has(e.id));
    const dueBy = data.interviewers.map(iv => ({ iv, n: all.filter(p => p.interviewer === iv.leaderId && (p.status === 'over' || p.status === 'soon' || p.status === 'missing')).length })).filter(x => x.n);
    const row = (a, button) => (
      <li className="row" key={a.id}>
        <div className="who" onClick={() => ctx.openSheet({ type: 'appt', appt: a })} style={{ cursor: 'pointer' }}>
          <div className="name">{ctx.personName(a)}</div>
          <div className="det">{whenLabel(a)} · <IvTag id={a.interviewer} H={H} /></div>
        </div>
        {button}
      </li>
    );
    const sections = [
      t.remind.length > 0 && (
        <div className="card task" key="remind"><div className="head"><span className="icon g">✉</span><div><div className="ttl">Send reminders</div><div className="sub">Interviews in the next day and a half</div></div></div>
          <ul className="rows">{t.remind.map(a => row(a, <button className="btn soft" type="button" onClick={() => ctx.openSheet({ type: 'text', appt: a, kind: 'remind' })}>Text</button>))}</ul></div>
      ),
      t.confirm.length > 0 && (
        <div className="card task" key="confirm"><div className="head"><span className="icon">✓</span><div><div className="ttl">Send confirmations</div><div className="sub">Booked, but no text sent yet</div></div></div>
          <ul className="rows">{t.confirm.map(a => row(a, <button className="btn soft" type="button" onClick={() => ctx.openSheet({ type: 'text', appt: a, kind: 'confirm' })}>Text</button>))}</ul></div>
      ),
      t.follow.length > 0 && (
        <div className="card task" key="follow"><div className="head"><span className="icon y">!</span><div><div className="ttl">No reply yet</div><div className="sub">Texted {data.settings.followUpDays || 3}+ days ago</div></div></div>
          <ul className="rows">{t.follow.map(a => row(a, <div className="btns">
            <button className="btn ghost" type="button" onClick={async () => { const g = familyGroup(data, a, 'confirmed'); for (const x of g) ctx.setData(await api('/api/interviews/update', { id: x.id, action: 'confirmed' })); ctx.toast(g.length > 1 ? `Marked ${g.length} as confirmed` : 'Marked as confirmed'); }}>Confirmed</button>
            <button className="btn soft" type="button" onClick={() => ctx.openSheet({ type: 'text', appt: a, kind: 'follow' })}>Text again</button></div>))}</ul></div>
      ),
      t.came.length > 0 && (
        <div className="card task" key="came"><div className="head"><span className="icon r">?</span><div><div className="ttl">Did they come?</div><div className="sub">Done updates their next due date. Missed puts them back on the due list.</div></div></div>
          <ul className="rows">{t.came.map(a => row(a, <div className="btns">
            <button className="btn ghost" type="button" onClick={async () => { ctx.setData(await api('/api/interviews/update', { id: a.id, action: 'missed' })); ctx.toast('Back on the due list'); }}>Missed</button>
            <button className="btn okb" type="button" onClick={async () => { ctx.setData(await api('/api/interviews/update', { id: a.id, action: 'done' })); ctx.toast('Done'); }}>Done</button></div>))}</ul></div>
      ),
      shownEvents.length > 0 && (
        <div className="card task" key="events"><div className="head"><span className="icon">📅</span><div><div className="ttl">On the calendar, not in the app</div><div className="sub">Interviews someone else added. Link them so the right person comes off the due list.</div></div></div>
          <ul className="rows">{shownEvents.map(e => (
            <li className="row" key={e.id}><div className="who"><div className="name">{e.title || '(No title)'}</div><div className="det">{dayShort(e.date)} · {time12(e.time)}</div></div>
              <button className="btn soft" type="button" onClick={() => ctx.openSheet({ type: 'link', event: { ...e, label: `${dayShort(e.date)} · ${time12(e.time)}` } })}>Link</button></li>
          ))}</ul></div>
      ),
      dueBy.length > 0 && (
        <div className="card task" key="fill"><div className="head"><span className="icon g">＋</span><div><div className="ttl">Fill the calendars</div><div className="sub">People due in the next 6 weeks, or overdue</div></div></div>
          <ul className="rows">{dueBy.map(x => (
            <li className="row" key={x.iv.id}><div className="who"><div className="name"><IvTag id={x.iv.leaderId} H={H} /></div><div className="det">{x.n} to schedule</div></div>
              <button className="btn primary" type="button" onClick={() => { setFilter(x.iv.leaderId); setTab('due'); }}>Schedule</button></li>
          ))}</ul></div>
      )
    ].filter(Boolean);
    return (
      <>
        {seg}
        {events === null && data.interviewers.some(i => i.calendarId) && <div className="sub">Checking the calendars…</div>}
        {sections.length ? sections : <div className="card pad"><div className="ttl">All caught up</div><div className="sub">Nothing to text or confirm right now.</div></div>}
      </>
    );
  }

  /* ---------- Due list ---------- */
  if (tab === 'due') {
    const shown = all.filter(p => filter === 'all' || p.interviewer === filter);
    const group = (st, title) => {
      const g = shown.filter(p => p.status === st).sort((a, b) => (a.due || 0) - (b.due || 0));
      if (!g.length) return null;
      return (
        <div key={st}>
          <h3 className="grouph"><span>{title}</span><span className="sub">{g.length}</span></h3>
          <ul className="rows">{g.map(p => (
            <li className="row" key={p.key}>
              <div className="who">
                <div className="name">{p.name}{p.age ? <span className="sub"> {p.age}</span> : null}</div>
                <div className="det">{p.type} · <IvTag id={p.interviewer} H={H} />
                  {st === 'over' && <span className="pill bad">Due {md(p.due)}</span>}
                  {st === 'soon' && <span className="pill warn">Due {md(p.due)}</span>}
                  {st === 'missing' && <span className="pill warn">No last date · due now</span>}
                  {st === 'sch' && <span className="pill ok">{dayShort(phxDate(p.appt.startsAt))} · {time12(phxTime(p.appt.startsAt))}</span>}
                </div>
                {p.childId && st !== 'sch' && <div className="det">Texts go to {(recipient(data, { childId: p.childId }) || {}).label}</div>}
              </div>
              {st === 'sch'
                ? <button className="btn ghost" type="button" onClick={() => ctx.openSheet({ type: 'appt', appt: p.appt })}>Open</button>
                : <button className="btn primary" type="button" onClick={() => ctx.openSheet({ type: 'book', person: p })}>Schedule</button>}
            </li>
          ))}</ul>
        </div>
      );
    };
    const later = shown.filter(p => p.status === 'later').length;
    return (
      <>
        {seg}
        <div className="chips">
          <button className="chip" type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {data.interviewers.map(iv => <button key={iv.id} className="chip" type="button" aria-pressed={filter === iv.leaderId} onClick={() => setFilter(iv.leaderId)}>{H.short(iv.leaderId)}</button>)}
        </div>
        <div className="card group">
          {group('over', 'Overdue')}{group('missing', 'Needs a last interview date')}{group('soon', 'Due in the next 6 weeks')}{group('sch', 'Scheduled')}
          {later > 0 && <h3 className="grouph"><span>Not due yet</span><span className="sub">{later}</span></h3>}
          {!shown.length && <div className="sub" style={{ padding: '10px 0' }}>No one yet. Youth come from Members automatically. Add adult interviews (like temple recommends) on a family in Members.</div>}
        </div>
        <button className="btn ghost big" type="button" onClick={() => ctx.go('people')}>Add or edit members</button>
      </>
    );
  }

  /* ---------- Scheduled ---------- */
  const upcoming = data.appointments.filter(isUpcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let lastDay = '';
  return (
    <>
      {seg}
      <div className="card group">
        {!upcoming.length && <div className="sub" style={{ padding: '10px 0' }}>Nothing booked yet.</div>}
        {upcoming.map(a => {
          const day = phxDate(a.startsAt);
          const head = day !== lastDay ? <h3 className="grouph"><span>{dayShort(day)}</span></h3> : null;
          lastDay = day;
          return (
            <div key={a.id}>{head}
              <div className="row" onClick={() => ctx.openSheet({ type: 'appt', appt: a })} style={{ cursor: 'pointer' }}>
                <div className="who"><div className="name">{time12(phxTime(a.startsAt))} · {ctx.personName(a)}</div>
                  <div className="det">{a.type} · <IvTag id={a.interviewer} H={H} />
                    {a.confirmedAt ? <span className="pill ok">Confirmed</span> : a.textedAt ? <span className="pill">Texted</span> : <span className="pill warn">Not texted</span>}</div></div>
                <span className="caret">›</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
