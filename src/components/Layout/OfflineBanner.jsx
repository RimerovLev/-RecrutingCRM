import { useOffline, syncPendingOps, getPendingOps } from '@/hooks/useOffline';
import { useStore } from '@/store';

export default function OfflineBanner() {
  const isOnline  = useOffline();
  const addToast  = useStore(s => s.addToast);
  const pending   = getPendingOps().length;

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-3 h-10">
      <span>📴 Режим офлайн — изменения сохраняются локально</span>
      {pending > 0 && (
        <button
          onClick={() => syncPendingOps(addToast)}
          className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 text-xs transition-colors"
        >
          Синхронизировать ({pending})
        </button>
      )}
    </div>
  );
}
