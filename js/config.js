import {
  SUPABASE_URL as DEF_URL,
  SUPABASE_ANON_KEY as DEF_KEY,
  EMAIL_FROM as DEF_EMAIL,
} from './config.defaults.js';

const cfg = (typeof window !== 'undefined' && window.CRM_CONFIG) || {};

export const SUPABASE_URL      = cfg.SUPABASE_URL      || DEF_URL;
export const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || DEF_KEY;
export const EMAIL_FROM        = cfg.EMAIL_FROM        || DEF_EMAIL;

export function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase не настроен. Скопируйте js/config.local.example.js → js/config.local.js и укажите ключи.'
    );
  }
}

// ② Email — отправка через Supabase Edge Function (Resend)

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
  new: 'Новый', resume: '📄 Резюме', phone: '📞 Звонок',
  interview: '🤝 Собес', offer: '🎉 Оффер', rejected: '❌ Отказ',
};

export const STATUS_LABELS = { active: 'Активный', in_work: 'В работе', archive: 'Архив' };
export const STATUS_BADGE  = { active: 'badge-active', in_work: 'badge-in_work', archive: 'badge-archive' };

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

assertConfig();

const { createClient } = supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
