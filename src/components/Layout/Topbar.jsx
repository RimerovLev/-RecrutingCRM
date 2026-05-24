import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';

export default function Topbar() {
  const currentOrgName = useStore(s => s.currentOrgName);
  const navigate       = useNavigate();
  const location       = useLocation();
  const activeView     = location.pathname.replace('/', '') || 'dashboard';
  const { t, isRTL }  = useI18n();

  const PAGE_TITLE_KEY = {
    dashboard:  'nav.dashboard',
    candidates: 'nav.candidates',
    vacancies:  'nav.vacancies',
    kanban:     'nav.kanban',
    reminders:  'nav.reminders',
    interviews: 'nav.interviews',
    templates:  'nav.templates',
    admin:      'nav.admin',
  };

  const title = t(PAGE_TITLE_KEY[activeView] || 'nav.dashboard');
  const today = new Date().toLocaleDateString(isRTL ? 'he-IL' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      height: 56, background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
    }}>
      {/* Left (or right in RTL): title + date + org */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700,
          color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap',
        }}>{title}</h2>
        <span className="hidden md:inline" style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
          {today}
        </span>
        {currentOrgName && (
          <span className="hidden md:inline" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--accent2)', fontFamily: 'var(--font-sans)',
            background: 'rgba(26,92,232,0.08)', padding: '2px 8px', borderRadius: 999,
            whiteSpace: 'nowrap',
          }}>
            {currentOrgName}
          </span>
        )}
      </div>

      {/* Right (or left in RTL): search + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        {/* Search — desktop only */}
        <div className="hidden md:block" style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: isRTL ? 'auto' : 10,
            right: isRTL ? 10 : 'auto',
            top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, color: 'var(--muted)',
          }}>🔍</span>
          <input
            type="text"
            placeholder={t('topbar.search')}
            style={{
              width: 200,
              padding: isRTL ? '7px 30px 7px 14px' : '7px 14px 7px 30px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-sans)',
              color: 'var(--ink)', outline: 'none',
              textAlign: isRTL ? 'right' : 'left',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent2)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Notification bell — desktop only */}
        <button className="hidden md:flex" style={{
          position: 'relative', width: 36, height: 36,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', fontSize: 15,
          alignItems: 'center', justifyContent: 'center',
        }}>
          🔔
          <span style={{
            position: 'absolute', top: 6, right: 6,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)', border: '1.5px solid #fff',
          }} />
        </button>

        {/* CTA: Add Candidate */}
        <button
          onClick={() => navigate('/candidates')}
          className="btn-primary"
          style={{ fontSize: 12, padding: '7px 12px' }}
        >
          {t('topbar.addCandidate')}
        </button>
      </div>
    </header>
  );
}
