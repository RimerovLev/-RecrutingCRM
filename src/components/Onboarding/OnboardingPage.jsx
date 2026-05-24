import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';

export default function OnboardingPage() {
  const currentUserId    = useStore(s => s.currentUserId);
  const setCurrentProfile = useStore(s => s.setCurrentProfile);
  const setCurrentOrgName = useStore(s => s.setCurrentOrgName);
  const addToast         = useStore(s => s.addToast);
  const { t }            = useI18n();

  const [tab,       setTab]       = useState('create');
  const [orgName,   setOrgName]   = useState('');
  const [token,     setToken]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [migrating, setMigrating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) { addToast(t('common.error'), 'err'); return; }
    setLoading(true);
    const { data, error } = await sb.rpc('create_org_and_join', { p_name: orgName.trim() });
    if (error || data?.error) {
      addToast(data?.error || error.message, 'err');
      setLoading(false);
      return;
    }
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUserId).single();
    setCurrentProfile(profile);
    setCurrentOrgName(data.org_name);
    addToast(`«${data.org_name}» — ${t('onboarding.toastCreated')}`);
    setLoading(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!token.trim()) { addToast(t('common.error'), 'err'); return; }
    setLoading(true);
    const { data, error } = await sb.rpc('accept_invite', { p_token: token.trim() });
    if (error || data?.error) {
      addToast(data?.error || error.message, 'err');
      setLoading(false);
      return;
    }
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUserId).single();
    setCurrentProfile(profile);
    setCurrentOrgName(data.org_name);
    addToast(`«${data.org_name}» — ${t('onboarding.toastJoined')}`);
    setLoading(false);
  };

  const handleMigrate = async () => {
    setMigrating(true);
    const { data: prof } = await sb.from('profiles').select('org_id').eq('id', currentUserId).single();
    const orgId = prof?.org_id;
    if (!orgId) { addToast(t('common.error'), 'err'); setMigrating(false); return; }
    const tables = ['candidates', 'vacancies', 'interviews', 'reminders', 'email_templates'];
    let total = 0;
    for (const tbl of tables) {
      const { count } = await sb.from(tbl).update({ org_id: orgId }).is('org_id', null).select('id', { count: 'exact', head: true });
      total += count || 0;
    }
    addToast(`${t('onboarding.toastMigrated')}: ${total} ✓`);
    setMigrating(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 900, color: 'var(--ink)' }}>Recruit CRM</h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{t('onboarding.subtitle')}</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <div style={{ display: 'flex', gap: 24, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'create', label: t('onboarding.tabCreate') },
              { id: 'join',   label: t('onboarding.tabJoin') },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  paddingBottom: 10, marginBottom: -1,
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === item.id ? 'var(--accent)' : 'transparent'}`,
                  color: tab === item.id ? 'var(--ink)' : 'var(--muted)',
                }}
              >{item.label}</button>
            ))}
          </div>

          {tab === 'create' ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">{t('onboarding.orgNameLabel')}</label>
                <input
                  className="input-field"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: '11px 0' }}>
                {loading ? t('common.loading') : '🏢 ' + t('onboarding.createBtn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">{t('onboarding.tokenLabel')}</label>
                <input
                  className="input-field"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  required
                  autoFocus
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: '11px 0' }}>
                {loading ? t('common.loading') : '🔗 ' + t('onboarding.joinBtn')}
              </button>
            </form>
          )}
        </div>

        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '8px 16px' }}
          >
            {migrating ? t('common.loading') : '📦 ' + t('onboarding.migrateBtn')}
          </button>
        </div>

      </div>
    </div>
  );
}
