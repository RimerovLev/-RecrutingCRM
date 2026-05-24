import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';

export default function MobileNav() {
  const currentProfileRole = useStore(s => s.currentProfileRole);
  const isAdmin            = currentProfileRole === 'admin';
  const navigate           = useNavigate();
  const location           = useLocation();
  const activePath         = location.pathname.replace('/', '') || 'dashboard';
  const { t }              = useI18n();

  const NAV = [
    { view: 'dashboard',  icon: '📊', labelKey: 'mobileNav.dashboard' },
    { view: 'candidates', icon: '👤', labelKey: 'mobileNav.candidates' },
    { view: 'interviews', icon: '🤝', labelKey: 'mobileNav.interviews' },
    { view: 'reminders',  icon: '🔔', labelKey: 'mobileNav.reminders' },
    { view: 'vacancies',  icon: '💼', labelKey: 'mobileNav.vacancies' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-slate-200 flex">
      {NAV.map(({ view, icon, labelKey }) => (
        <button
          key={view}
          onClick={() => navigate('/' + view)}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 transition-colors ${
            activePath === view
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span className="text-base">{icon}</span>
          <span>{t(labelKey)}</span>
        </button>
      ))}
      {isAdmin && (
        <button
          onClick={() => navigate('/admin')}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 transition-colors ${
            activePath === 'admin'
              ? 'text-purple-600 font-semibold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span className="text-base">⚡</span>
          <span>{t('mobileNav.admin')}</span>
        </button>
      )}
    </nav>
  );
}
