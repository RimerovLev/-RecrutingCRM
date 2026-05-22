import { useStore } from '@/store';

const COLORS = {
  ok:   'bg-emerald-600',
  err:  'bg-red-600',
  info: 'bg-indigo-600',
  warn: 'bg-amber-500',
};

export default function ToastContainer() {
  const toasts = useStore(s => s.toasts);
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast-enter pointer-events-auto ${COLORS[t.type] || COLORS.ok} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg max-w-xs`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
