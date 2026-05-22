import { useStore } from '@/store';

const NAV = [
  { view: 'dashboard',  icon: '📊', label: 'Дашборд' },
  { view: 'candidates', icon: '👤', label: 'Кандидаты' },
  { view: 'vacancies',  icon: '💼', label: 'Вакансии' },
  { view: 'reminders',  icon: '🔔', label: 'Напоминания' },
];

export default function Sidebar() {
  const activeView    = useStore(s => s.activeView);
  const setActiveView = useStore(s => s.setActiveView);
  const profile       = useStore(s => s.currentProfile);
  const user          = useStore(s => s.currentUser);
  const addToast      = useStore(s => s.addToast);

  const handleLogout = async () => {
    const { sb } = await import('@/lib/supabase');
    await sb.auth.signOut();
    useStore.setState({ currentUser: null, currentProfile: null });
    addToast('Выход выполнен');
  };

  const displayName = profile?.full_name || user?.email || '';
  const role        = profile?.role || 'recruiter';

  return (
    <aside className="hidden md:flex flex-col w-60 bg-indigo-700 text-white shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-indigo-600">
        <h1 className="text-xl font-black tracking-tight">Recruit CRM</h1>
        <p className="text-indigo-300 text-xs mt-0.5">Система управления подбором</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ view, icon, label }) => (
          <button
            key={view}
            data-view={view}
            onClick={() => setActiveView(view)}
            className={`nav-btn flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              activeView === view ? 'active' : 'hover:bg-white/10'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-indigo-600 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            {(role === 'viewer' || role === 'admin') && (
              <span className="text-xs text-indigo-300">
                {role === 'viewer' ? '👁 viewer' : '⚡ admin'}
              </span>
            )}
          </div>
        </div>

        {/* Realtime indicator */}
        <div className="flex items-center gap-2 text-xs text-indigo-300">
          <span id="realtime-dot" className="w-2 h-2 rounded-full inline-block" />
          <span id="realtime-label">Connecting…</span>
        </div>

        <button
          onClick={() => window.__openTelegramLink?.()}
          className="w-full text-left text-xs text-indigo-300 hover:text-white transition-colors"
        >
          🤖 Привязать Telegram
        </button>
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-indigo-300 hover:text-white transition-colors"
        >
          Выйти →
        </button>
      </div>
    </aside>
  );
}
