'use client';
import { useState } from 'react';
import { MONTHS, parseDate, md } from '@/lib/youth';
import { IvTag, DuePill, Caret } from './bits';

export default function Members({ ctx }) {
  const { data, H, openFamily } = ctx;
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(() => new Set());

  const term = q.trim().toLowerCase();
  const all = [...data.households].sort((a, b) => a.family.localeCompare(b.family));
  const inactiveN = all.filter(h => h.active === false).length;
  const list = all.filter(h => (showInactive || h.active !== false) && (!term ||
    h.family.toLowerCase().includes(term) ||
    `${h.p1First} ${h.p2First}`.toLowerCase().includes(term) ||
    H.kidsOf(h.id).some(c => c.first.toLowerCase().includes(term))));
  const youthN = H.allYouth().length;

  const toggle = (id, isOpen) => setOpen(prev => { const n = new Set(prev); isOpen ? n.add(id) : n.delete(id); return n; });

  return (
    <>
      <div className="search">
        <input type="text" id="q" placeholder="Search families or names" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
        <button className="btn primary" type="button" onClick={() => openFamily('')}>+ Family</button>
      </div>
      <div className="sub">
        {all.length - inactiveN} families · {youthN} youth
        {inactiveN > 0 && <> · <button className="link" type="button" onClick={() => setShowInactive(s => !s)}>{showInactive ? 'Hide' : 'Show'} {inactiveN} moved/inactive</button></>}
      </div>

      {list.map(h => (
        <Family key={h.id} h={h} H={H} isOpen={open.has(h.id)} onToggle={o => toggle(h.id, o)} onEdit={() => openFamily(h.id)} />
      ))}
      {!list.length && (
        <div className="card pad sub">
          {all.length ? `No families match "${q}".` : 'No families yet. Tap + Family to add the first one. Start with the families who have youth.'}
        </div>
      )}
    </>
  );
}

function Family({ h, H, isOpen, onToggle, onEdit }) {
  const kids = H.kidsOf(h.id);
  const youthCount = kids.filter(c => { const y = H.youthInfo(c); return y && y.youth; }).length;
  const parents = [1, 2].filter(n => h[`p${n}First`]);

  return (
    <details className={'card hh' + (h.active === false ? ' inactive' : '')} open={isOpen} onToggle={e => { if (e.currentTarget.open !== isOpen) onToggle(e.currentTarget.open); }}>
      <summary>
        <div>
          <div className="ttl">{h.family} family {h.active === false && <span className="pill plain">Moved / inactive</span>}</div>
          <div className="sub">
            {[h.p1First, h.p2First].filter(Boolean).join(' & ')}
            {kids.length > 0 && ` · ${kids.length} ${kids.length === 1 ? 'child' : 'children'}`}
            {youthCount > 0 && ` · ${youthCount} youth`}
          </div>
        </div>
        <Caret />
      </summary>
      {isOpen && (
        <div className="hhbody">
          <div>
            <div className="mini">Parents</div>
            {parents.map(n => {
              const phone = h[`p${n}Phone`], email = h[`p${n}Email`];
              return (
                <div className="person" key={n}>
                  <div className="prow">
                    <span className="name">{h[`p${n}Title`]} {h[`p${n}First`]} {h.family}</span>
                    {kids.length > 0 && Number(h.textTo) === n && <span className="pill ok">Gets youth texts</span>}
                  </div>
                  <div className="det">
                    {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> : 'No phone'}
                    {email && <span>· {email}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {kids.length > 0 && (
            <div>
              <div className="mini">Children</div>
              {kids.map(c => <Child key={c.id} c={c} H={H} />)}
            </div>
          )}
          <div className="btns"><button className="btn soft" type="button" onClick={onEdit}>Edit family</button></div>
        </div>
      )}
    </details>
  );
}

function Child({ c, H }) {
  const y = H.youthInfo(c);
  const last = c.lastInterview ? parseDate(c.lastInterview) : null;
  return (
    <div className="person">
      <div className="prow">
        <span className="name">{c.first}</span>
        <span className="sub">Age {y ? y.age : '?'} · Birthday {MONTHS[c.birthMonth - 1]} {c.birthDay}</span>
      </div>
      {y && y.youth ? (
        <>
          <div className="track"><div>
            <div className="det">Youth interview · next with <IvTag id={y.next} H={H} /></div>
            <div><DuePill y={y} /></div>
          </div></div>
          {last && <div className="det">Last: {md(last)}, {last.getFullYear()}{c.lastWith ? ` with ${H.short(c.lastWith)}` : ''}</div>}
          {c.override && c.override !== 'auto' && (
            <div className="det"><span className="pill">Override: {c.override === 'bishop' ? 'Bishop only' : `Always ${H.short(c.override)}`}</span></div>
          )}
        </>
      ) : y ? <div className="det">{y.age < 11 ? 'Not youth age yet' : 'Adult'}</div> : null}
    </div>
  );
}
