'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { makeHelpers } from '@/lib/youth';
import { Icon } from './bits';
import Home from './Home';
import Members from './Members';
import Settings from './Settings';
import FamilyEditor from './FamilyEditor';

const VIEWS = [
  { key: 'home', label: 'Home', title: 'This week' },
  { key: 'people', label: 'Members', title: 'Members' },
  { key: 'setup', label: 'Settings', title: 'Settings' }
];

export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('home');
  const [setOpen, setSetOpen] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // household id, '' for new, or null
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef();

  const load = useCallback(() => {
    setLoadError('');
    api('/api/data').then(setData).catch(e => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  // Refresh when you come back to the app after it's been in the background.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible' && editing === null) api('/api/data').then(setData).catch(() => {}); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [editing]);

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

  const ctx = { data, setData, H, toast, go, openFamily: id => setEditing(id), setOpen, setSetOpen };
  const setupLeft = (data.settings.splitConfirmed === 'TRUE' ? 0 : 1) + (data.settings.hoursConfirmed === 'TRUE' ? 0 : 1);

  return (
    <>
      <Header title={current.title} date={H.today} />
      <main><div className="wrap">
        {view === 'home' && <Home ctx={ctx} />}
        {view === 'people' && <Members ctx={ctx} />}
        {view === 'setup' && <Settings ctx={ctx} />}
      </div></main>

      <nav className="tabbar" aria-label="Screens"><div className="wrap">
        {VIEWS.map(v => (
          <button key={v.key} type="button" aria-current={view === v.key ? 'page' : undefined} onClick={() => go(v.key)}>
            <Icon name={v.key} />{v.label}
            {v.key === 'setup' && setupLeft > 0 && <span className="dot">{setupLeft}</span>}
          </button>
        ))}
      </div></nav>

      {editing !== null && <FamilyEditor ctx={ctx} householdId={editing} onClose={() => setEditing(null)} />}
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
