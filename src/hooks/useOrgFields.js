import { useEffect } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { mergeWithDefaults, sortedFields } from '@/lib/defaultFields';

/**
 * useOrgFields()
 *
 * Returns { fields, visibleFields, saveFields, ready }
 *
 * fields        — full array (visible + hidden), sorted by order
 * visibleFields — only fields with visible:true
 * saveFields(newFields) — persist to org_settings via RPC
 * ready         — false while first load is in progress
 */
export function useOrgFields() {
  const currentOrgId  = useStore(s => s.currentOrgId);
  const orgFields     = useStore(s => s.orgFields);
  const orgFieldsReady = useStore(s => s.orgFieldsReady);
  const setOrgFields  = useStore(s => s.setOrgFields);
  const addToast      = useStore(s => s.addToast);

  // Load once per session when org is known
  useEffect(() => {
    if (!currentOrgId || orgFieldsReady) return;

    (async () => {
      const { data, error } = await sb
        .from('org_settings')
        .select('candidate_fields')
        .eq('org_id', currentOrgId)
        .maybeSingle();

      if (error) {
        console.warn('useOrgFields load:', error.message);
        // Fall back to defaults so the app still works
        setOrgFields(mergeWithDefaults(null));
        return;
      }

      setOrgFields(mergeWithDefaults(data?.candidate_fields ?? null));
    })();
  }, [currentOrgId, orgFieldsReady]);

  const fields = orgFields ?? mergeWithDefaults(null);
  const visibleFields = fields.filter(f => f.visible);

  const saveFields = async (newFields) => {
    if (!currentOrgId) return;
    const sorted = sortedFields(newFields).map((f, i) => ({ ...f, order: i }));
    setOrgFields(sorted); // optimistic update

    const { error } = await sb.rpc('upsert_org_settings', {
      p_org_id:           currentOrgId,
      p_candidate_fields: JSON.stringify(sorted),
    });

    if (error) {
      addToast('Ошибка сохранения полей: ' + error.message, 'err');
      // Revert not strictly needed — user can re-save
    }
  };

  return { fields, visibleFields, saveFields, ready: orgFieldsReady };
}
