import React, { useEffect, useState } from 'react';
import { Header } from '../components/Shell';
import { Banner } from '../components/ui';
import { post, messageFor } from '../lib/api';
import { navigate } from '../lib/router';
import { useSession, ROLE_LABEL, type Role } from '../lib/session';

export function Login() {
  const { setStaff } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const after = (role: Role) => {
    navigate(role === 'kitchen' ? '/kitchen' : role === 'floor' ? '/floor' : '/manage');
  };

  const demo = async (role: Role) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ staff: { name: string; role: Role } }>('/api/staff/demo', { role });
      setStaff(r.staff);
      after(role);
    } catch (e) {
      setErr(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === 'kitchen' || q === 'floor' || q === 'manager') void demo(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ staff: { name: string; role: Role } }>('/api/staff/login', { email, password });
      setStaff(r.staff);
      after(r.staff.role);
    } catch (e2) {
      setErr(messageFor(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header />
      <main className="page narrow">
        <h1>Staff sign-in</h1>
        <p className="lede-small">Kitchen, floor and manager screens. Guests do not sign in; they scan the table code.</p>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Work email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} />
          </label>
          {err ? <Banner kind="error">{err}</Banner> : null}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <section className="demo-box" aria-labelledby="demo-h">
          <h2 id="demo-h">Demo sign-in (DEMO data)</h2>
          <p>One tap opens the demo account for each screen. Nothing typed here is stored.</p>
          <div className="cta-row">
            {(['kitchen', 'floor', 'manager'] as Role[]).map((r) => (
              <button key={r} className="btn btn-ghost" onClick={() => demo(r)} disabled={busy}>
                {ROLE_LABEL[r]} demo
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
