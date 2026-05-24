import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';

export default function OnboardingPage() {
  const currentUserId    = useStore(s => s.currentUserId);
  const setCurrentProfile = useStore(s => s.setCurrentProfile);
  const setCurrentOrgName = useStore(s => s.setCurrentOrgName);
  const addToast         = useStore(s => s.addToast);

  const [tab,       setTab]       = useState('create'); // 'create' | 'join'
  const [orgName,   setOrgName]   = useState('');
  const [token,     setToken]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [migrating, setMigrating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) { addToast('Введи название компании', 'err'); return; }
    setLoading(true);

    const { data, error } = await sb.rpc('create_org_and_join', { p_name: orgName.trim() });

    if (error || data?.error) {
      addToast(data?.error || error.message, 'err');
      setLoading(false);
      return;
    }

    // Reload profile to get org_id
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUserId).single();
    setCurrentProfile(profile);
    setCurrentOrgName(data.org_name);
    addToast(`Организация «${data.org_name}» создана ✓`);
    setLoading(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!token.trim()) { addToast('Введи код приглашения', 'err'); return; }
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
    addToast(`Вы вступили в «${data.org_name}» ✓`);
    setLoading(false);
  };

  // Backfill existing data rows with org_id after creating org
  const handleMigrate = async () => {
    setMigrating(true);
    const { data: prof } = await sb.from('profiles').select('org_id').eq('id', currentUserId).single();
    const orgId = prof?.org_id;
    if (!orgId) { addToast('Сначала создай или вступи в организацию', 'err'); setMigrating(false); return; }

    const tables = ['candidates', 'vacancies', 'interviews', 'reminders', 'email_templates'];
    let total = 0;
    for (const t of tables) {
      const { count } = await sb.from(t).update({ org_id: orgId }).is('org_id', null).select('id', { count: 'exact', head: true });
      total += count || 0;
    }
    addToast(`Перенесено записей: ${total} ✓`);
    setMigrating(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 900, color: 'var(--ink)' }}>
            Recruit CRM
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            Последний шаг — настройка организации
          </p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'create', label: 'Создать компанию' },
              { id: 'join',   label: 'Вступить по приглашению' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  paddingBottom: 10, marginBottom: -1,
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                  color: tab === t.id ? 'var(--ink)' : 'var(--muted)',
                }}
              >{t.label}</button>
            ))}
          </div>

          {tab === 'create' ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border)', marginBottom: 4,
              }}>
                <p style={{ fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
                  Ты станешь <strong>администратором</strong> — сможешь приглашать коллег и управлять доступом.
                  Все данные будут изолированы внутри вашей организации.
                </p>
              </div>
              <div>
                <label className="form-label">Название компании *</label>
                <input
                  className="input-field"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Например: HR Agency Pro"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ justifyContent: 'center', padding: '11px 0' }}
              >
                {loading ? 'Создаём…' : '🏢 Создать организацию'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border)', marginBottom: 4,
              }}>
                <p style={{ fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
                  Попроси администратора отправить тебе код приглашения из раздела
                  <strong> Администрирование → Команда</strong>.
                </p>
              </div>
              <div>
                <label className="form-label">Код приглашения *</label>
                <input
                  className="input-field"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Вставь код (32 символа)"
                  required
                  autoFocus
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ justifyContent: 'center', padding: '11px 0' }}
              >
                {loading ? 'Проверяем…' : '🔗 Вступить в организацию'}
              </button>
            </form>
          )}
        </div>

        {/* Migrate existing data (for existing users) */}
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            Уже есть данные в CRM?
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 12, lineHeight: 1.5 }}>
            После создания организации нажми кнопку, чтобы перенести все существующие кандидаты,
            вакансии, интервью и шаблоны в новую организацию.
          </p>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '8px 16px' }}
          >
            {migrating ? 'Переносим…' : '📦 Перенести существующие данные'}
          </button>
        </div>

      </div>
    </div>
  );
}
