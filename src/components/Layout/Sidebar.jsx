import { useState } from 'react';
import { useStore } from '@/store';
import ChangePasswordModal from '@/components/Auth/ChangePasswordModal';

const NAV_MAIN = [
  { view: 'dashboard',  icon: '▪', label: 'Дашборд' },
  { view: 'candidates', icon: '▪', label: 'Кандидаты' },
  { view: 'vacancies',  icon: '▪', label: 'Вакансии' },
  { view: 'kanban',     icon: '▪', label: 'Пайплайн' },
];
const NAV_ACTIVITY = [
  { view: 'interviews', icon: '▪', label: 'Интервью' },
  { view: 'reminders',  icon: '▪', label: 'Напоминания' },
  { view: 'templates',  icon: '▪', label: 'Шаблоны писем' },
];
const NAV_ADMIN = [
  { view: 'admin', icon: '▪', label: 'Администрирование' },
];

const ROLE_BADGE = { recruiter: null, viewer: 'viewer', admin: 'admin' };

export default function Sidebar() {
  const activeView         = useStore(s => s.activeView);
  const setActiveView      = useStore(s => s.setActiveView);
  const currentProfileName = useStore(s => s.currentProfileName);
  const currentUserEmail   = useStore(s => s.currentUserEmail);
  const currentProfileRole = useStore(s => s.currentProfileRole);
  const clearAuth          = useStore(s => s.clearAuth);
  const addToast           = useStore(s => s.addToast);

  const [pwOpen, setPwOpen] = useState(false);

  const handleLogout = async () => {
    const { sb } = await import('@/lib/supabase');
    await sb.auth.signOut();
    clearAuth();
    addToast('Выход выполнен');
  };

  const displayName = currentProfileName || currentUserEmail || '';
  const initials    = displayName.slice(0, 2).toUpperCase();
  const isAdmin     = currentProfileRole === 'admin';

  const NavItem = ({ view, label, badge }) => {
    const active = activeView === view;
    return (
      <button
        onClick={() => setActiveView(view)}
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
          textAlign: 'left',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent'; }}}
      >
        {/* Active left border */}
        {active && (
          <span style={{
            position: 'absolute', left: 0, top: 4, bottom: 4,
            width: 2, background: 'var(--accent)', borderRadius: '0 2px 2px 0',
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
    }}>{children}</p>
  );

  return (
    <aside
      className="hidden md:flex flex-col"
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 220, background: 'var(--ink)',
        zIndex: 40, borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 900,
          color: '#fff', lineHeight: 1,
        }}>Recruit CRM</h1>
        <p style={{
          fontSize: 10, letterSpacing: 3, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)', marginTop: 4,
        }}>CRM Platform</p>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <SectionLabel>Основное</SectionLabel>
        {NAV_MAIN.map(({ view, label }) => (
          <NavItem key={view} view={view} label={label} />
        ))}

        <SectionLabel>Активность</SectionLabel>
        {NAV_ACTIVITY.map(({ view, label }) => (
          <NavItem key={view} view={view} label={label} />
        ))}

        {isAdmin && (
          <>
            <SectionLabel>Управление</SectionLabel>
            {NAV_ADMIN.map(({ view, label }) => (
              <NavItem key={view} view={view} label={label} />
            ))}
          </>
        )}
      </nav>

      {/* User block */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), #b83410)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: '#fff',
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, truncate: true, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              {currentProfileRole}
            </p>
          </div>
        </div>

        {/* Realtime + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span id="realtime-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
            <span id="realtime-label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Connecting…</span>
          </div>
          <button
            onClick={() => window.__openTelegramLink?.()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >Привязать Telegram</button>
          <button
            onClick={() => setPwOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >Сменить пароль</button>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'left', padding: 0, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >Выйти →</button>
        </div>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </aside>
  );
}
