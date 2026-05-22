import { sb } from './config.js';
import { S } from './state.js';
import { toast } from './utils.js';
import { startRealtime, stopRealtime } from './realtime.js';

// ── Ключи localStorage ────────────────────────────────────────────
export const LS = {
  candidates: 'crm_cache_candidates',
  vacancies:  'crm_cache_vacancies',
  reminders:  'crm_cache_reminders',
  comments:   'crm_cache_comments',   // кэш по кандидату: LS.comments + '_' + candidateId
  pendingOps: 'crm_pending_ops',
};

// ── Состояние сети ────────────────────────────────────────────────
export let isOnline = navigator.onLine;

export function setOnlineState(online) {
  isOnline = online;
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = online ? 'none' : 'flex';
  if (online) {
    if (S.currentUser) startRealtime();
    syncPendingOps();
  } else {
    stopRealtime();
  }
}

window.addEventListener('online',  () => setOnlineState(true));
window.addEventListener('offline', () => setOnlineState(false));

// ── Сохранение / чтение кэша ──────────────────────────────────────
export function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}
export function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; }
}

// ── Очередь офлайн-операций ───────────────────────────────────────
export function getPendingOps() { return cacheGet(LS.pendingOps) || []; }
export function savePendingOps(ops) { cacheSet(LS.pendingOps, ops); }

export function queueOp(op) {
  const ops = getPendingOps();
  ops.push({ ...op, _id: Date.now() + Math.random(), _ts: Date.now() });
  savePendingOps(ops);
  updateSyncBadge();
  toast('📴 Сохранено офлайн — синхронизируется при подключении', 'warn');
}

export function updateSyncBadge() {
  const n = getPendingOps().length;
  const badge = document.getElementById('sync-badge');
  if (badge) { badge.textContent = n || ''; badge.style.display = n ? 'flex' : 'none'; }
}

// ── Синхронизация при восстановлении сети ─────────────────────────
export async function syncPendingOps() {
  const ops = getPendingOps();
  if (!ops.length) return;
  toast(`🔄 Синхронизация ${ops.length} изменений…`);

  const failed = [];
  for (const op of ops) {
    try {
      let error;
      if (op.type === 'insert') {
        ({ error } = await sb.from(op.table).insert(op.data));
        if (error?.code === '23505') { error = null; }
      } else if (op.type === 'upsert') {
        ({ error } = await sb.from(op.table).upsert(op.data));
      } else if (op.type === 'update') {
        ({ error } = await sb.from(op.table).update(op.data).eq(op.matchField, op.matchValue));
      } else if (op.type === 'delete') {
        ({ error } = await sb.from(op.table).delete().eq(op.matchField, op.matchValue));
      }
      if (error) { failed.push(op); }
    } catch(e) { failed.push(op); }
  }

  savePendingOps(failed);
  updateSyncBadge();

  const synced = ops.length - failed.length;
  if (synced > 0) {
    toast(`✅ Синхронизировано ${synced} изменений`);
    if (S.currentUser) {
      // These are imported lazily to avoid circular deps — call via window
      window._loadCandidatesAfterSync?.();
      window._loadRemindersAfterSync?.();
      // Чистим _offline флаги из кэшей комментариев
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(LS.comments + '_')) {
          const cached = cacheGet(key) || [];
          const cleaned = cached.map(c => { const {_offline, _authorName, ...rest} = c; return rest; });
          cacheSet(key, cleaned);
        }
      }
    }
  }
  if (failed.length > 0) toast(`⚠️ Не удалось синхронизировать: ${failed.length}`, 'err');
}

// ── Обёртка для Supabase-запросов с офлайн-фолбэком ──────────────
export async function sbFetch(table, query, cacheKey) {
  if (!isOnline) {
    const cached = cacheGet(cacheKey);
    return { data: cached, fromCache: true };
  }
  const result = await query;
  if (!result.error && result.data) cacheSet(cacheKey, result.data);
  return result;
}
