import { useState, useEffect, useRef } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import Modal from '@/components/common/Modal';

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// Expose globally so Sidebar can call it
window.__openTelegramLink = null;

export default function TelegramLinkModal() {
  const currentUser = useStore(s => s.currentUser);
  const addToast    = useStore(s => s.addToast);

  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState('idle'); // idle | generated
  const [code, setCode]       = useState('');
  const [timer, setTimer]     = useState('');
  const intervalRef           = useRef(null);

  useEffect(() => {
    window.__openTelegramLink = () => setOpen(true);
    return () => { window.__openTelegramLink = null; };
  }, []);

  const handleClose = () => {
    setOpen(false);
    setStep('idle');
    setCode('');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const generate = async () => {
    if (!currentUser) return;
    const c = randomCode(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await sb.from('link_codes').insert({
      code: c, recruiter_id: currentUser.id, expires_at: expiresAt, used: false,
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    setCode(c);
    setStep('generated');
    const expiry = Date.now() + 15 * 60 * 1000;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      const m = Math.floor(left / 60);
      const s = left % 60;
      setTimer(`${m}:${String(s).padStart(2, '0')}`);
      if (left === 0) {
        clearInterval(intervalRef.current);
        setTimer('Истёк');
      }
    }, 1000);
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(`/link ${code}`).then(() => addToast('Скопировано! ✓'));
  };

  return (
    <Modal open={open} onClose={handleClose} title="Привязать Telegram-бота">
      {step === 'idle' ? (
        <div className="text-center space-y-4">
          <p className="text-5xl">🤖</p>
          <p className="text-slate-600 text-sm">Сгенерируй одноразовый код и отправь его боту командой <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">/link КОД</code></p>
          <button onClick={generate} className="btn-primary w-full justify-center py-2.5">
            Сгенерировать код
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center bg-indigo-50 rounded-xl p-5">
            <p className="text-3xl font-black text-indigo-700 tracking-[.2em] mb-2">{code}</p>
            <p className="text-xs text-slate-500">Команда для бота:</p>
            <code className="text-sm font-bold text-slate-800">/link {code}</code>
          </div>
          <div className="flex gap-2">
            <button onClick={copyCmd} className="btn-primary flex-1 justify-center">📋 Скопировать команду</button>
            <button onClick={generate} className="btn-secondary px-4">↺</button>
          </div>
          <p className="text-xs text-slate-400 text-center">
            {timer && timer !== 'Истёк' ? `Код действует ещё ${timer}` : 'Код истёк. Сгенерируй новый.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
