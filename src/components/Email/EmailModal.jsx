import { useState, useEffect } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import Modal from '@/components/common/Modal';

export default function EmailModal() {
  const emailModalOpen          = useStore(s => s.emailModalOpen);
  const closeEmailModal         = useStore(s => s.closeEmailModal);
  const pendingEmailCandidateId = useStore(s => s.pendingEmailCandidateId);
  const currentUserId           = useStore(s => s.currentUserId);
  const currentUserEmail        = useStore(s => s.currentUserEmail);
  const currentProfileName      = useStore(s => s.currentProfileName);
  const addToast                = useStore(s => s.addToast);

  const [candidate,  setCandidate]  = useState(null);
  const [templates,  setTemplates]  = useState([]);
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  // Load candidate + templates when modal opens
  useEffect(() => {
    if (!emailModalOpen || !pendingEmailCandidateId) return;

    sb.from('candidates')
      .select('id, full_name, candidate_link')
      .eq('id', pendingEmailCandidateId)
      .single()
      .then(({ data }) => {
        setCandidate(data);
        // Try to pre-fill email from candidate_link if it looks like an email
        if (data?.candidate_link && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.candidate_link)) {
          setRecipientEmail(data.candidate_link);
        } else {
          setRecipientEmail('');
        }
      });

    sb.from('email_templates')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => setTemplates(data || []));
  }, [emailModalOpen, pendingEmailCandidateId]);

  const applyTemplate = (tpl) => {
    const name = candidate?.full_name || '';
    setSubject(tpl.subject?.replace(/\{name\}/gi, name) || '');
    setBody(tpl.body?.replace(/\{name\}/gi, name) || '');
  };

  const handleSend = async () => {
    if (!recipientEmail || !subject || !body) {
      addToast('Заполни получателя, тему и текст', 'err');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      addToast('Неверный email получателя', 'err');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            to:           recipientEmail,
            subject,
            html:         body.replace(/\n/g, '<br>'),
            sender_name:  currentProfileName || '',
            sender_email: currentUserEmail   || '',
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error?.message || result?.error || 'Ошибка отправки');
      addToast('✉️ Письмо отправлено');
      closeEmailModal();
    } catch (e) {
      addToast('Ошибка: ' + e.message, 'err');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSubject(''); setBody(''); setCandidate(null); setRecipientEmail('');
    closeEmailModal();
  };

  if (!emailModalOpen) return null;

  return (
    <Modal onClose={handleClose} title={`✉️ Письмо${candidate ? ` — ${candidate.full_name}` : ''}`}>
      <div className="space-y-4">

        {/* Recipient */}
        <div>
          <label className="form-label">Email получателя</label>
          <input
            className="input-field w-full"
            type="email"
            placeholder="candidate@example.com"
            value={recipientEmail}
            onChange={e => setRecipientEmail(e.target.value)}
          />
        </div>

        {/* From info */}
        <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
          От кого: <span className="text-slate-600 font-medium">{currentProfileName || 'Рекрутер'}</span>
          {' '}· Ответы придут на{' '}
          <span className="text-slate-600 font-medium">{currentUserEmail}</span>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div>
            <label className="form-label">Шаблон</label>
            <div className="flex flex-wrap gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="btn-secondary btn-sm"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="form-label">Тема</label>
          <input
            className="input-field w-full"
            placeholder="Тема письма"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div>
          <label className="form-label">Текст</label>
          <textarea
            className="input-field w-full"
            rows={8}
            placeholder="Текст письма…"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">Можно использовать {'{name}'} — подставит имя кандидата</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={handleClose} className="btn-secondary">Отмена</button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="btn-primary"
          >
            {sending ? '⏳ Отправка…' : '✉️ Отправить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
