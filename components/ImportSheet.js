'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { buildFamilies, matchExisting } from '@/lib/lcrImport';
import { Sheet } from './IvSheets';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ImportSheet({ ctx, onClose }) {
  const { data, toast } = ctx;
  const [hhText, setHhText] = useState('');
  const [memText, setMemText] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [youthOnly, setYouthOnly] = useState(true);
  const [textPref, setTextPref] = useState('first');
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');

  function read() {
    setErr('');
    if (!hhText.trim() || !memText.trim()) return setErr('Paste both lists first.');
    const r = buildFamilies(hhText, memText);
    if (!r.families.length) return setErr("Couldn't find any households in the first list. Make sure you copied the whole household list.");
    r.families.forEach(f => { f.existing = matchExisting(f, data); });
    const pick = {};
    r.families.forEach(f => { pick[f.key] = !f.outOfUnitOnly && f.kids.length > 0; });
    setPicked(pick);
    setResult(r);
  }

  const shown = useMemo(() => (result ? result.families.filter(f => !youthOnly || f.youth > 0) : []), [result, youthOnly]);
  const chosen = shown.filter(f => picked[f.key]);

  function textToFor(f) {
    if (textPref === 'first') return f.textTo;
    const want = textPref === 'mom' ? 'Sis.' : 'Bro.';
    const i = f.parents.findIndex(p => p.title === want && p.phone);
    return i >= 0 ? i + 1 : f.textTo;
  }

  async function save() {
    setBusy('Saving…');
    const payload = chosen.map(f => ({ key: f.key, family: f.family, existingId: f.existing ? f.existing.id : null, parents: f.parents, textTo: textToFor(f), kids: f.kids }));
    const total = { added: 0, updated: 0, kidsAdded: 0, kidsUpdated: 0, skipped: [] };
    try {
      for (let i = 0; i < payload.length; i += 10) {
        setBusy(`Saving ${Math.min(i + 10, payload.length)} of ${payload.length}…`);
        const r = await api('/api/import', { families: payload.slice(i, i + 10) });
        ctx.setData(r.data);
        Object.keys(total).forEach(k => { total[k] = Array.isArray(total[k]) ? total[k].concat(r.summary[k]) : total[k] + r.summary[k]; });
      }
      toast(`Added ${total.added} ${total.added === 1 ? 'family' : 'families'}, updated ${total.updated}${total.skipped.length ? `. Skipped ${total.skipped.length} without a birthday.` : ''}`);
      onClose();
    } catch (e) { toast(e.message, true); setBusy(''); }
  }

  return (
    <Sheet title="Import from LCR" onClose={onClose}>
      {!result ? (
        <>
          <div className="note">On a computer, open each list in LCR, select the whole list, copy it, and paste it below. Nothing is saved until you check the preview.</div>
          <label className="f">1. Household list<textarea value={hhText} onChange={e => setHhText(e.target.value)} placeholder="Paste the household list here" /></label>
          <label className="f">2. Member list<textarea value={memText} onChange={e => setMemText(e.target.value)} placeholder="Paste the member list here" /></label>
          {err && <div className="err">{err}</div>}
          <button className="btn primary big" type="button" onClick={read}>Read lists</button>
        </>
      ) : (
        <>
          <div className="sub">Found {result.householdCount} households and {result.memberCount} members. {result.families.filter(f => f.youth).length} families have youth.
            {result.unmatched.length > 0 && ` ${result.unmatched.length} people in the member list weren't in a household and were left out.`}</div>
          <div className="checks"><label><input type="checkbox" checked={youthOnly} onChange={e => setYouthOnly(e.target.checked)} />Only families with youth</label></div>
          <label className="f">Send youth interview texts to
            <select value={textPref} onChange={e => setTextPref(e.target.value)}>
              <option value="first">The first parent listed</option>
              <option value="mom">Mom, when she has a phone</option>
              <option value="dad">Dad, when he has a phone</option>
            </select>
          </label>
          <div className="prow">
            <span className="sub">{chosen.length} of {shown.length} selected</span>
            <span><button className="link" type="button" onClick={() => setPicked(p => ({ ...p, ...Object.fromEntries(shown.map(f => [f.key, true])) }))}>All</button>{' '}
              <button className="link" type="button" onClick={() => setPicked(p => ({ ...p, ...Object.fromEntries(shown.map(f => [f.key, false])) }))}>None</button></span>
          </div>
          <ul className="rows importlist">
            {shown.map(f => (
              <li className="row" key={f.key}>
                <input type="checkbox" aria-label={`Import ${f.family}`} checked={!!picked[f.key]} onChange={e => setPicked(p => ({ ...p, [f.key]: e.target.checked }))} />
                <div className="who">
                  <div className="name">{f.family}{' '}
                    {f.existing ? <span className="pill">Already in app · will fill in</span> : <span className="pill ok">New</span>}</div>
                  <div className="det">{f.parents.length ? f.parents.map(p => `${p.title} ${p.first}${p.phone ? '' : ' (no phone)'}${p.member ? '' : ' · not a member'}`).join(', ') : 'No parent in household'}</div>
                  {f.kids.length > 0 && <div className="det">{f.kids.map(k => `${k.first}${k.last !== f.family ? ` ${k.last}` : ''} ${k.age}${k.birth ? ` (${MONTHS[k.birth.month - 1]} ${k.birth.day})` : ''}${k.phone ? ' · own phone' : ''}${k.textSelf ? ' · texts go to them' : ''}${k.flags.length ? ` · ${k.flags.join(', ')}` : ''}`).join('; ')}</div>}
                  {f.notes.length > 0 && <div className="det">{f.notes.map(n => <span className="pill warn" key={n}>{n}</span>)}</div>}
                </div>
              </li>
            ))}
          </ul>
          <button className="btn ghost" type="button" onClick={() => setResult(null)}>Back to paste</button>
          <button className="btn primary big stickybtn" type="button" disabled={!chosen.length || !!busy} onClick={save}>
            {busy || `Import ${chosen.length} ${chosen.length === 1 ? 'family' : 'families'}`}</button>
        </>
      )}
    </Sheet>
  );
}
