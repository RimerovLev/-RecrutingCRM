import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import Modal from '@/components/common/Modal';

export default function ChangePasswordModal({ open, onClose }) {
  const addToast = useStore(s => s.addToast);

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (next.length < 6) {
      addToast('Пароль должен быть не менее 6 символов', 'err'); return;
    }
    if (next !== confirm) {
      addToast('Пароли не совпадают', 'err'); return;
    }

    setLoading(true);

    // Supabase: сначала проверяем текущий пароль через повторный вход
    const { data: userData } = await sb.auth.getUser();
    const email = userData?.user?.email;

    const { error: signInErr } = await sb.auth.signInWithPassword({
      email,
      password: current,
    });

    if (signInErr) {
      addToast('Текущий пароль неверный', 'err');
      setLoading(false);
      return;
    }

    // Меняем пароль
    const { error } = await sb.auth.updateUser({ password: next });
    setLoading(false);

    if (error) {
      addToast('Ошибка: ' + error.message, 'err');
    } else {
      addToast('Пароль успешно изменён ✓');
      handleClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Сменить пароль">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="form-label">Текущий пароль *</label>
          <input
            type="password"
            className="input-field"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="form-label">Новый пароль *</label>
          <input
            type="password"
            className="input-field"
            value={next}
            onChange={e => setNext(e.target.value)}
            placeholder="Минимум 6 символов"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="form-label">Повтори новый пароль *</label>
          <input
            type="password"
            className="input-field"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Ещё раз новый пароль"
            required
            autoComplete="new-password"
          />
          {confirm && next && confirm !== next && (
            <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
              Пароли не совпадают
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}
          >
            {loading ? 'Сохраняем…' : '🔒 Сменить пароль'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="btn-secondary"
            style={{ padding: '10px 20px' }}
          >
            Отмена
          </button>
        </div>
      </form>
    </Modal>
  );
}
