'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!passcode.trim()) return setError('Enter your passcode.');
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not sign in.');
      window.location.replace('/');
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card loginCard" onSubmit={submit}>
        <div className="app">Cienega Ward · Exec Secretary</div>
        <h1>Sign in</h1>
        <label className="f" htmlFor="passcode">Passcode
          <input id="passcode" type="password" autoComplete="current-password" value={passcode} onChange={e => setPasscode(e.target.value)} autoFocus />
        </label>
        {error && <div className="err">{error}</div>}
        <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="sub">You'll stay signed in on this device for 6 months.</p>
      </form>
    </main>
  );
}
