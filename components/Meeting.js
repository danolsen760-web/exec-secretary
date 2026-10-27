'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MEETINGS, addDays, sundayLabel } from '@/lib/names';
import { meetingsOn, meetingSunday } from '@/lib/suggest';

const LOCKED = /^(opening hymn|opening prayer|thought\/training|closing prayer)\s*:/i;
const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

export default function Meeting({ ctx }) {
  const { data, toast, go } = ctx;
  const [date, setDate] = useState(() => meetingSunday());
  const meetings = meetingsOn(date, data.settings);
  const [chosen, setChosen] = useState('B');
  const m = meetings.includes(chosen) ? chosen : 'B';
  const key = `${m}|${date}`;
  const [store, setStore] = useState({}); // key -> { loading, res, error }
  const [ui, setUi] = useState({ editing: null, adding: null, text: '', who: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (k, meeting, d) => {
    setStore(prev => ({ ...prev, [k]: { ...(prev[k] || {}), loading: true, error: '' } }));
    try {
      const res = await api(`/api/meeting?meeting=${meeting}&date=${d}`);
      setStore(prev => ({ ...prev, [k]: { loading: false, res } }));
    } catch (e) {
      setStore(prev => ({ ...prev, [k]: { loading: false, error: e.message } }));
    }
  }, []);
  useEffect(() => { if (!store[key]) load(key, m, date); }, [key, m, date, store, load]);

  const cur = store[key] || { loading: true };
  const res = cur.res;
  const marks = (res && res.marks) || [];

  async function mark(body) {
    setBusy(true);
    try {
      const out = await api('/api/meeting/mark', { meeting: m, date, ...body });
      setStore(prev => ({ ...prev, [key]: { ...prev[key], res: { ...prev[key].res, marks: out.marks } } }));
      setUi({ editing: null, adding: null, text: '', who: '' });
      api('/api/data').then(ctx.setData).catch(() => {}); // keeps the Agenda Builder's change count current
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  }
  const findMark = (kind, text) => marks.find(x => x.kind === kind && norm(x.text) === norm(text));
  const toggleDone = text => { const d = findMark('done', text); d ? mark({ deleteId: d.id }) : mark({ kind: 'done', text }); };

  const move = days => { setDate(addDays(date, days)); setUi({ editing: null, adding: null, text: '', who: '' }); };
  const header = (
    <>
      <div className="datebar card">
        <button className="btn ghost" type="button" aria-label="Previous Sunday" onClick={() => move(-7)}>‹</button>
        <div className="datemid"><div className="ttl">{sundayLabel(date)}</div><div className="sub">{meetings.length === 2 ? 'Bishopric and Ward Council' : 'Bishopric'}</div></div>
        <button className="btn ghost" type="button" aria-label="Next Sunday" onClick={() => move(7)}>›</button>
      </div>
      <div className="toolbar">
        {meetings.length === 2 ? (
          <div className="seg" role="tablist">
            {meetings.map(k => <button key={k} role="tab" type="button" aria-selected={m === k} onClick={() => setChosen(k)}>{MEETINGS[k].short}</button>)}
          </div>
        ) : <div className="ttl" style={{ flex: 1 }}>{MEETINGS[m].name}</div>}
        <button className="refresh" type="button" disabled={cur.loading} onClick={() => load(key, m, date)}>{cur.loading ? 'Loading…' : '↻ Refresh'}</button>
      </div>
    </>
  );

  if (cur.loading && !res) return <>{header}<div className="card pad sub">Opening the agenda from Google Docs…</div></>;
  if (cur.error) return <>{header}<div className="card pad"><div className="err">{cur.error}</div></div></>;
  if (res.status === 'skipped') return <>{header}<div className="card pad"><div className="ttl">No meeting this Sunday</div>{res.reason && <div className="sub">{res.reason}</div>}</div></>;
  if (res.status === 'none') {
    return <>{header}<div className="card made"><div className="ttl">No agenda for this Sunday yet</div>
      <div className="sub">Create it in the Agenda Builder, and it will show up here.</div>
      <button className="btn primary" type="button" onClick={() => go('agendas')}>Open Agenda Builder</button></div></>;
  }
  if (res.status === 'missing') return <>{header}<div className="card pad"><div className="err">The agenda Doc for this Sunday was deleted or moved to the trash.</div></div></>;

  /* ---------- turn the Doc into rows ---------- */
  const els = res.doc.elements;
  const rows = [];
  let section = '', stack = [], title = '', counter = 0;
  const addable = () => !/^(opening|closing)$/i.test(section.trim());
  const closeGroups = level => {
    while (stack.length && stack[stack.length - 1].level >= level) {
      const g = stack.pop();
      if (addable() && (g.level === 0 || g.hasKids) && !LOCKED.test(g.text)) rows.push({ type: 'after', anchor: g.text, level: g.level + 1, key: `after-${g.idx}` });
    }
  };
  els.forEach((el, idx) => {
    if (el.type === 'li') {
      closeGroups(el.level);
      if (stack.length) stack[stack.length - 1].hasKids = true;
      if (el.level === 0) counter++;
      rows.push({ ...el, type: 'item', idx, num: el.level === 0 ? counter : null, section, locked: LOCKED.test(el.text) || !addable() });
      stack.push({ text: el.text, level: el.level, idx, hasKids: false });
      return;
    }
    closeGroups(0);
    if (el.type === 'table') {
      const head = norm((el.rows[0] || []).join(' '));
      rows.push({ type: head.includes('task') && head.includes('assign') ? 'actions' : 'table', rows: el.rows, key: `t-${idx}` });
      return;
    }
    const t = el.text.trim();
    if (!t) return;
    if (!title && idx < 3 && t === t.toUpperCase()) { title = t; return; }
    if (/^(date|attendees)\s*:/i.test(t)) return rows.push({ type: 'meta', text: t, key: `m-${idx}` });
    if (/^next\s+week/i.test(t)) return rows.push({ type: 'next', text: t, key: `n-${idx}` });
    if (el.heading || t.split(/\s+/).length <= 3) { section = t; counter = 0; return rows.push({ type: 'heading', text: t, key: `h-${idx}` }); }
    rows.push({ type: 'para', text: t, links: el.links, key: `p-${idx}` });
  });
  closeGroups(0);

  // Sub-items of something you checked off are removed with it.
  const chain = [];
  rows.forEach(r => {
    if (r.type !== 'item') return;
    chain.length = r.level;
    r.parentDone = chain.some(Boolean);
    chain[r.level] = r.parentDone || !!findMark('done', r.text);
  });

  const adds = marks.filter(x => x.kind === 'add');
  const actionAdds = marks.filter(x => x.kind === 'action');
  const stats = { done: marks.filter(x => x.kind === 'done').length, added: adds.length + actionAdds.length, edited: marks.filter(x => x.kind === 'edit').length };
  const names = [...data.leaders.filter(l => l.active !== false && (m === 'B' ? l.bishopric : l.council)).map(l => l.last), 'All'];

  const addForm = (onSave, placeholder, withWho) => (
    <div className="addform">
      <input type="text" autoFocus placeholder={placeholder} value={ui.text} onChange={e => setUi({ ...ui, text: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter' && ui.text.trim()) onSave(); }} />
      {withWho && <div className="chips"><span className="lbl">Assigned to</span>
        {names.map(n => <button key={n} className="chip" type="button" aria-pressed={ui.who === n} onClick={() => setUi({ ...ui, who: ui.who === n ? '' : n })}>{n}</button>)}</div>}
      <div className="btns">
        <button className="btn ghost" type="button" onClick={() => setUi({ editing: null, adding: null, text: '', who: '' })}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !ui.text.trim()} onClick={onSave}>Add</button>
      </div>
    </div>
  );

  return (
    <>
      {header}
      <div className="card doc">
        {title && <div className="doctitle">{title}</div>}
        {rows.map(r => {
          if (r.type === 'meta') return <div className="docmeta" key={r.key}>{r.text}</div>;
          if (r.type === 'heading') return <h2 key={r.key}>{r.text}</h2>;
          if (r.type === 'para') return <div className="fixed" key={r.key}><Linked text={r.text} links={r.links} /></div>;
          if (r.type === 'next') return <div className="nextbox" key={r.key}><div className="ttl">{r.text}</div><div className="sub">Set in the Agenda Builder. It becomes next week's Thought/Training.</div></div>;
          if (r.type === 'table') return <div className="fixed" key={r.key}>{r.rows.map((c, i) => <div key={i}>{c.join(' · ')}</div>)}</div>;
          if (r.type === 'actions') return (
            <ul className="kids flat" key={r.key}>
              {r.rows.slice(1).filter(c => c[0] && c[0].trim()).map((c, i) => {
                const done = findMark('done', c[0]);
                return (
                  <li className={'item' + (done ? ' done' : '')} key={i}>
                    <button className="check" type="button" aria-label="Done" disabled={busy} onClick={() => toggleDone(c[0])}>✓</button>
                    <div className="ibody"><div className="text">{c[0]}</div>
                      <div className="det">{c[1] && <span>{c[1]}</span>}{c[2] && <span>{c[2]}</span>}{c[3] && <span>Created {c[3]}</span>}
                        {done && <span className="pill ok">Won't carry over</span>}</div></div>
                  </li>
                );
              })}
              {actionAdds.map(a => (
                <li className="item isnew" key={a.id}>
                  <button className="check" type="button" aria-label="Remove" disabled={busy} onClick={() => mark({ deleteId: a.id })}>✕</button>
                  <div className="ibody"><div className="text">{a.text}</div><div className="det">{a.who && <span>{a.who}</span>}<span className="pill new">Added for next week</span></div></div>
                </li>
              ))}
              <li>{ui.adding === '__action' ? addForm(() => mark({ kind: 'action', text: ui.text, who: ui.who }), 'What needs to happen?', true)
                : <button className="addbtn" type="button" onClick={() => setUi({ editing: null, adding: '__action', text: '', who: '' })}>+ Add action item</button>}</li>
            </ul>
          );
          if (r.type === 'after') {
            const mine = adds.filter(a => norm(a.anchor) === norm(r.anchor));
            return (
              <div key={r.key} style={{ paddingLeft: indent(r.level) }}>
                {mine.map(a => (
                  <div className="item isnew" key={a.id}>
                    <button className="check" type="button" aria-label="Remove" disabled={busy} onClick={() => mark({ deleteId: a.id })}>✕</button>
                    <div className="ibody"><div className="text">{a.text}</div><div className="det"><span className="pill new">Added for next week</span></div></div>
                  </div>
                ))}
                {ui.adding === r.anchor ? addForm(() => mark({ kind: 'add', anchor: r.anchor, text: ui.text }), 'New item for next week')
                  : <button className="addbtn" type="button" onClick={() => setUi({ editing: null, adding: r.anchor, text: '', who: '' })}>+ Add</button>}
              </div>
            );
          }
          // list item
          const done = findMark('done', r.text) || r.parentDone;
          const edit = findMark('edit', r.text);
          const editing = ui.editing === r.idx;
          return (
            <div key={r.idx} className={'item' + (done ? ' done' : '') + (r.locked ? ' lockeditem' : '')} style={{ paddingLeft: indent(r.level) }}>
              {r.locked || r.parentDone
                ? <span className="num">{r.num ? `${r.num}.` : '•'}</span>
                : <button className="check" type="button" aria-label="Done" disabled={busy} onClick={() => toggleDone(r.text)}>✓</button>}
              <div className="ibody">
                {editing ? (
                  <>
                    <input type="text" autoFocus value={ui.text} onChange={e => setUi({ ...ui, text: e.target.value })} />
                    <div className="btns">
                      <button className="btn ghost" type="button" onClick={() => setUi({ editing: null, adding: null, text: '', who: '' })}>Cancel</button>
                      <button className="btn primary" type="button" disabled={busy || !ui.text.trim()} onClick={() => mark({ kind: 'edit', text: r.text, newText: ui.text })}>Save for next week</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text">{r.num && !r.locked ? <span className="sub">{r.num}. </span> : null}<Linked text={edit ? edit.newText : r.text} links={edit ? [] : r.links} /></div>
                    {(done || edit) && <div className="det">
                      {done && <span className="pill ok">Won't carry over</span>}
                      {edit && !done && <><span className="pill">Reworded for next week</span><button className="link" type="button" onClick={() => mark({ deleteId: edit.id })}>Undo</button></>}
                    </div>}
                  </>
                )}
              </div>
              {!r.locked && !editing && !done && <button className="edit" type="button" onClick={() => setUi({ editing: r.idx, adding: null, text: edit ? edit.newText : r.text, who: '' })}>Edit</button>}
            </div>
          );
        })}
      </div>

      <div className="card savebar">
        <div className="sub">For next week's agenda: <b>{stats.done} removed · {stats.added} added · {stats.edited} reworded</b><br />
          Saved as you go. Applied when you create next week's agenda.</div>
      </div>
      <p className="foot">Tap a circle when something is finished. Edit and + Add change next week's agenda, not this one. <a href={res.docUrl} target="_blank" rel="noopener">Open the Doc</a></p>
    </>
  );
}

const indent = level => `${Math.max(0, level) * 18}px`;

function Linked({ text, links }) {
  if (!links || !links.length) return <>{text}</>;
  const out = [];
  let at = 0;
  links.forEach((l, i) => {
    if (l.start > at) out.push(<span key={`t${i}`}>{text.slice(at, l.start)}</span>);
    out.push(<a key={`l${i}`} href={l.url} target="_blank" rel="noopener">{text.slice(l.start, l.end + 1)}</a>);
    at = l.end + 1;
  });
  if (at < text.length) out.push(<span key="end">{text.slice(at)}</span>);
  return <>{out}</>;
}
