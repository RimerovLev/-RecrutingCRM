import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';
import Modal from '@/components/common/Modal';

export default function ChangePasswordModal({ open, onClose }) {
  const addToast = useStore(s => s.addToast);
  const { t }    = useI18n();

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (next.length < 6) {
      addToast(t('common.error'), 'err'); return;
    }
    if (next !== confirm) {
      addToast(t('changePw.mismatch'), 'err'); return;
    }

    setLoading(true);

    const { data: userData } = await sb.auth.getUser();
    const email = userData?.user?.email;

    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password: current });

    if (signInErr) {
      addToast(t('changePw.toastError'), 'err');
      setLoading(false);
      return;
    }

    const { error } = await sb.auth.updateUser({ password: next });
    setLoading(false);

    if (error) {
      addToast(t('common.error') + ': ' + error.message, 'err');
    } else {
      addToast(t('changePw.toastSuccess') + ' ✓');
      handleClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('changePw.title')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="form-label">{t('changePw.currentPw')} *</label>
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
          <label className="form-label">{t('changePw.newPw')} *</label>
          <input
            type="password"
            className="input-field"
            value={next}
            onChange={e => setNext(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="form-label">{t('changePw.confirmPw')} *</label>
          <input
            type="password"
            className="input-field"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          {confirm && next && confirm !== next && (
            <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
              {t('changePw.mismatch')}
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
            {loading ? t('common.saving') : '🔒 ' + t('changePw.saveBtn')}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="btn-secondary"
            style={{ padding: '10px 20px' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
