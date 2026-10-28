'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { matchName, displayName, ageOf, norm } from '@/lib/prayerNames';
import { SLOTS, md } from '@/lib/prayers';
import { smsHref } from '@/lib/ivclient';
import { sundayLabel } from '@/lib/names';
import { Sheet } from './IvSheets';

const KIND = { speaker: 'Speaker', invocation: 'Opening prayer', benediction: 'Closing prayer' };

async function call(ctx, body, msg) {
  const r = await api('/api/prayers', body);
  ctx.setData(r.data);
  if (msg) ctx.toast(typeof msg === 'function' ? msg(r) : msg);
  return r;
}

/* ---------- Text someone (ask or remind) ---------- */
export function PrTextSheet({ ctx, P, date, slot, memberId, kind, askId, onClose }) {
  const m = P.byId.get(memberId);
  const [useSelf, setUseSelf] = useState(false);
  const c = m ? P.contact(m, useSelf) : null;
  const [text, setText] = useState(() => (c ? P.message(kind, m, date, slot, c) : ''));
  const [busy, setBusy] = useState(false);
  const label = SLOTS.find(s => s.key === slot).label;
  const switchTo = self => { setUseSelf(self); setText(P.message(kind, m, date, slot, P.contact(m, self))); };

  async function record(extra) {
    setBusy(true);
    try {
      if (kind === 'ask') {
        if (askId && !extra) await call(ctx, { action: 'updateAsk', id: askId, op: 'again' });
        else await call(ctx, { action: 'ask', date, slot, memberId, ...extra }, extra?.status === 'yes' ? `${displayName(m)} is down for the ${label.toLowerCase()}` : `Asked ${displayName(m)}`);
      } else if (askId) await call(ctx, { action: 'updateAsk', id: askId, op: 'reminded' }, 'Reminder sent');
      else await call(ctx, { action: 'ask', date, slot, memberId, status: 'yes', inWardbullet: true, reminded: true }, 'Reminder sent');
      onClose();
    } catch (e) { ctx.toast(e.message, true); setBusy(false); }
  }
  if (!m) return <Sheet title="Text" onClose={onClose}><div className="err">Couldn't find that person.</div></Sheet>;
  return (
    <Sheet title={kind === 'ask' ? `Ask for the ${label.toLowerCase()}` : 'Send a reminder'} onClose={onClose}>
      <div className="sub">{displayName(m)} · {sundayLabel(date)}</div>
      <div>
        <div className="mini">To</div>
        <div className="name">{c.label} · {c.phone || 'No phone on file'}</div>
        {c.parent && c.canSelf && <button className="link" type="button" onClick={() => switchTo(true)}>Text {c.name} instead</button>}
        {!c.parent && c.canParent && <button className="link" type="button" onClick={() => switchTo(false)}>Text a parent instead</button>}
      </div>
      <textarea aria-label="Message" value={text} onChange={e => setText(e.target.value)} />
      {c.phone
        ? <a className="btn primary big" href={smsHref(c.phone, text)} onClick={() => setTimeout(() => record(), 300)}>Open in Messages</a>
        : <div className="err">No phone number. Add one in the Ward list, or ask in person.</div>}
      {kind === 'ask' && !askId && <button className="btn ghost" type="button" disabled={busy} onClick={() => record({ status: 'yes' })}>I asked in person · they said yes</button>}
      <div className="foot">Your Messages app opens with this filled in. Tap Send there.</div>
    </Sheet>
  );
}

/* ---------- Choose someone ---------- */
export function PrPickSheet({ ctx, P, date, slot, otherId, onClose }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const other = otherId ? P.byId.get(otherId) : null;
  const list = useMemo(() => P.ranked(date, slot, other, { includeSkipped: all }), [P, date, slot, other, all]);
  const term = norm(q);
  const shown = (term ? list.filter(x => norm(`${x.m.first} ${x.m.goesBy} ${x.m.last}`).includes(term) || norm(displayName(x.m)).includes(term)) : list).slice(0, 80);
  const label = SLOTS.find(s => s.key === slot).label;
  return (
    <Sheet title={`${label} · ${md(date)}`} onClose={onClose}>
      <div className="search"><input type="text" placeholder="Search by name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" /></div>
      <div className="checks"><label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Include people the rules skip</label></div>
      <div className="sub">{all ? 'Everyone, best fit first.' : `${list.length} people fit your rules, best fit first.`}</div>
      <ul className="rows card">
        {shown.map(x => (
          <li className="row" key={x.m.id}>
            <button className="pickrow" type="button" onClick={() => ctx.openSheet({ type: 'prText', date, slot, memberId: x.m.id, kind: 'ask' })}>
              <span className="name">{displayName(x.m)}</span>
              <span className="det">{x.info.line}</span>
              {x.why.length > 0 && <span className="det">{x.why.map(w => <span className="pill warn" key={w}>{w}</span>)}</span>}
            </button>
          </li>
        ))}
        {!shown.length && <li className="row sub">No one matches.</li>}
      </ul>
    </Sheet>
  );
}

