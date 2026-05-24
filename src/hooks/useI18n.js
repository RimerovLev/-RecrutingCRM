import { useStore } from '@/store';
import { translate } from '@/lib/i18n';

/**
 * Usage:
 *   const { t, lang, isRTL } = useI18n();
 *   t('nav.candidates')  →  'מועמדים'  or  'Кандидаты'
 */
export function useI18n() {
  const lang = useStore(s => s.language);

  const t = (key, fallback) => translate(lang, key, fallback);

  return {
    t,
    lang,
    isRTL: lang === 'he',
  };
}
