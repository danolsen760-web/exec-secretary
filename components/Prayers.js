'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { sundayLabel } from '@/lib/names';
import { displayName } from '@/lib/prayerNames';
import { md } from '@/lib/prayers';
import { phxDate, DOW, phxDow } from '@/lib/time';

const askedLabel = (at, today) => {
  const d = phxDate(at), n = daysTo(d, today);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? DOW[phxDow(d)] : md(d);
};
const daysTo = (today, iso) => Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 864e5);

export default function Prayers({ ctx, P }) {
  const { data, openSheet } = ctx;
  const [offsets, setOffsets] = useState({});
  const [busy, setBusy] = useState('');

  if (!data.prayersReady) {
    return <div className="card pad"><div className="ttl">One setup step left</div>
      <div className="sub" style={{ marginTop: 6 }}>In Supabase, open SQL Editor → New query, paste all of <b>supabase/prayers.sql</b>, and click Run. Then reopen the app.</div></div>;
  }

  async function act(key, body, msg) {
    setBusy(key);
    try { const r = await api('/api/prayers', body); ctx.setData(r.data); if (msg) ctx.toast(msg); }
    catch (e) { ctx.toast(e.message, true); }
    setBusy('');
  }

  const unmatched = P.unmatched();
  const weeks = P.members.length ? P.plan(offsets) : [];
  const nextFor = (date, slot) => setOffsets(o => ({ ...o, [`${date}|${slot}`]: (o[`${date}|${slot}`] || 0) + 1 }));

  return (
    <>
      {!P.members.length && (
        <div className="card made">
          <div><div className="ttl">Import your ward list</div>
            <div className="sub">Suggestions come from the LCR member list: ages, baptism, and phone numbers. Your past year of speakers and prayers is already loaded ({data.sacramentHistory.length} entries).</div></div>
          <button className="btn primary" type="button" onClick={() => openSheet({ type: 'prImport' })}>Import ward list</button>
        </div>
      )}
      {P.members.length > 0 && unmatched.length > 0 && (
        <div className="card made">
          <div><div className="ttl">{unmatched.length} {unmatched.length === 1 ? 'name' : 'names'} from Wardbullet to match</div>
            <div className="sub">Nicknames, visitors, or people who moved. Matching them keeps the "spoke recently" rule right.</div></div>
          <button className="btn soft" type="button" onClick={() => openSheet({ type: 'prMatch' })}>Match names</button>
        </div>
      )}

      {weeks.map(w => {
        const d = daysTo(P.today, w.date);
        return (
          <div className="card pweek" key={w.date}>
            <div className="prow pwhead">
              <div className="ttl">{sundayLabel(w.date)}</div>
              {w.skip ? <span className="pill plain">No sacrament meeting</span>
                : <span className={'pill ' + (d <= 6 ? 'warn' : 'plain')}>{d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d <= 6 ? 'This Sunday' : d <= 13 ? 'Next Sunday' : `In ${Math.round(d / 7)} weeks`}</span>}
            </div>
            {w.skip ? (
              <div className="prow"><span className="sub">{w.skip.note || 'Stake or general conference'}</span>
                <button className="link" type="button" disabled={!!busy} onClick={() => act(`day${w.date}`, { action: 'setDay', date: w.date, noMeeting: false }, 'Back on the plan')}>Undo</button></div>
            ) : (
              <>
                {w.slots.map(s => <Slot key={s.key} s={s} date={w.date} P={P} ctx={ctx} busy={busy} act={act} onNext={() => nextFor(w.date, s.key)} other={w.slots.find(x => x.key !== s.key)} />)}
                <div className="pspeak">
                  <span className="mini">Speakers</span>
                  <span className="sub">{w.speakers.length ? w.speakers.map(h => h.name).join(', ') : 'None entered'}</span>
                  <button className="link" type="button" onClick={() => openSheet({ type: 'prAdd', date: w.date, kind: 'speaker' })}>+ Add</button>
                </div>
                <div className="btns"><button className="link" type="button" disabled={!!busy} onClick={() => act(`day${w.date}`, { action: 'setDay', date: w.date, noMeeting: true, note: '' }, 'Marked as no sacrament meeting')}>No sacrament meeting this week</button></div>
              </>
            )}
          </div>
        );
      })}

      {P.members.length > 0 && (
        <div className="pmore">
          <button className="btn ghost" type="button" onClick={() => openSheet({ type: 'prPeople' })}>Ward list</button>
          <button className="btn ghost" type="button" onClick={() => openSheet({ type: 'prHistory' })}>Speakers and prayers history</button>
          <button className="btn ghost" type="button" onClick={() => openSheet({ type: 'prImport' })}>Update ward list from LCR</button>
        </div>
      )}
      <p className="foot">Rules for who gets suggested are in Settings → Prayer assignments.</p>
    </>
  );
}

