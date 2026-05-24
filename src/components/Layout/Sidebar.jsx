import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';
import { LANG_FLAGS } from '@/lib/i18n';
import ChangePasswordModal from '@/components/Auth/ChangePasswordModal';

export default function Sidebar() {
  const currentProfileName = useStore(s => s.currentProfileName);
  const currentUserEmail   = useStore(s => s.currentUserEmail);
  const currentProfileRole = useStore(s => s.currentProfileRole);
  const clearAuth          = useStore(s => s.clearAuth);
  const addToast           = useStore(s => s.addToast);
  const setLanguage        = useStore(s => s.setLanguage);

  const navigate   = useNavigate();
  const location   = useLocation();
  const activePath = location.pathname.replace('/', '') || 'dashboard';

  const { t, lang, isRTL } = useI18n();

  const [pwOpen, setPwOpen] = useState(false);

  const handleLogout = async () => {
    const { sb } = await import('@/lib/supabase');
    await sb.auth.signOut();
    clearAuth();
    addToast(isRTL ? 'יצאת בהצלחה' : 'Выход выполнен');
  };

  const toggleLang = () => setLanguage(lang === 'ru' ? 'he' : 'ru');

  const displayName = currentProfileName || currentUserEmail || '';
  const initials    = displayName.slice(0, 2).toUpperCase();
  const isAdmin     = currentProfileRole === 'admin';

  const NAV_MAIN = [
    { view: 'dashboard',  label: t('nav.dashboard') },
    { view: 'candidates', label: t('nav.candidates') },
    { view: 'vacancies',  label: t('nav.vacancies') },
    { view: 'kanban',     label: t('nav.kanban') },
  ];
  const NAV_ACTIVITY = [
    { view: 'interviews', label: t('nav.interviews') },
    { view: 'reminders',  label: t('nav.reminders') },
    { view: 'templates',  label: t('nav.templates') },
  ];

  const NavItem = ({ view, label, badge }) => {
    const active = activePath === view || (view === 'dashboard' && location.pathname === '/');
    return (
      <button
        onClick={() => navigate('/' + view)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '9px 24px',
          background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 400,
          color: active ? '#fff' : 'rgba(255,255,255,0.5)',
          textAlign: isRTL ? 'right' : 'left',
          direction: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent'; }}}
      >
        {/* Active border indicator — flipped via CSS class nav-active-bar */}
        {active && (
          <span className="nav-active-bar" style={{
            position: 'absolute',
            left: isRTL ? 'auto' : 0,
            right: isRTL ? 0 : 'auto',
            top: 4, bottom: 4,
            width: 2, background: 'var(--accent)',
            borderRadius: isRTL ? '2px 0 0 2px' : '0 2px 2px 0',
          }} />
        )}
        <span>{label}</span>
        {badge != null && (
          <span style={{
            background: 'var(--accent)', color: '#fff',
            fontSize: 9, fontWeight: 600, padding: '2px 6px',
            borderRadius: 999, lineHeight: 1.4,
          }}>{badge}</span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ children }) => (
    <p style={{
      padding: '12px 24px 6px',
      fontSize: 9, letterSpacing: 3, textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.25)',
      fontFamily: 'var(--font-sans)',
      textAlign: isRTL ? 'right' : 'left',
    }}>{children}</p>
  );

  return (
    <aside
      className="sidebar-panel hidden md:flex flex-col"
      style={{
        position: 'fixed',
        top: 0,
        left: isRTL ? 'auto' : 0,
        right: isRTL ? 0 : 'auto',
        bottom: 0,
        width: 220,
        background: 'var(--ink)',
        zIndex: 40,
        borderRight: isRTL ? 'none' : '1px solid rgba(255,255,255,0.06)',
        borderLeft:  isRTL ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '24px 24px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        textAlign: isRTL ? 'right' : 'left',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 900,
          color: '#fff', lineHeight: 1,
        }}>Recruit CRM</h1>
        <p style={{
          fontSize: 10, letterSpacing: isRTL ? 1 : 3, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)', marginTop: 4,
        }}>CRM Platform</p>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <SectionLabel>{t('nav.main')}</SectionLabel>
        {NAV_MAIN.map(({ view, label }) => (
          <NavItem key={view} view={view} label={label} />
        ))}

        <SectionLabel>{t('nav.activity')}</SectionLabel>
        {NAV_ACTIVITY.map(({ view, label }) => (
          <NavItem key={view} view={view} label={label} />
        ))}

        {isAdmin && (
          <>
            <SectionLabel>{t('nav.management')}</SectionLabel>
            <NavItem view="admin" label={t('nav.admin')} />
          </>
        )}
      </nav>

      {/* User block */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        }}>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), #b83410)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: '#fff',
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: isRTL ? 'right' : 'left' }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              {currentProfileRole}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span id="realtime-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
            <span id="realtime-label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{t('sidebar.connecting')}</span>
          </div>
          <button
            onClick={() => window.__openTelegramLink?.()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: isRTL ? 'right' : 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >{t('sidebar.linkTelegram')}</button>
          <button
            onClick={() => setPwOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: isRTL ? 'right' : 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >{t('sidebar.changePassword')}</button>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: isRTL ? 'right' : 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >{t('sidebar.logout')}</button>

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="lang-toggle"
            style={{ marginTop: 6 }}
          >
            {LANG_FLAGS[lang === 'ru' ? 'he' : 'ru']} {t('sidebar.languageSwitch')}
          </button>
        </div>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </aside>
  );
}
