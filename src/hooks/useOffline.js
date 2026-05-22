import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';

const LS = {
  candidates: 'crm_cache_candidates',
  vacancies:  'crm_cache_vacancies',
  reminders:  'crm_cache_reminders',
  pendingOps: 'crm_pending_ops',
};

export { LS };

export function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}
export function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; }
}

export function getPendingOps() { return cacheGet(LS.pendingOps) || []; }
export function savePendingOps(ops) { cacheSet(LS.pendingOps, ops); }

export function queueOp(op) {
  const ops = getPendingOps();
  ops.push({ ...op, _id: Date.now() + Math.random(), _ts: Date.now() });
  savePendingOps(ops);
}

export async function syncPendingOps(toast) {
  const ops = getPendingOps();
  if (!ops.length) return;
  toast?.(`🔄 Синхронизация ${ops.length} изменений…`);
  const failed = [];
  for (const op of ops) {
    try {
      let error;
      if (op.type === 'insert') {
        ({ error } = await sb.from(op.table).insert(op.data));
        if (error?.code === '23505') error = null;
      } else if (op.type === 'upsert') {
        ({ error } = await sb.from(op.table).upsert(op.data));
      } else if (op.type === 'update') {
        ({ error } = await sb.from(op.table).update(op.data).eq(op.matchField, op.matchValue));
      } else if (op.type === 'delete') {
        ({ error } = await sb.from(op.table).delete().eq(op.matchField, op.matchValue));
      }
      if (error) failed.push(op);
    } catch(e) { failed.push(op); }
  }
  savePendingOps(failed);
  const synced = ops.length - failed.length;
  if (synced > 0) toast?.(`✅ Синхронизировано ${synced} изменений`);
  if (failed.length > 0) toast?.(`⚠️ Не удалось синхронизировать: ${failed.length}`, 'err');
  return { synced, failed: failed.length };
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const addToast = useStore(s => s.addToast);

  useEffect(() => {
    const goOnline  = () => { setIsOnline(true);  syncPendingOps(addToast); };
    const goOffline = () => { setIsOnline(false); };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [addToast]);

  return isOnline;
}