/* ---------- Match Wardbullet names ---------- */
export function PrMatchSheet({ ctx, P, onClose }) {
  const names = P.unmatched();
  const sorted = useMemo(() => [...P.members].sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first)), [P]);
  return (
    <Sheet title="Match names" onClose={onClose}>
      <div className="sub">These names from Wardbullet didn't clearly match anyone on the ward list. Pick the person, or mark them as not in the ward (missionaries, visitors, people who moved).</div>
      {names.map(n => <MatchRow key={n.name} n={n} ctx={ctx} P={P} sorted={sorted} />)}
      {!names.length && <div className="note">Every name is matched.</div>}
    </Sheet>
  );
}
function MatchRow({ n, ctx, P, sorted }) {
  const r = useMemo(() => matchName(n.name, P.members, ctx.data.leaders), [n.name, P.members, ctx.data.leaders]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await call(ctx, { action: 'matchByHand', name: n.name, ...(pick === 'visitor' ? { visitor: true } : { memberId: pick }) }, pick === 'visitor' ? `${n.name}: not in the ward` : `Matched ${n.name}`); }
    catch (e) { ctx.toast(e.message, true); setBusy(false); }
  }
  const label = m => `${m.last}, ${m.first} (${ageOf(m, P.today)})`;
  return (
    <div className="box">
      <div className="name">{n.name} <span className="sub">· {n.count} {n.count === 1 ? 'time' : 'times'}</span></div>
      <div className="search">
        <select aria-label={`Who is ${n.name}`} value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">Choose…</option>
          <option value="visitor">Not in the ward</option>
          {r.candidates.length > 0 && <optgroup label="Close matches">{r.candidates.slice(0, 6).map(m => <option key={m.id} value={m.id}>{label(m)}</option>)}</optgroup>}
          <optgroup label="Everyone">{sorted.map(m => <option key={m.id} value={m.id}>{label(m)}</option>)}</optgroup>
        </select>
        <button className="btn primary" type="button" disabled={!pick || busy} onClick={save}>{busy ? '…' : 'Save'}</button>
      </div>
    </div>
  );
}

