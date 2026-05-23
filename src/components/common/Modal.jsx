import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  // Ref so the effect never depends on the onClose function reference
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // only [open] — stable

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCloseRef.current?.(); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh]`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <button
              onClick={() => onCloseRef.current?.()}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >✕</button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
