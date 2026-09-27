import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { apiError } from '../api/client';
import { Button, Card, Field, Input, Banner, Select } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@assetflow.demo', password: 'Admin@123' },
  { label: 'Asset Manager', email: 'manager@assetflow.demo', password: 'Manager@123' },
  { label: 'Department Head', email: 'depthead@assetflow.demo', password: 'DeptHead@123' },
  { label: 'Employee', email: 'employee@assetflow.demo', password: 'Employee@123' },
];

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // login | signup | forgot
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', department: '' });
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (mode !== 'login') {
      api.get('/departments').then((res) => setDepartments(res.data.data.items)).catch(() => {});
    }
  }, [mode]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        navigate('/');
      } else if (mode === 'signup') {
        if (form.password !== form.confirm) throw new Error('Passwords do not match');
        await signup({
          name: form.name,
          email: form.email,
          password: form.password,
          department: form.department || null,
        });
        navigate('/');
      } else {
        const res = await api.post('/auth/forgot-password', { email: form.email });
        const link = res.data.data?.resetLink;
        setInfo(
          link
            ? `Reset link generated (demo mode — normally emailed): ${link}`
            : 'If that email exists, a reset link has been generated (demo mode — check server console).'
        );
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-canvas">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span className="h-3 w-3 rounded-full bg-ink" />
            <span className="font-semibold text-[24px] tracking-[-0.025em]">AssetFlow</span>
          </div>
          <p className="text-[14px] text-mid-gray">Enterprise Asset & Resource Management</p>
        </div>

        <Card>
          {mode === 'login' && (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-[18px] font-semibold">Log in</h2>
              {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
              {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}
              <Field label="Email">
                <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
              </Field>
              <Field label="Password">
                <Input type="password" required value={form.password} onChange={set('password')} placeholder="••••••••" />
              </Field>
              <div className="flex items-center justify-between text-[13px]">
                <button type="button" className="text-mid-gray hover:text-ink" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>
                  Forgot password?
                </button>
                <button type="button" className="text-ink font-medium hover:underline" onClick={() => setMode('signup')}>
                  Sign up
                </button>
              </div>
              <Button type="submit" disabled={busy} className="w-full h-10">{busy ? 'Logging in…' : 'Log in'}</Button>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-[18px] font-semibold">Create account</h2>
              {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
              <Field label="Full name">
                <Input required value={form.name} onChange={set('name')} placeholder="Jane Doe" />
              </Field>
              <Field label="Email">
                <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
              </Field>
              <Field label="Department">
                <Select value={form.department} onChange={set('department')}>
                  <option value="">Select department…</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Password">
                  <Input type="password" required minLength={6} value={form.password} onChange={set('password')} />
                </Field>
                <Field label="Confirm">
                  <Input type="password" required minLength={6} value={form.confirm} onChange={set('confirm')} />
                </Field>
              </div>
              <p className="text-[12px] text-mid-gray">
                New accounts start as Employee. Ask an admin to grant additional access.
              </p>
              <div className="flex justify-between items-center">
                <button type="button" className="text-[13px] text-mid-gray hover:text-ink" onClick={() => setMode('login')}>
                  ← Back to login
                </button>
                <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</Button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-[18px] font-semibold">Reset password</h2>
              {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
              {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}
              <Field label="Email">
                <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
              </Field>
              <p className="text-[12px] text-mid-gray">
                Demo mode: the reset link is printed in the API server console and shown here instead of emailed.
              </p>
              <div className="flex justify-between items-center">
                <button type="button" className="text-[13px] text-mid-gray hover:text-ink" onClick={() => setMode('login')}>
                  ← Back to login
                </button>
                <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Generate reset link'}</Button>
              </div>
            </form>
          )}
        </Card>

        {/* Demo credential quick-fill */}
        <Card className="mt-4">
          <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray mb-2">Demo accounts (seeded)</div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => { setMode('login'); setForm((f) => ({ ...f, email: d.email, password: d.password })); }}
                className="text-left rounded-xl border border-hairline px-3 py-2 hover:bg-surface-alt transition-colors"
              >
                <div className="text-[13px] font-medium">{d.label}</div>
                <div className="text-[11px] text-mid-gray">{d.email}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-mid-gray mt-2">Click to fill — then press “Log in”.</p>
        </Card>
      </div>
    </div>
  );
}