/* ---------- Ward list ---------- */
export function PrPeopleSheet({ ctx, P, onClose }) {
  const [q, setQ] = useState('');
  const [onlyNo, setOnlyNo] = useState(false);
  const [open, setOpen] = useState('');
  const term = norm(q);
  const list = P.members.filter(m => (!onlyNo || m.neverAsk) && (!term || norm(`${m.first} ${m.goesBy} ${m.last}`).includes(term) || norm(displayName(m)).includes(term)));
  const noCount = P.members.filter(m => m.neverAsk).length;
  return (
    <Sheet title="Ward list" onClose={onClose}>
      <div className="search"><input type="text" placeholder="Search by name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" /></div>
      <div className="checks"><label><input type="checkbox" checked={onlyNo} onChange={e => setOnlyNo(e.target.checked)} />Only my don't-ask list ({noCount})</label></div>
      <div className="sub">{P.members.length} members. Tap someone to set a nickname, a phone, or to never suggest them.</div>
      <ul className="rows card">
        {list.slice(0, 120).map(m => (
          <li className="row col" key={m.id}>
            <button className="pickrow" type="button" onClick={() => setOpen(open === m.id ? '' : m.id)}>
              <span className="name">{displayName(m)} {m.neverAsk && <span className="pill plain">Don't ask</span>}</span>
              <span className="det">{P.info(m, P.today).line}{m.flags ? ` · ${m.flags}` : ''}{!m.phone ? ' · no phone' : ''}</span>
            </button>
            {open === m.id && <MemberEdit key={m.id} m={m} ctx={ctx} onDone={() => setOpen('')} />}
          </li>
        ))}
      </ul>
      {list.length > 120 && <div className="sub">Showing 120. Search to find others.</div>}
    </Sheet>
  );
}
function MemberEdit({ m, ctx, onDone }) {
  const [f, setF] = useState({ goesBy: m.goesBy || '', phone: m.phone || '', neverAsk: !!m.neverAsk, note: m.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true);
    try { await call(ctx, { action: 'saveMember', id: m.id, ...f }, `Saved ${m.first.split(' ')[0]} ${m.last}`); onDone(); }
    catch (e) { ctx.toast(e.message, true); setBusy(false); }
  }
  return (
    <div className="box" style={{ width: '100%' }}>
      <div className="sub">LCR name: {m.last}, {m.first}</div>
      <div className="two">
        <label className="f">Goes by<input type="text" value={f.goesBy} placeholder={m.first.split(' ')[0]} onChange={e => set('goesBy', e.target.value)} /></label>
        <label className="f">Phone<input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
      </div>
      <div className="checks"><label><input type="checkbox" checked={f.neverAsk} onChange={e => set('neverAsk', e.target.checked)} />Don't suggest for prayers</label></div>
      {f.neverAsk && <label className="f">Why (only you see this)<input type="text" value={f.note} placeholder="e.g. doesn't attend" onChange={e => set('note', e.target.value)} /></label>}
      <div className="btns"><button className="btn ghost" type="button" onClick={onDone}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    </div>
  );
}

/* ---------- History ---------- */
export function PrHistorySheet({ ctx, P, onClose }) {
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [asOf, setAsOf] = useState(ctx.data.today);
  const [limit, setLimit] = useState(12);
  const [busy, setBusy] = useState(false);
  const rows = ctx.data.sacramentHistory;
  const dates = [...new Set(rows.map(r => r.date))].sort().reverse();
  const order = { invocation: 0, speaker: 1, benediction: 2 };
  async function importText() {
    setBusy(true);
    try { await call(ctx, { action: 'importWardbullet', text, asOf }, r => `Added ${r.summary.lines} lines. Matched ${r.summary.matched} new names.`); setPaste(false); setText(''); }
    catch (e) { ctx.toast(e.message, true); }
    setBusy(false);
  }
  async function remove(id) {
    try { await call(ctx, { action: 'removeHistory', id }, 'Removed'); } catch (e) { ctx.toast(e.message, true); }
  }
  return (
    <Sheet title="Speakers and prayers" onClose={onClose}>
      {!paste ? <button className="btn ghost" type="button" onClick={() => setPaste(true)}>Paste a Wardbullet report</button> : (
        <div className="box">
          <div className="sub">From the Speakers/Prayers Report, copy the rows (Activity, Member, Days) and paste them here. Rows you already have are skipped.</div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'Speaker\tJim Talbot\t9\nInvocation\tArjay Gamble\t2'} />
          <label className="f">"Days" counted from<input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
          <div className="btns"><button className="btn ghost" type="button" onClick={() => setPaste(false)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={importText}>{busy ? 'Adding…' : 'Add'}</button></div>
        </div>
      )}
      <div className="sub">Prayers you confirm in the app count automatically. Add speakers on each Sunday in the Prayers tab.</div>
      {dates.slice(0, limit).map(d => (
        <div key={d}>
          <div className="mini" style={{ marginTop: 8 }}>{sundayLabel(d)}</div>
          <ul className="rows card">
            {rows.filter(r => r.date === d).sort((a, b) => order[a.kind] - order[b.kind]).map(r => (
              <li className="row" key={r.id}>
                <div className="who"><div className="name">{r.memberId && P.byId.get(r.memberId) ? displayName(P.byId.get(r.memberId)) : r.name}</div>
                  <div className="det">{KIND[r.kind]}{r.visitor ? ' · not in the ward' : !r.memberId ? ' · not matched' : ''}</div></div>
                <button className="link" type="button" aria-label={`Remove ${r.name}`} onClick={() => remove(r.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {dates.length > limit && <button className="btn ghost" type="button" onClick={() => setLimit(l => l + 12)}>Show older</button>}
    </Sheet>
  );
}

/* ---------- Add a speaker ---------- */
export function PrAddSheet({ ctx, P, date, kind, onClose }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const term = norm(q);
  const list = term ? P.members.filter(m => norm(`${m.first} ${m.goesBy} ${m.last}`).includes(term) || norm(displayName(m)).includes(term)).slice(0, 30) : [];
  async function add(body, msg) {
    setBusy(true);
    try { await call(ctx, { action: 'addHistory', date, kind, ...body }, msg); onClose(); }
    catch (e) { ctx.toast(e.message, true); setBusy(false); }
  }
  return (
    <Sheet title={`Add a ${KIND[kind].toLowerCase()} · ${md(date)}`} onClose={onClose}>
      <div className="search"><input type="text" placeholder="Search by name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" autoFocus /></div>
      <ul className="rows card">
        {list.map(m => (
          <li className="row" key={m.id}>
            <button className="pickrow" type="button" disabled={busy} onClick={() => add({ memberId: m.id }, `Added ${displayName(m)}`)}>
              <span className="name">{displayName(m)}</span><span className="det">{ageOf(m, P.today)} · {m.last}, {m.first}</span>
            </button>
          </li>
        ))}
        {term && <li className="row"><button className="pickrow" type="button" disabled={busy} onClick={() => add({ name: q.trim(), visitor: true }, `Added ${q.trim()}`)}>
          <span className="name">Add "{q.trim()}"</span><span className="det">Someone not on the ward list (a visitor or stake speaker)</span></button></li>}
      </ul>
    </Sheet>
  );
}
