export const EMAIL_FROM = import.meta.env.VITE_EMAIL_FROM || 'onboarding@resend.dev';

export const STAGES = ['new', 'resume', 'phone', 'interview', 'offer', 'rejected'];
export const FREE_STAGES = new Set(['new', 'resume']);

export const STAGE_COLORS = {
  new:       'bg-slate-100 text-slate-500',
  resume:    'bg-blue-100 text-blue-600',
  phone:     'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer:     'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-500',
};

export const STAGE_LABELS = {
  new:       'Новый',
  resume:    '📄 Резюме',
  phone:     '📞 Звонок',
  interview: '🤝 Собес',
  offer:     '🎉 Оффер',
  rejected:  '❌ Отказ',
};

export const STATUS_LABELS = { active: 'Активный', in_work: 'В работе', archive: 'Архив' };
export const STATUS_BADGE  = {
  active:  'bg-emerald-100 text-emerald-700',
  in_work: 'bg-amber-100 text-amber-700',
  archive: 'bg-slate-100 text-slate-500',
};

export const VAC_STATUS_BADGE = {
  open:    'bg-emerald-100 text-emerald-700',
  in_work: 'bg-amber-100 text-amber-700',
  closed:  'bg-slate-100 text-slate-500',
  archive: 'bg-orange-100 text-orange-600',
};
export const VAC_STATUS_LABEL = {
  open:    'Открыта',
  in_work: 'В работе',
  closed:  'Закрыта',
  archive: 'Архив',
};

export const PAGE_SIZE = 100;
