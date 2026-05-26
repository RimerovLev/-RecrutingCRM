import { useState } from 'react';
import { useStore } from '@/store';

const CONTACT = 'rimerovlev@gmail.com';

export default function TrialBanner() {
  const sub     = useStore(s => s.orgSubscription);
  const email   = useStore(s => s.currentUserEmail);
  const orgName = useStore(s => s.currentOrgName);
  const [dismissed, setDismissed] = useState(false);

  // Only show for active trials with <= 7 days remaining
  if (dismissed) return null;
  if (!sub) return null;
  if (sub.plan !== 'trial') return null;
  if (!sub.is_active) return null;
  if (sub.days_remaining === null || sub.days_remaining > 7) return null;

  const days = sub.days_remaining;

  const subject = encodeURIComponent('Подписка CRM — ' + (orgName || email || ''));
  const body    = encodeURIComponent(
    `Здравствуйте!\n\nОрганизация: ${orgName || '—'}\nEmail: ${email || '—'}\n\nЯ хочу оформить подписку.\n`
  );

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
      <span className="text-amber-800">
        ⏳{' '}
        {days === 0
          ? 'Пробный период заканчивается сегодня!'
          : `Пробный период заканчивается через ${days} ${pluralDays(days)}.`}{' '}
        <a
          href={`mailto:${CONTACT}?subject=${subject}&body=${body}`}
          className="font-semibold text-amber-900 underline hover:text-amber-700"
        >
          Оформить подписку
        </a>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-900 shrink-0 text-base leading-none"
        aria-label="Закрыть"
      >
        ✕
      </button>
    </div>
  );
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дня';
  return 'дней';
}