function Slot({ s, date, P, ctx, busy, act, onNext, other }) {
  const { openSheet } = ctx;
  const st = s.state;
  const near = daysTo(P.today, date) <= 1;
  const pick = () => openSheet({ type: 'prPick', date, slot: s.key, otherId: other.state.member?.id || other.state.suggestion?.m.id || '' });
  const text = (memberId, kind, askId) => openSheet({ type: 'prText', date, slot: s.key, memberId, kind, askId });

  let body;
  if (st.type === 'open') {
    body = st.suggestion ? (
      <>
        <div className="pname"><span className="name">{displayName(st.suggestion.m)}</span><span className="pill">Suggested</span></div>
        <div className="det">{st.suggestion.info.line}</div>
        <div className="btns">
          <button className="btn ghost" type="button" onClick={pick}>Choose</button>
          <button className="btn ghost" type="button" onClick={onNext}>Someone else</button>
          <button className="btn primary" type="button" onClick={() => text(st.suggestion.m.id, 'ask')}>Ask</button>
        </div>
      </>
    ) : (
      <><div className="sub">No one fits the rules right now.</div>
        <div className="btns"><button className="btn soft" type="button" onClick={pick}>Choose someone</button></div></>
    );
  } else if (st.type === 'asked') {
    const k = `a${st.ask.id}`;
    body = (
      <>
        <div className="pname"><span className="name">{displayName(st.member)}</span><span className="pill warn">Asked {askedLabel(st.ask.askedAt, P.today)}</span></div>
        <div className="btns">
          <button className="link" type="button" onClick={() => text(st.member.id, 'ask', st.ask.id)}>Text again</button>
          <button className="link" type="button" disabled={!!busy} onClick={() => act(k, { action: 'updateAsk', id: st.ask.id, op: 'noreply' }, 'Marked as no reply. Pick someone else.')}>No reply</button>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act(k, { action: 'updateAsk', id: st.ask.id, op: 'no' }, "Marked as can't. Pick someone else.")}>Can't</button>
          <button className="btn okb" type="button" disabled={!!busy} onClick={() => act(k, { action: 'updateAsk', id: st.ask.id, op: 'yes' }, 'Confirmed. Add it to Wardbullet.')}>Said yes</button>
        </div>
      </>
    );
  } else if (st.type === 'yes') {
    const a = st.ask;
    body = (
      <>
        <div className="pname"><span className="name">{displayName(st.member)}</span><span className="pill ok">Said yes</span>{a.remindedAt && <span className="pill ok">Reminded</span>}</div>
        <div className="prow">
          <label className="checks"><input type="checkbox" checked={!!a.inWardbullet} disabled={!!busy} onChange={e => act(`w${a.id}`, { action: 'updateAsk', id: a.id, op: 'wardbullet', value: e.target.checked })} />In Wardbullet</label>
          <span className="btns">
            <button className="link" type="button" onClick={pick}>Change</button>
            {near && !a.remindedAt && <button className="btn soft" type="button" onClick={() => text(st.member.id, 'remind', a.id)}>Send reminder</button>}
          </span>
        </div>
      </>
    );
  } else if (st.type === 'wardbullet') {
    body = (
      <>
        <div className="pname"><span className="name">{st.member ? displayName(st.member) : st.name}</span><span className="pill plain">In Wardbullet</span></div>
        <div className="btns">
          <button className="link" type="button" onClick={pick}>Change</button>
          {near && st.member && <button className="btn soft" type="button" onClick={() => text(st.member.id, 'remind')}>Send reminder</button>}
        </div>
      </>
    );
  }
  return <div className="pslot"><div className="mini">{s.label}</div>{body}</div>;
}
