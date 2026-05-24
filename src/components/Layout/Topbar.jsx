import { useStore } from '@/store';

const PAGE_TITLES = {
  dashboard:  'Дашборд',
  candidates: 'Кандидаты',
  vacancies:  'Вакансии',
  kanban:     'Пайплайн',
  reminders:  'Напоминания',
  interviews: 'Интервью',
  admin:      'Администрирование',
};

export default function Topbar() {
  const activeView   = useStore(s => s.activeView);
  const setActiveView = useStore(s => s.setActiveView);

  const title = PAGE_TITLES[activeView] || 'Дашборд';
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      height: 60, background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
    }}>
      {/* Left: title + date */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700,
          color: 'var(--ink)', lineHeight: 1,
        }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
          {today}
        </span>
      </div>

      {/* Right: search + bell + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, color: 'var(--muted)',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Поиск кандидатов, вакансий…"
            style={{
              width: 220, padding: '7px 14px 7px 30px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-sans)',
              color: 'var(--ink)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent2)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Notification bell */}
        <button style={{
          position: 'relative', width: 36, height: 36,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          🔔
          <span style={{
            position: 'absolute', top: 6, right: 6,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)',
            border: '1.5px solid #fff',
          }} />
        </button>

        {/* CTA: Add Candidate */}
        <button
          onClick={() => setActiveView('candidates')}
          className="btn-primary"
        >
          + Кандидат
        </button>
      </div>
    </header>
  );
}
