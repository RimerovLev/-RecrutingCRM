import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { VAC_STATUS_BADGE, VAC_STATUS_LABEL } from '@/lib/config';
import { cacheSet, cacheGet, LS } from '@/hooks/useOffline';
import Modal from '@/components/common/Modal';

function money(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

const EMPTY_VAC = {
  title: '', description: '', requirements: '', salary_min: '', salary_max: '',
  status: 'open', notes: '', department: '', headcount: '', deadline: '',
};

export default function VacanciesPage() {
  const allVacancies   = useStore(s => s.allVacancies);
  const setAllVacancies = useStore(s => s.setAllVacancies);
  const currentUser    = useStore(s => s.currentUser);
  const canWrite       = useCanWrite();
  const addToast       = useStore(s => s.addToast);
  const setKanban      = useStore(s => s.setKanbanVacancy);
  const setActiveView  = useStore(s => s.setActiveView);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [form, setForm]           = useState(EMPTY_VAC);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('vacancies')
      .select('*, candidacies(count)')
      .eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      const cached = cacheGet(LS.vacancies + '_' + currentUser.id);
      if (cached) { setAllVacancies(cached); addToast('📴 Кэшированные данные', 'warn'); }
      else addToast('Ошибка загрузки вакансий', 'err');
    } else {
      cacheSet(LS.vacancies + '_' + currentUser.id, data || []);
      setAllVacancies(data || []);
    }
  }, [currentUser?.id]);

  useEffect(() => { if (currentUser) load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_VAC); setEditId(null); setModalOpen(true); };

  const openEdit = (v) => {
    setForm({
      title: v.title || '', description: v.description || '', requirements: v.requirements || '',
      salary_min: v.salary_min || '', salary_max: v.salary_max || '',
      status: v.status || 'open', notes: v.notes || '', department: v.department || '',
      headcount: v.headcount || '', deadline: v.deadline || '',
    });
    setEditId(v.id);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canWrite) { addToast('Недостаточно прав (роль viewer)', 'err'); return; }
    setSaving(true);
    const payload = {
      title:        form.title.trim(),
      description:  form.description.trim() || null,
      requirements: form.requirements.trim() || null,
      salary_min:   parseInt(form.salary_min) || null,
      salary_max:   parseInt(form.salary_max) || null,
      status:       form.status || 'open',
      notes:        form.notes.trim() || null,
      department:   form.department.trim() || null,
      headcount:    parseInt(form.headcount) || null,
      deadline:     form.deadline || null,
    };
    let error;
    if (editId) {
      ({ error } = await sb.from('vacancies').update(payload).eq('id', editId));
    } else {
      payload.recruiter_id = currentUser.id;
      ({ error } = await sb.from('vacancies').insert(payload));
    }
    setSaving(false);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast(editId ? 'Вакансия обновлена ✓' : 'Вакансия создана ✓');
    setModalOpen(false);
    load();
  };

  const toggleStatus = async (id, current) => {
    const next = current === 'open' ? 'closed' : 'open';
    const { error } = await sb.from('vacancies').update({ status: next }).eq('id', id);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast(`Вакансия ${next === 'open' ? 'открыта' : 'закрыта'}`);
    load();
  };

  const handleDelete = async (id, title) => {
    if (!confirm(`Удалить вакансию «${title}»?`)) return;
    const { data: linked } = await sb.from('candidacies').select('id').eq('vacancy_id', id);
    if (linked?.length > 0 && !confirm(`К вакансии привязано ${linked.length} кандидатов. Удалить всё равно?`)) return;
    const { error } = await sb.from('vacancies').delete().eq('id', id);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Вакансия удалена');
    load();
  };

  const openKanban = (id, title) => {
    setKanban(id, title);
    setActiveView('kanban');
  };

  const today = new Date(); today.setHours(0,0,0,0);

  return (
    <div className="p-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title mb-0">Вакансии</h2>
        {canWrite && (
          <button onClick={openCreate} className="btn-primary">+ Вакансия</button>
        )}
      </div>

      {allVacancies.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <p className="text-4xl mb-3">💼</p>
          <p className="font-semibold">Нет вакансий</p>
          <p className="text-sm mt-1">Создайте первую вакансию для начала подбора</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {allVacancies.map(v => {
            const badgeCls = VAC_STATUS_BADGE[v.status] || 'bg-slate-100 text-slate-500';
            const badgeLbl = VAC_STATUS_LABEL[v.status] || v.status;
            const candCount = v.candidacies?.[0]?.count ?? null;
            let deadlineEl = null;
            if (v.deadline) {
              const dl = new Date(v.deadline);
              const overdue = dl < today;
              deadlineEl = (
                <span className={`text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                  ⏰ до {dl.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
              );
            }
            return (
              <div key={v.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 leading-tight">{v.title}</h3>
                    {v.department && <p className="text-xs text-slate-400 mt-0.5">{v.department}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${badgeCls}`}>{badgeLbl}</span>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(v.salary_min || v.salary_max) && (
                    <span className="text-xs text-slate-500">💰 {money(v.salary_min)} — {money(v.salary_max)}</span>
                  )}
                  {deadlineEl}
                  {v.headcount && candCount !== null && (
                    <span className="text-xs text-slate-400">👥 {Math.min(candCount, v.headcount)}/{v.headcount}</span>
                  )}
                  {!v.headcount && candCount !== null && (
                    <span className="text-xs text-slate-400">👤 {candCount} канд.</span>
                  )}
                </div>

                {v.description && <p className="text-slate-600 text-xs line-clamp-2">{v.description}</p>}
                {v.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    📝 {v.notes}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 mt-auto pt-1 border-t border-slate-100">
                  <button onClick={() => openKanban(v.id, v.title)} className="btn-primary btn-sm flex-1">📋 Канбан</button>
                  {canWrite && <>
                    <button onClick={() => openEdit(v)} className="btn-secondary btn-sm px-2.5" title="Редактировать">✏️</button>
                    <button onClick={() => toggleStatus(v.id, v.status)} className="btn-secondary btn-sm">
                      {v.status === 'open' ? '🔒 Закрыть' : '🔓 Открыть'}
                    </button>
                    <button onClick={() => handleDelete(v.id, v.title)} className="btn-secondary btn-sm px-2.5 hover:bg-red-50 hover:text-red-500" title="Удалить">🗑️</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Редактировать вакансию' : 'Создать вакансию'} wide>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="form-label">Название *</label>
            <input className="input-field" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Отдел</label>
              <input className="input-field" value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">Статус</label>
              <select className="input-field" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="open">Открыта</option>
                <option value="in_work">В работе</option>
                <option value="closed">Закрыта</option>
                <option value="archive">Архив</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Зарплата от</label>
              <input type="number" className="input-field" value={form.salary_min} onChange={e => setForm(f => ({...f, salary_min: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">Зарплата до</label>
              <input type="number" className="input-field" value={form.salary_max} onChange={e => setForm(f => ({...f, salary_max: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">Кол-во мест</label>
              <input type="number" className="input-field" value={form.headcount} onChange={e => setForm(f => ({...f, headcount: e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="form-label">Дедлайн</label>
            <input type="date" className="input-field" value={form.deadline} onChange={e => setForm(f => ({...f, deadline: e.target.value}))} />
          </div>
          <div>
            <label className="form-label">Описание</label>
            <textarea className="input-field" rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div>
            <label className="form-label">Требования</label>
            <textarea className="input-field" rows={3} value={form.requirements} onChange={e => setForm(f => ({...f, requirements: e.target.value}))} />
          </div>
          <div>
            <label className="form-label">Заметки</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2.5">
              {saving ? 'Сохранение…' : '💾 Сохранить'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary px-6">Отмена</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
