import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import Modal from '@/components/common/Modal';

const EMPTY = { name: '', subject: '', body: '' };

export default function TemplatesPage() {
  const currentUserId = useStore(s => s.currentUserId);
  const currentOrgId  = useStore(s => s.currentOrgId);
  const addToast      = useStore(s => s.addToast);
  const canWrite      = useCanWrite();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [preview, setPreview]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('email_templates')
      .select('*').order('name');
    if (!error) setTemplates(data || []);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { if (currentOrgId) load(); }, [currentOrgId]);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit   = (t)  => { setEditId(t.id); setForm({ name: t.name, subject: t.subject, body: t.body }); setModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { addToast('Укажи название шаблона', 'err'); return; }
    if (!form.subject.trim()) { addToast('Укажи тему письма', 'err'); return; }

    const payload = { ...form, recruiter_id: currentUserId, org_id: currentOrgId };
    let error;
    if (editId) {
      ({ error } = await sb.from('email_templates').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('email_templates').insert(payload));
    }
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast(editId ? 'Шаблон обновлён ✓' : 'Шаблон создан ✓');
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await sb.from('email_templates').delete().eq('id', id);
    addToast('Удалено');
    if (preview?.id === id) setPreview(null);
    load();
  };

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>
            {templates.length} шаблонов
          </p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className="btn-primary">+ Шаблон</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>Загрузка…</div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>✉️</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Нет шаблонов</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>Создай шаблоны для быстрой отправки писем кандидатам</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 420px' : '1fr', gap: 20 }}>
          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <div
                key={t.id}
                className="card"
                style={{ padding: '16px 20px', cursor: 'pointer', border: preview?.id === t.id ? '1px solid var(--accent2)' : '1px solid var(--border)' }}
                onClick={() => setPreview(preview?.id === t.id ? null : t)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Тема: {t.subject}
                    </p>
                  </div>
                  {canWrite && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(t); }}
                        style={{ fontSize: 11, color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}
                      >Изменить</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                        style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}
                      >Удалить</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview panel */}
          {preview && (
            <div className="card" style={{ padding: 24, height: 'fit-content', position: 'sticky', top: 80 }}>
              <p style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 16 }}>Предпросмотр</p>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{preview.name}</p>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Тема</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>{preview.subject}</p>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>Текст письма</p>
                <p style={{ fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--font-sans)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{preview.body}</p>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 12 }}>
                Переменные: <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 4 }}>{'{{name}}'}</code>, <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 4 }}>{'{{position}}'}</code>, <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 4 }}>{'{{recruiter}}'}</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Редактировать шаблон' : 'Новый шаблон'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="form-label">Название шаблона *</label>
            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Например: Первичный контакт" required />
          </div>
          <div>
            <label className="form-label">Тема письма *</label>
            <input className="input-field" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Приглашение на собеседование" required />
          </div>
          <div>
            <label className="form-label">Текст письма</label>
            <textarea
              className="input-field"
              rows={6}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder={"Здравствуйте, {{name}}!\n\nМы рассмотрели вашу кандидатуру на позицию {{position}}…"}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
              Используй {'{{name}}'}, {'{{position}}'}, {'{{recruiter}}'} — они подставятся автоматически при отправке
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}>
              💾 Сохранить
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary" style={{ padding: '10px 20px' }}>
              Отмена
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
