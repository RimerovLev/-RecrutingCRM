import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';

export default function AuthPage() {
  const [tab, setTab]         = useState('login');
  const [loading, setLoading] = useState(false);
  const addToast              = useStore(s => s.addToast);
  const { t }                 = useI18n();

  // Login form
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [regName, setRegName]         = useState('');
  const [regEmail, setRegEmail]       = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAdminCode, setRegAdminCode] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setLoading(false);
    if (error) addToast(t('auth.toastError') + ': ' + error.message, 'err');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await sb.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: { data: { full_name: regName, admin_code: regAdminCode.trim() } },
    });
    setLoading(false);
    if (error) {
      addToast(t('common.error') + ': ' + error.message, 'err');
    } else {
      addToast(t('auth.toastSuccess'), 'info');
      setTab('login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 900, color: 'var(--ink)' }}>Recruit CRM</h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{t('onboarding.subtitle')}</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
            {['login', 'register'].map(tabKey => (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                style={{
                  paddingBottom: 10, marginBottom: -1,
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === tabKey ? 'var(--accent)' : 'transparent'}`,
                  color: tab === tabKey ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {tabKey === 'login' ? t('auth.signIn') : t('auth.signUp')}
              </button>
            ))}
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="form-label">{t('auth.email')}</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="form-label">{t('auth.password')}</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? t('common.loading') : t('auth.signInBtn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="form-label">{t('common.name')}</label>
                <input
                  type="text"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="form-label">{t('auth.email')}</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="form-label">{t('auth.password')}</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="form-label">Admin code <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="password"
                  value={regAdminCode}
                  onChange={e => setRegAdminCode(e.target.value)}
                  className="input-field"
                  autoComplete="off"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? t('common.loading') : t('auth.signUpBtn')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
