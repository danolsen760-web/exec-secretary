'use client';
import { IvTag, DuePill } from './bits';
import { MEETINGS, sundayLabel } from '@/lib/names';
import { meetingsOn } from '@/lib/suggest';

export default function Home({ ctx }) {
  const { data, H, go } = ctx;
  const ys = H.allYouth();
  const over = ys.filter(x => x.y.status === 'over').length;
  const soon = ys.filter(x => x.y.status === 'soon').length;
  const missing = ys.filter(x => x.y.status === 'missing').length;
  const active = data.leaders.filter(l => l.active !== false);
  const noEmail = active.filter(l => !l.email).length;

  const items = [
    { ok: data.settings.splitConfirmed === 'TRUE', title: 'Confirm the counselor age split', sub: 'Check with the bishop, then mark it confirmed', view: 'setup', sec: 'youth' },
    { ok: data.settings.hoursConfirmed === 'TRUE', title: 'Set interview hours', sub: "Check each interviewer's day, times, and place", view: 'setup', sec: 'ivr' },
    { ok: noEmail === 0, title: 'Add attendee emails', sub: noEmail ? `${noEmail} of ${active.length} people are missing an email` : 'Everyone has an email', view: 'setup', sec: 'people' },
    { ok: ys.length > 0, title: 'Enter youth families', sub: ys.length ? `${ys.length} youth entered so far` : 'Start with the families who have youth', view: 'people' },
    { ok: ys.length > 0 && missing === 0, title: 'Add last interview dates',
      sub: missing ? `${missing} youth need a last interview date` : ys.length ? 'Every youth has a date' : 'Comes after entering families', view: 'people' }
  ];
  const done = items.filter(i => i.ok).length;
  const due = ys.filter(x => x.y.status !== 'later').sort((a, b) => (a.y.due || 0) - (b.y.due || 0));

  const date = ctx.agendaDate;
  const agendaStatus = meetingsOn(date, data.settings).map(m => {
    const a = data.agendas.find(x => x.meeting === m && x.date === date);
    const pill = a?.sentAt ? <span className="pill ok">Sent</span> : a?.docUrl ? <span className="pill warn">Created, not sent</span> : <span className="pill plain">Not created</span>;
    return { m, pill, done: !!a?.sentAt };
  });

  return (
    <>
      <div className="card made">
        <div><div className="mini">Agendas · {sundayLabel(date)}</div>
          {agendaStatus.map(x => <div className="agrow" key={x.m}><span className="name">{MEETINGS[x.m].short}</span>{x.pill}</div>)}</div>
        {!agendaStatus.every(x => x.done) && <button className="btn primary" type="button" onClick={() => go('agendas')}>Open Agenda Builder</button>}
      </div>

      <div className="stats">
        <div className="stat bad"><b>{over}</b><span>Youth overdue</span></div>
        <div className="stat warn"><b>{soon}</b><span>Due in 6 weeks</span></div>
        <div className="stat plain"><b>{missing}</b><span>Missing a date</span></div>
      </div>

      {done < items.length && <>
        <p className="label">Getting set up · {done} of {items.length}</p>
        <div className="card"><ul className="rows">
          {items.map(i => (
            <li className="row" key={i.title}>
              <span className={'check' + (i.ok ? ' on' : '')}>✓</span>
              <div className="who"><div className="name">{i.title}</div><div className="det">{i.sub}</div></div>
              {!i.ok && <button className="btn soft" type="button" onClick={() => go(i.view, i.sec)}>Open</button>}
            </li>
          ))}
        </ul></div>
      </>}

      <p className="label">Youth interviews coming due</p>
      <div className="card">
        {due.length ? (
          <ul className="rows">
            {due.slice(0, 15).map(x => (
              <li className="row" key={x.c.id}>
                <div className="who">
                  <div className="name">{x.c.first} {x.h.family} <span className="sub">{x.y.age}</span></div>
                  <div className="det">Next with <IvTag id={x.y.next} H={H} /> <DuePill y={x.y} /></div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pad sub">{ys.length ? 'No youth are due in the next 6 weeks.' : 'Youth show up here once you add their families in Members.'}</div>
        )}
      </div>
      <p className="foot">Scheduling, texting, and your reminders arrive in stage 2.</p>
    </>
  );
}
