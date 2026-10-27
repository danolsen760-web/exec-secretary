'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MONTHS, md } from '@/lib/youth';
import { saver } from './bits';

const blankKid = () => ({ id: '', first: '', age: '', birthMonth: 1, birthDay: '', lastInterview: '', lastWith: '', override: 'auto', active: true });

export default function FamilyEditor({ ctx, householdId, onClose }) {
  const { H } = ctx;
  const existing = householdId ? H.household(householdId) : null;
  const [h, setH] = useState(() => existing ? { ...existing } : {
    id: '', family: '', p1Title: 'Bro.', p1First: '', p1Phone: '', p1Email: '', p2Title: 'Sis.', p2First: '', p2Phone: '', p2Email: '', textTo: 2, active: true
  });
  const [kids, setKids] = useState(() => existing
    ? H.kidsOf(existing.id).map(c => ({ ...c, age: String(H.ageOf(c)), lastInterview: c.lastInterview || '', lastWith: c.lastWith || '', override: c.override || 'auto' }))
    : [blankKid()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = saver(ctx);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const setHF = (k, v) => setH(prev => ({ ...prev, [k]: v }));
  const setKF = (i, k, v) => setKids(prev => prev.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  function calc(k) {
    const age = parseInt(k.age, 10), bm = Number(k.birthMonth), bd = parseInt(k.birthDay, 10);
    if (isNaN(age) || !bm || isNaN(bd)) return 'Enter age and birthday to work out the birth year.';
    const by = H.birthYearFrom(age, bm, bd);
    const y = H.youthInfo({ ...k, birthYear: by, birthMonth: bm, birthDay: bd });
    let s = `Born ${by}`;
    if (y && y.youth) s += ` · Youth · next interview with ${H.short(y.next)}${y.due ? `, due ${md(y.due)}` : ''}`;
    else if (age < 11) s += ' · Youth interviews start at 11';
    return s;
  }

  function fail(message) {
    setErr(message);
    document.querySelector('.sheet')?.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
  }

  async function save(activeOverride) {
    const out = [];
    for (const [i, k] of kids.entries()) {
      if (!k.first.trim() && !String(k.age).trim() && !String(k.birthDay).trim()) continue;
      const age = parseInt(k.age, 10), bd = parseInt(k.birthDay, 10), bm = Number(k.birthMonth);
      if (!k.first.trim()) return fail(`Child ${i + 1} needs a first name.`);
      if (isNaN(age) || age < 0) return fail(`Add ${k.first}'s age.`);
      if (isNaN(bd) || bd < 1 || bd > 31) return fail(`Add the day of ${k.first}'s birthday.`);
      out.push({
        id: k.id, first: k.first.trim(), birthMonth: bm, birthDay: bd, birthYear: H.birthYearFrom(age, bm, bd),
        lastInterview: k.lastInterview, lastWith: k.lastWith, override: k.override || 'auto', active: k.active !== false
      });
    }
    if (!h.family.trim()) return fail('Add the family name.');
    if (!h.p1First.trim() && !h.p2First.trim()) return fail('Add at least one parent.');
    const household = { ...h, active: activeOverride === undefined ? h.active !== false : activeOverride };
    setErr('');
    const msg = activeOverride === false ? `Marked the ${h.family} family as moved` : `Saved the ${h.family.trim()} family`;
    const ok = await run(setBusy, () => api('/api/households', { household, kids: out }), msg);
    if (ok) onClose();
  }

  const parentBox = n => (
    <div className="kid">
      <div className="mini">Parent {n}{n === 2 ? ' (optional)' : ''}</div>
      <div className="two">
        <select aria-label={`Parent ${n} title`} value={h[`p${n}Title`]} onChange={e => setHF(`p${n}Title`, e.target.value)}>
          <option>Bro.</option><option>Sis.</option>
        </select>
        <input type="text" placeholder="First name" value={h[`p${n}First`]} onChange={e => setHF(`p${n}First`, e.target.value)} />
      </div>
      <input type="tel" placeholder="Phone" value={h[`p${n}Phone`]} onChange={e => setHF(`p${n}Phone`, e.target.value)} />
      <input type="email" placeholder="Email (optional)" value={h[`p${n}Email`]} onChange={e => setHF(`p${n}Email`, e.target.value)} />
      <label className="checks"><input type="radio" name="textTo" checked={Number(h.textTo) === n} onChange={() => setHF('textTo', n)} />Send youth texts to this parent</label>
    </div>
  );

  return (
    <div id="sheet">
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={existing ? `Edit ${existing.family} family` : 'Add a family'}>
        <div className="wrap">
          <button className="close" type="button" onClick={onClose} aria-label="Close">✕</button>
          <h2>{existing ? `Edit ${existing.family} family` : 'Add a family'}</h2>
          {err && <div className="err">{err}</div>}
          <label className="f">Family name
            <input type="text" value={h.family} placeholder="e.g. Torres" onChange={e => setHF('family', e.target.value)} />
          </label>
          {parentBox(1)}
          {parentBox(2)}

          <div className="mini">Children</div>
          {kids.map((k, i) => (
            <div className="kid" key={k.id || `new-${i}`}>
              <div className="prow"><span className="mini">Child {i + 1}</span>
                <button className="link" type="button" onClick={() => setKids(prev => prev.filter((_, j) => j !== i))}>Remove</button></div>
              <div className="two">
                <input type="text" placeholder="First name" aria-label="First name" value={k.first} onChange={e => setKF(i, 'first', e.target.value)} />
                <input type="number" placeholder="Age" aria-label="Age" min="0" max="30" inputMode="numeric" value={k.age} onChange={e => setKF(i, 'age', e.target.value)} />
              </div>
              <div className="two">
                <label className="f">Birthday month
                  <select value={k.birthMonth} onChange={e => setKF(i, 'birthMonth', Number(e.target.value))}>
                    {MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
                  </select>
                </label>
                <label className="f">Day
                  <input type="number" min="1" max="31" inputMode="numeric" value={k.birthDay} onChange={e => setKF(i, 'birthDay', e.target.value)} />
                </label>
              </div>
              <div className="calc">{calc(k)}</div>
              <div className="two">
                <label className="f">Last youth interview
                  <input type="date" value={k.lastInterview} onChange={e => setKF(i, 'lastInterview', e.target.value)} />
                </label>
                <label className="f">With
                  <select value={k.lastWith} onChange={e => setKF(i, 'lastWith', e.target.value)}>
                    <option value="">Not sure</option>
                    {ctx.data.interviewers.map(iv => <option key={iv.id} value={iv.leaderId}>{H.short(iv.leaderId)}</option>)}
                  </select>
                </label>
              </div>
              <label className="f">Counselor
                <select value={k.override} onChange={e => setKF(i, 'override', e.target.value)}>
                  <option value="auto">Follow the age split</option>
                  <option value="bishop">Bishop only</option>
                  {H.counselorIds.map(id => <option key={id} value={id}>Always {H.short(id)} for counselor turns</option>)}
                </select>
              </label>
            </div>
          ))}
          <button className="btn ghost" type="button" onClick={() => setKids(prev => [...prev, blankKid()])}>+ Add child</button>
          <button className="btn primary big" type="button" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save family'}</button>
          {existing && (
            <button className="btn danger" type="button" disabled={busy} onClick={() => save(h.active === false)}>
              {h.active === false ? 'Mark as active again' : 'Mark as moved out / inactive'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
