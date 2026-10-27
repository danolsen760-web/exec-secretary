'use client';
import { md } from '@/lib/youth';

export function IvTag({ id, H }) {
  return <span className="iv" style={{ '--c': H.ivColor(id) }}>{H.short(id)}</span>;
}

export function DuePill({ y }) {
  if (y.status === 'missing') return <span className="pill warn">Needs last interview date</span>;
  if (y.status === 'over') return <span className="pill bad">Overdue · {md(y.due)}</span>;
  if (y.status === 'soon') return <span className="pill warn">Due {md(y.due)}</span>;
  return <span className="pill plain">Due {md(y.due)}</span>;
}

export const Caret = () => <span className="caret" aria-hidden="true">›</span>;

const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  agendas: <><path d="M6 2.5h8.5L19 7v14.5H6z" /><path d="M14 2.5V7.5h5M9 12h7M9 16h7" /></>,
  meeting: <path d="M4 6.5l2 2 3.5-3.5M4 13.5l2 2 3.5-3.5M13 7h7M13 14h7M4 20h16" />,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20.5c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15c1.9.7 3.1 2.4 3.5 5.5" /></>,
  setup: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>
};

export function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// Runs an async save, showing "Saving…" on the button and a toast on error.
export function saver(ctx) {
  return async function run(setBusy, fn, okMessage) {
    setBusy(true);
    try {
      const data = await fn();
      ctx.setData(data);
      if (okMessage) ctx.toast(okMessage);
      return true;
    } catch (e) {
      ctx.toast(e.message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };
}
