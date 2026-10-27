'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { HYMNS } from '@/lib/hymns';
import { MEETINGS, addDays, sundayLabel, shortName } from '@/lib/names';
import { meetingsOn, lastDone, rotation, hymnCandidates, initialPicks } from '@/lib/suggest';
import { md, parseDate } from '@/lib/youth';
import { Caret } from './bits';

const when = iso => (iso ? `on ${md(parseDate(iso))}` : '');

export default function Agendas({ ctx, date, setDate }) {
  const { data, toast } = ctx;
  const meetings = meetingsOn(date, data.settings);
  const [chosen, setChosen] = useState('B');
  const m = meetings.includes(chosen) ? chosen : 'B';
  const [edits, setEdits] = useState({}); // unsaved picks, keyed "B|2026-11-01"
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [attOpen, setAttOpen] = useState(false);

  const key = `${m}|${date}`;
  const other = m === 'B' ? 'W' : 'B';
  const otherSaved = data.agendas.find(a => a.meeting === other && a.date === date);
  const otherHymn = (edits[`${other}|${date}`] || otherSaved || {}).hymn;
  const base = useMemo(() => initialPicks(data, m, date, otherHymn), [data, m, date, otherHymn]);
  const p = edits[key] || base;
  const saved = data.agendas.find(a => a.meeting === m && a.date === date);
  const dirty = !!edits[key];
  const set = patch => setEdits(prev => ({ ...prev, [key]: { ...p, ...patch } }));

  const L = id => data.leaders.find(l => l.id === id);
  const name = id => shortName(L(id)) || 'Choose…';
  const inMeeting = data.leaders.filter(l => (m === 'B' ? l.bishopric : l.council) && (l.active !== false || p.attendees.includes(l.id)));
  const going = inMeeting.filter(l => p.attendees.includes(l.id));
  const { prayed, thought: thoughtLast } = lastDone(data, m, date);
  const hymnLast = useMemo(() => {
    const out = {};
    data.agendas.filter(a => a.date < date && a.hymn).sort((a, b) => b.date.localeCompare(a.date)).forEach(a => { if (!out[a.hymn]) out[a.hymn] = a.date; });
    return out;
  }, [data, date]);

  function swap(field) {
    if (field === 'hymn') {
      const list = hymnCandidates(data, m, date, otherHymn);
      const i = (p.hymnIdx || 0) + 1;
      return set({ hymn: list[i % list.length], hymnIdx: i });
    }
    const lastMap = field === 'nextThought' ? thoughtLast : prayed;
    const exclude = field === 'nextThought' ? [p.thought] : [p.thought, p.openPrayer, p.closePrayer].filter(x => x && x !== p[field]);
    const list = rotation(data, p.attendees, lastMap, exclude);
    if (!list.length) return;
    set({ [field]: list[(list.indexOf(p[field]) + 1) % list.length] });
  }

  function toggleAttendee(id, on) {
    const attendees = on ? [...p.attendees, id] : p.attendees.filter(x => x !== id);
    const patch = { attendees };
    if (!on) {
      // Fill in anyone who's no longer coming
      const { prayed: pr } = lastDone(data, m, date);
      ['openPrayer', 'closePrayer'].forEach(f => {
        if (p[f] === id) patch[f] = rotation(data, attendees, pr, [p.thought, p.openPrayer, p.closePrayer].filter(x => x !== id))[0] || null;
      });
    }
    set(patch);
  }

  async function create() {
    setBusy('create'); setResult(null);
    try {
      const res = await api('/api/agenda/create', { meeting: m, date, ...p });
      ctx.setData(res.data);
      setEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
      setResult({ kind: 'created', ...res.result });
      toast(res.result.updated ? 'Agenda Doc updated' : 'Agenda created in Drive');
    } catch (e) { toast(e.message, true); }
    setBusy('');
  }

  async function send() {
    setBusy('send');
    try {
      const res = await api('/api/agenda/send', { meeting: m, date });
      ctx.setData(res.data);
      setResult({ kind: 'sent', ...res.result });
      toast(`Emailed the agenda to ${res.result.count} ${res.result.count === 1 ? 'person' : 'people'}`);
    } catch (e) { toast(e.message, true); }
    setBusy('');
  }

  const personSelect = (field, options) => (
    <select aria-label={field} value={p[field] || ''} onChange={e => set({ [field]: e.target.value })}>
      {!p[field] && <option value="">Choose…</option>}
      {options.map(l => <option key={l.id} value={l.id}>{shortName(l)}</option>)}
    </select>
  );
  const thoughtOk = p.attendees.includes(p.thought);
  const meta = (map, id, verb) => (map[id] ? `Last ${verb} ${when(map[id])}` : `No ${verb === 'prayed' ? 'prayer' : 'thought'} recorded yet`);

  return (
    <>
      <div className="datebar card">
        <button className="btn ghost" type="button" aria-label="Previous Sunday" onClick={() => { setDate(addDays(date, -7)); setResult(null); }}>‹</button>
        <div className="datemid"><div className="ttl">{sundayLabel(date)}</div>
          <div className="sub">{meetings.length === 2 ? 'Bishopric and Ward Council' : 'Bishopric only'}</div></div>
        <button className="btn ghost" type="button" aria-label="Next Sunday" onClick={() => { setDate(addDays(date, 7)); setResult(null); }}>›</button>
      </div>

      {meetings.length === 2 && (
        <div className="seg" role="tablist">
          {meetings.map(k => {
            const a = data.agendas.find(x => x.meeting === k && x.date === date);
            return <button key={k} role="tab" type="button" aria-selected={m === k} onClick={() => { setChosen(k); setResult(null); }}>
              {MEETINGS[k].short}{a?.sentAt ? ' ✓' : a?.docUrl ? ' •' : ''}</button>;
          })}
        </div>
      )}

      <details className="card att" open={attOpen} onToggle={e => { if (e.currentTarget.open !== attOpen) setAttOpen(e.currentTarget.open); }}>
        <summary><span className="name">Attendees</span><span className="sub">{going.length} of {inMeeting.length} <Caret /></span></summary>
        {attOpen && <div className="people">
          {inMeeting.map(l => (
            <label key={l.id}><input type="checkbox" checked={p.attendees.includes(l.id)} onChange={e => toggleAttendee(l.id, e.target.checked)} />
              {l.first} {l.last}<span className="role">{l.calling}</span></label>
          ))}
        </div>}
      </details>

      <p className="label">Your parts of the agenda</p>
      <div className="card">
        <div className="field">
          <div className="ftop"><span className="fname">Opening hymn</span>
            <span className="meta">{otherHymn && otherHymn === p.hymn ? <span className="pill warn">Same as {MEETINGS[other].short}</span> : hymnLast[p.hymn] ? `Last used ${when(hymnLast[p.hymn])}` : 'Not used recently'}</span></div>
          <div className="pick">
            <select aria-label="Opening hymn" value={p.hymn || ''} onChange={e => set({ hymn: Number(e.target.value) })}>
              <optgroup label="Hymns">{HYMNS.filter(h => h[0] < 1000).map(([n, t]) => <option key={n} value={n}>{n} {t}</option>)}</optgroup>
              <optgroup label="Hymns—For Home and Church">{HYMNS.filter(h => h[0] > 1000).map(([n, t]) => <option key={n} value={n}>{n} {t}</option>)}</optgroup>
            </select>
            <button className="swap" type="button" onClick={() => swap('hymn')}>Swap</button>
          </div>
        </div>

        <div className="field">
          <div className="ftop"><span className="fname">Opening prayer</span><span className="meta">{meta(prayed, p.openPrayer, 'prayed')}</span></div>
          <div className="pick">{personSelect('openPrayer', going)}<button className="swap" type="button" onClick={() => swap('openPrayer')}>Swap</button></div>
        </div>

        <div className="field">
          <div className="ftop"><span className="fname">Thought/Training</span><span className="meta">{meta(thoughtLast, p.thought, 'gave')}</span></div>
          <div className="pick">{personSelect('thought', inMeeting)}</div>
          {thoughtOk ? <input type="text" aria-label="Thought topic" placeholder="Topic or resource (optional)" value={p.thoughtNote} onChange={e => set({ thoughtNote: e.target.value })} />
            : <div><span className="pill warn">Not attending · choose someone else</span></div>}
        </div>

        <div className="field">
          <div className="ftop"><span className="fname">Closing prayer</span><span className="meta">{meta(prayed, p.closePrayer, 'prayed')}</span></div>
          <div className="pick">{personSelect('closePrayer', going)}<button className="swap" type="button" onClick={() => swap('closePrayer')}>Swap</button></div>
        </div>

        <div className="field next">
          <div className="ftop"><span className="fname">Next Week's Thought/Training</span><span className="meta">{meta(thoughtLast, p.nextThought, 'gave')}</span></div>
          <div className="pick">{personSelect('nextThought', inMeeting)}<button className="swap" type="button" onClick={() => swap('nextThought')}>Swap</button></div>
          <input type="text" aria-label="Next week's topic" placeholder="Topic or resource (optional)" value={p.nextNote} onChange={e => set({ nextNote: e.target.value })} />
          <div className="sub">Becomes the Thought/Training on next week's agenda.</div>
        </div>
      </div>

      <div className="card made">
        {!saved?.docUrl ? (
          <>
            <div className="sub">Copies last week's {MEETINGS[m].short} Doc, fills in these parts, and saves it to the Agendas folder. Everything else carries over.</div>
            <button className="btn primary big" type="button" disabled={!!busy || !thoughtOk} onClick={create}>
              {busy === 'create' ? 'Creating the Doc…' : `Create ${MEETINGS[m].short} agenda`}</button>
          </>
        ) : (
          <>
            <div>
              <div className="ttl">{saved.sentAt ? 'Created and sent ✓' : 'Created ✓'}</div>
              <a className="file" href={saved.docUrl} target="_blank" rel="noopener">{saved.docName || 'Open the agenda'}</a>
              <div className="sub">{saved.sentAt ? `Emailed ${md(new Date(saved.sentAt))}` : 'Look it over and add anything that came up, then send it.'}</div>
            </div>
            {dirty && <button className="btn soft big" type="button" disabled={!!busy} onClick={create}>{busy === 'create' ? 'Updating…' : 'Update the Doc with these changes'}</button>}
            <div className="btns">
              <a className="btn ghost" href={saved.docUrl} target="_blank" rel="noopener">Open Doc</a>
              <button className="btn primary" type="button" disabled={!!busy || dirty} onClick={send}>
                {busy === 'send' ? 'Sending…' : saved.sentAt ? 'Send again' : `Email link to ${countEmails(data, saved)}`}</button>
            </div>
          </>
        )}
        {result?.kind === 'created' && result.missing?.length > 0 && (
          <div className="err">Couldn't find these lines in the Doc, so they weren't changed: {result.missing.join(', ')}. Check the wording in the Doc.</div>
        )}
        {result?.kind === 'created' && result.source && <div className="sub">Copied from {result.source}</div>}
        {result?.kind === 'sent' && result.noEmail?.length > 0 && (
          <div className="note">No email on file for {result.noEmail.join(', ')}. Add it in Settings → Meeting attendees.</div>
        )}
      </div>
    </>
  );
}

function countEmails(data, saved) {
  const n = data.leaders.filter(l => saved.attendees.includes(l.id) && l.email).length;
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}
