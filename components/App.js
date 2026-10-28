'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { makeHelpers } from '@/lib/youth';
import { Icon } from './bits';
import Home from './Home';
import Members from './Members';
import Settings from './Settings';
import FamilyEditor from './FamilyEditor';
import Agendas from './Agendas';
import Meeting from './Meeting';
import { defaultSunday } from '@/lib/suggest';
import Interviews, { todoCounts } from './Interviews';
import { BookSheet, TextSheet, ApptSheet, LinkSheet, TrackSheet } from './IvSheets';
import ImportSheet from './ImportSheet';

const VIEWS = [
  { key: 'home', label: 'Home', title: 'This week' },
  { key: 'agendas', label: 'Agendas', title: 'Agenda Builder' },
  { key: 'meeting', label: 'Meeting', title: 'Meeting Mode' },
  { key: 'interviews', label: 'Interviews', title: 'Interviews' },
  { key: 'people', label: 'Members', title: 'Members' },
  { key: 'setup', label: 'Settings', title: 'Settings' }
];

export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('home');
  const [setOpen, setSetOpen] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // household id, '' for new, or null
  const [agendaDate, setAgendaDate] = useState(() => defaultSunday());
  const [toastMsg, setToastMsg] = useState(null);
  const [sheet, setSheet] = useState(null); // interview pop-ups
  const timer = useRef();

  const load = useCallback(() => {
    setLoadError('');
    api('/api/data').then(setData).catch(e => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  // Refresh when you come back to the app after it's been in the background.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible' && editing === null && !sheet) api('/api/data').then(setData).catch(() => {}); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [editing, sheet]);

  const toast = useCallback((text, bad) => {
    clearTimeout(timer.current);
    setToastMsg({ text, bad });
    timer.current = setTimeout(() => setToastMsg(null), bad ? 6000 : 3000);
  }, []);

  const H = useMemo(() => (data ? makeHelpers(data) : null), [data]);

  const go = useCallback((v, section) => {
    setView(v);
    if (section) setSetOpen(prev => new Set(prev).add(section));
    window.scrollTo(0, 0);
    if (section) setTimeout(() => document.querySelector(`[data-set="${section}"]`)?.scrollIntoView({ block: 'start' }), 50);
  }, []);

  const current = VIEWS.find(v => v.key === view);

  if (!data) {
    return (
      <>
        <Header title={loadError ? 'Not ready yet' : 'Loading'} />
        <main><div className="wrap">
          {loadError ? (
            <div className="card pad">
              <div className="ttl">The app couldn't load its data</div>
              <div className="sub" style={{ marginTop: 6 }}>{loadError}</div>
              <div className="btns" style={{ marginTop: 10 }}><button className="btn primary" type="button" onClick={load}>Try again</button></div>
            </div>
          ) : <div className="loading">Loading your data…</div>}
        </div></main>
      </>
    );
  }

  const personName = a => {
    if (a.childId) {
      const c = data.children.find(x => x.id === a.childId);
      const h = c && data.households.find(x => x.id === c.householdId);
      return c ? `${c.first} ${h ? h.family : ''}`.trim() : '';
    }
    if (a.trackId) return (data.tracks.find(t => t.id === a.trackId) || {}).name || '';
    return a.eventTitle || '';
  };
  const ctx = { data, setData, H, toast, go, openFamily: id => setEditing(id), setOpen, setSetOpen, agendaDate, openSheet: setSheet, personName };
  const setupLeft = (data.settings.splitConfirmed === 'TRUE' ? 0 : 1) + (data.settings.hoursConfirmed === 'TRUE' ? 0 : 1);
  const t = todoCounts(data);
  const ivBadge = t.remind.length + t.confirm.length + t.follow.length + t.came.length;
  const closeSheet = () => setSheet(null);

  return (
    <>
      <Header title={current.title} date={H.today} />
      <main><div className="wrap">
        {view === 'home' && <Home ctx={ctx} />}
        {view === 'agendas' && <Agendas ctx={ctx} date={agendaDate} setDate={setAgendaDate} />}
        {view === 'meeting' && <Meeting ctx={ctx} />}
        {view === 'interviews' && <Interviews ctx={ctx} />}
        {view === 'people' && <Members ctx={ctx} />}
        {view === 'setup' && <Settings ctx={ctx} />}
      </div></main>

      <nav className="tabbar" aria-label="Screens"><div className="wrap">
        {VIEWS.map(v => (
          <button key={v.key} type="button" aria-current={view === v.key ? 'page' : undefined} onClick={() => go(v.key)}>
            <Icon name={v.key} />{v.label}
            {v.key === 'setup' && setupLeft > 0 && <span className="dot">{setupLeft}</span>}
            {v.key === 'interviews' && ivBadge > 0 && <span className="dot">{ivBadge}</span>}
          </button>
        ))}
      </div></nav>

      {editing !== null && <FamilyEditor ctx={ctx} householdId={editing} onClose={() => setEditing(null)} />}
      {sheet?.type === 'book' && <BookSheet key={sheet.appt?.id || sheet.person?.key} ctx={ctx} person={sheet.person} appt={sheet.appt} onClose={closeSheet} />}
      {sheet?.type === 'text' && <TextSheet key={`${sheet.appt.id}-${sheet.kind}`} ctx={ctx} appt={sheet.appt} kind={sheet.kind} onClose={closeSheet} />}
      {sheet?.type === 'appt' && <ApptSheet key={sheet.appt.id} ctx={ctx} appt={sheet.appt} onClose={closeSheet} />}
      {sheet?.type === 'link' && <LinkSheet ctx={ctx} event={sheet.event} onClose={closeSheet} />}
      {sheet?.type === 'import' && <ImportSheet ctx={ctx} onClose={closeSheet} />}
      {sheet?.type === 'track' && <TrackSheet ctx={ctx} household={sheet.household} track={sheet.track} onClose={closeSheet} />}
      {toastMsg && <div className={'toast' + (toastMsg.bad ? ' bad' : '')} role="status">{toastMsg.text}</div>}
    </>
  );
}

function Header({ title, date }) {
  return (
    <header><div className="wrap">
      <div><div className="app">Cienega Ward · Exec Secretary</div><h1>{title}</h1></div>
      <div className="date">{date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div>
    </div></header>
  );
}
