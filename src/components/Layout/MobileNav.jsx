import { useStore } from '@/store';

const NAV = [
  { view: 'dashboard',  icon: '📊', label: 'Дашборд' },
  { view: 'candidates', icon: '👤', label: 'Кандидаты' },
  { view: 'vacancies',  icon: '💼', label: 'Вакансии' },
  { view: 'reminders',  icon: '🔔', label: 'Напоминания' },
];

export default function MobileNav() {
  const activeView    = useStore(s => s.activeView);
  const setActiveView = useStore(s => s.setActiveView);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-slate-200 flex">
      {NAV.map(({ view, icon, label }) => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 transition-colors ${
            activeView === view
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span className="text-base">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
