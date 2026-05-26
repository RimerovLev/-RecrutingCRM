import { sb } from '@/lib/supabase';
import { useStore } from '@/store';

const CONTACT = 'rimerovlev@gmail.com';

const PLANS = [
  { key: 'monthly',     label: 'Месяц',    desc: '1 месяц доступа' },
  { key: 'semi_annual', label: 'Полгода',  desc: '6 месяцев доступа' },
  { key: 'annual',      label: 'Год',      desc: '12 месяцев доступа' },
  { key: 'lifetime',    label: 'Навсегда', desc: 'Пожизненный доступ' },
];

export default function SubscriptionGate() {
  const sub       = useStore(s => s.orgSubscription);
  const email     = useStore(s => s.currentUserEmail);
  const orgName   = useStore(s => s.currentOrgName);
  const clearAuth = useStore(s => s.clearAuth);

  const isTrialExpired = sub?.plan === 'trial' && !sub?.is_active;
  const isCancelled    = sub?.status === 'cancelled';
  const isSuspended    = sub?.status === 'suspended';

  const handleSignOut = async () => {
    localStorage.removeItem('crm_device_token');
    await sb.auth.signOut();
    clearAuth();
  };

  const subject = encodeURIComponent('Подписка CRM — ' + (orgName || email || ''));
  const body    = encodeURIComponent(
    `Здравствуйте!\n\nОрганизация: ${orgName || '—'}\nEmail: ${email || '—'}\n\nЯ хочу оформить подписку.\n`
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 text-center">

        {/* Icon */}
        <div className="text-5xl">🔒</div>

        {/* Heading */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">
            {isTrialExpired
              ? 'Пробный период завершён'
              : isCancelled
              ? 'Подписка отменена'
              : isSuspended
              ? 'Подписка приостановлена'
              : 'Доступ заблокирован'}
          </h2>
          <p className="text-sm text-slate-500">
            {isTrialExpired
              ? 'Ваш 14-дневный пробный период закончился. Выберите план, чтобы продолжить работу.'
              : 'Для продолжения работы необходимо активировать подписку.'}
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-2 gap-3 text-left">
          {PLANS.map(p => (
            <a
              key={p.key}
              href={`mailto:${CONTACT}?subject=${subject}&body=${body}`}
              className="block border border-slate-200 rounded-xl p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <div className="font-semibold text-slate-800 text-sm">{p.label}</div>
              <div className="text-xs text-slate-500">{p.desc}</div>
            </a>
          ))}
        </div>

        {/* Contact */}
        <p className="text-xs text-slate-400">
          Напишите нам:{' '}
          <a
            href={`mailto:${CONTACT}?subject=${subject}&body=${body}`}
            className="text-blue-500 hover:underline"
          >
            {CONTACT}
          </a>
        </p>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
