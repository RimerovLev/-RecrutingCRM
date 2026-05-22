import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { STAGES, STAGE_LABELS, STAGE_COLORS, STATUS_BADGE } from '@/lib/config';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

export default function CandidateDrawer({ onReload }) {
  const drawerCandidateId = useStore(s => s.drawerCandidateId);
  const closeDrawer       = useStore(s => s.closeDrawer);
  const allCandidates     = useStore(s => s.allCandidates);
  const currentUser       = useStore(s => s.currentUser);
  const addToast          = useStore(s => s.addToast);
  const canWrite          = useCanWrite();
  const [visible, setVisible] = useState(false);

  // Data
  const [candidate, setCandidate] = useState(null);
  const [candidacies, setCandidacies] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [comments, setComments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [activeTab, setActiveTab] = useState('info');

  // Add reminder
  const [remNote, setRemNote]   = useState('');
  const [remDate, setRemDate]   = useState('');
  const [remTime, setRemTime]   = useState('');

  // Add comment
  const [comment, setComment] = useState('');

  // Add interview
  const [intDate, setIntDate]   = useState('');
  const [intTime, setIntTime]   = useState('');
  const [intNote, setIntNote]   = useState('');
  const [intType, setIntType]   = useState('phone');

  // Edit
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(closeDrawer, 300);
  };

  const loadAll = useCallback(async () => {
    if (!drawerCandidateId || !currentUser) return;

    // Try local store first
    const local = allCandidates.find(c => c.id === drawerCandidateId);
    if (local) setCandidate(local);

    // Load fresh from DB
    const [candRes, ccRes, remRes, commentRes] = await Promise.all([
      sb.from('candidates').select('*').eq('id', drawerCandidateId).single(),
      sb.from('candidacies').select('id, current_stage, vacancy_id, vacancies(id,title,status)').eq('candidate_id', drawerCandidateId).order('created_at', { ascending: false }),
      sb.from('reminders').select('*').eq('candidate_id', drawerCandidateId).eq('is_done', false).order('due_date', { ascending: true }),
      sb.from('comments').select('*, profiles(full_name)').eq('candidate_id', drawerCandidateId).order('created_at', { ascending: false }).limit(20),
    ]);

    if (candRes.data) setCandidate(candRes.data);
    setCandidacies(ccRes.data || []);
    setReminders(remRes.data || []);
    setComments(commentRes.data || []);

    // Load timeline
    const c = candRes.data;
    const events = [];
    if (c?.created_at) events.push({ ts: c.created_at, icon: '👤', color: 'bg-indigo-100', text: 'Кандидат добавлен' });
    const candIds = (ccRes.data || []).map(cc => cc.id);
    if (candIds.length) {
      const { data: stageH } = await sb.from('stage_history')
        .select('from_stage, to_stage, changed_at, candidacy_id, candidacies(vacancies(title))')
        .in('candidacy_id', candIds).order('changed_at', { ascending: false }).limit(30);
      (stageH || []).forEach(e => {
        events.push({
          ts: e.changed_at, icon: '🔄', color: 'bg-purple-100',
          text: `${STAGE_LABELS[e.from_stage] || e.from_stage} → ${STAGE_LABELS[e.to_stage] || e.to_stage}`,
          sub: e.candidacies?.vacancies?.title || null,
        });
      });
    }
    (commentRes.data || []).forEach(cm => {
      events.push({ ts: cm.created_at, icon: '💬', color: 'bg-blue-100', text: cm.content, sub: cm.profiles?.full_name || null });
    });
    (remRes.data || []).forEach(r => {
      events.push({ ts: r.created_at, icon: r.is_done ? '✅' : '⏰', color: r.is_done ? 'bg-green-100' : 'bg-yellow-100', text: r.note, sub: r.due_date ? `Срок: ${fmtDay(r.due_date)}` : null });
    });
    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    setTimeline(events);

    // Interviews
    const { data: intData } = await sb.from('interviews')
      .select('*').eq('candidate_id', drawerCandidateId).order('scheduled_at', { ascending: false });
    setInterviews(intData || []);
  }, [drawerCandidateId, currentUser]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const updateStage = async (candidacyId, newStage) => {
    const prev = candidacies.find(cc => cc.id === candidacyId);
    await sb.from('candidacies').update({ current_stage: newStage }).eq('id', candidacyId);
    if (prev && prev.current_stage !== newStage) {
      await sb.from('stage_history').insert({
        candidacy_id: candidacyId, from_stage: prev.current_stage,
        to_stage: newStage, changed_by: currentUser.id,
      });
    }
    addToast(`Этап → ${STAGE_LABELS[newStage] || newStage} ✓`);
    loadAll();
  };

  const addReminder = async (e) => {
    e.preventDefault();
    if (!remNote.trim()) return;
    const noteText = remTime && remDate ? `${remNote} (в ${remTime})` : remNote;
    const { error } = await sb.from('reminders').insert({
      recruiter_id: currentUser.id, candidate_id: drawerCandidateId,
      note: noteText, due_date: remDate || null, is_done: false,
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Напоминание добавлено ✓');
    setRemNote(''); setRemDate(''); setRemTime('');
    loadAll();
  };

  const doneReminder = async (id) => {
    await sb.from('reminders').update({ is_done: true }).eq('id', id);
    loadAll();
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const { error } = await sb.from('comments').insert({
      candidate_id: drawerCandidateId, recruiter_id: currentUser.id, content: comment.trim(),
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Комментарий добавлен ✓');
    setComment('');
    loadAll();
  };

  const addInterview = async (e) => {
    e.preventDefault();
    if (!intDate || !intTime) { addToast('Укажи дату и время', 'err'); return; }
    const scheduledAt = `${intDate}T${intTime}:00`;
    const { error } = await sb.from('interviews').insert({
      candidate_id: drawerCandidateId, recruiter_id: currentUser.id,
      scheduled_at: scheduledAt, interview_type: intType,
      notes: intNote.trim() || null, status: 'scheduled',
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Собеседование добавлено ✓');
    setIntDate(''); setIntTime(''); setIntNote(''); setIntType('phone');
    loadAll();
  };

  const updateStatus = async (status) => {
    await sb.from('candidates').update({ status }).eq('id', drawerCandidateId);
    setCandidate(c => ({ ...c, status }));
    onReload?.();
  };

  const togglePin = async () => {
    const next = !candidate?.is_pinned;
    await sb.from('candidates').update({ is_pinned: next }).eq('id', drawerCandidateId);
    setCandidate(c => ({ ...c, is_pinned: next }));
    onReload?.();
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    await sb.from('candidates').update(editForm).eq('id', drawerCandidateId);
    addToast('Сохранено ✓');
    setEditMode(false);
    loadAll();
    onReload?.();
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить «${candidate?.full_name}»?`)) return;
    await sb.from('candidates').delete().eq('id', drawerCandidateId);
    addToast('Кандидат удалён');
    handleClose();
    onReload?.();
  };

  if (!candidate) return null;

  const today = new Date(); today.setHours(0,0,0,0);
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const statusCls = STATUS_BADGE[candidate.status || 'active'] || 'badge-active';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/30 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-[70] w-full max-w-xl bg-white shadow-2xl flex flex-col transition-transform duration-300 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 text-lg truncate">{candidate.full_name}</h3>
            {candidate.position && <p className="text-sm text-slate-500">{candidate.position}</p>}
            <p className="text-xs text-slate-400">
              {candidate.created_at ? `Добавлен ${new Date(candidate.created_at).toLocaleDateString('ru-RU')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={togglePin} className="text-xl hover:scale-110 transition-transform">
              {candidate.is_pinned ? '⭐' : '☆'}
            </button>
            {canWrite && (
              <select value={candidate.status || 'active'} onChange={e => updateStatus(e.target.value)}
                className={`text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${statusCls}`}>
                <option value="active">Активный</option>
                <option value="in_work">В работе</option>
                <option value="archive">Архив</option>
              </select>
            )}
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-1">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2 overflow-x-auto">
          {[
            { id: 'info', label: 'Инфо' },
            { id: 'vacancies', label: '💼 Вакансии' },
            { id: 'reminders', label: '🔔 Напоминания' },
            { id: 'comments', label: '💬 Комменты' },
            { id: 'interviews', label: '🤝 Собесы' },
            { id: 'timeline', label: '🕐 История' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === t.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* INFO */}
          {activeTab === 'info' && (
            <>
              {editMode ? (
                <form onSubmit={saveEdit} className="space-y-3">
                  {[
                    ['full_name', 'Имя'], ['phone', 'Телефон'], ['email', 'Email'],
                    ['position', 'Должность'], ['experience', 'Опыт'],
                    ['district_residence', 'Р. проживания'], ['district_work', 'Р. работы'],
                    ['resume_source', 'Источник'], ['contact_status', 'Контакт-статус'],
                    ['candidate_link', 'Ссылка на профиль'], ['resume_url', 'Ссылка на резюме'],
                  ].map(([field, label]) => (
                    <div key={field}>
                      <label className="form-label">{label}</label>
                      <input className="input-field" value={editForm[field] || ''}
                        onChange={e => setEditForm(f => ({...f, [field]: e.target.value}))} />
                    </div>
                  ))}
                  <div>
                    <label className="form-label">Заметки</label>
                    <textarea className="input-field" rows={3} value={editForm.notes || ''}
                      onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary btn-sm">Сохранить</button>
                    <button type="button" onClick={() => setEditMode(false)} className="btn-secondary btn-sm">Отмена</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['📞 Телефон', candidate.phone],
                      ['✉️ Email', candidate.email],
                      ['🚗 Авто', candidate.has_car],
                      ['🏠 Р. проживания', candidate.district_residence],
                      ['🏢 Р. работы', candidate.district_work],
                      ['📋 Источник', candidate.resume_source],
                      ['📝 Опыт', candidate.experience],
                      ['💬 Контакт', candidate.contact_status],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="font-medium text-slate-700">{value || '—'}</p>
                      </div>
                    ))}
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(t => <span key={t} className="tag-chip">{t}</span>)}
                    </div>
                  )}

                  {(candidate.candidate_link || candidate.resume_url) && (
                    <div className="flex gap-3">
                      {candidate.candidate_link && (
                        <a href={candidate.candidate_link} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:underline text-sm">👤 Профиль</a>
                      )}
                      {candidate.resume_url && (
                        <a href={candidate.resume_url} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:underline text-sm">📎 Резюме</a>
                      )}
                    </div>
                  )}

                  {candidate.notes && (
                    <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 whitespace-pre-wrap">
                      {candidate.notes}
                    </div>
                  )}

                  {canWrite && (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button onClick={() => { setEditForm({ ...candidate }); setEditMode(true); }}
                        className="btn-secondary btn-sm">✏️ Редактировать</button>
                      <button onClick={handleDelete}
                        className="btn-secondary btn-sm text-red-400 hover:bg-red-50">🗑️ Удалить</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* VACANCIES */}
          {activeTab === 'vacancies' && (
            <div className="space-y-2">
              {candidacies.length === 0
                ? <p className="text-sm text-slate-400">Не привязан к вакансиям</p>
                : candidacies.map(cc => {
                  const v = cc.vacancies || {};
                  const stage = cc.current_stage || 'new';
                  return (
                    <div key={cc.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2 gap-2">
                      <span className="text-xs text-slate-700 font-medium truncate flex-1">
                        {v.title || 'Вакансия'}
                        {v.status === 'open'
                          ? <span className="ml-1 text-emerald-600">●</span>
                          : <span className="ml-1 text-slate-300">●</span>}
                      </span>
                      <select value={stage} onChange={e => updateStage(cc.id, e.target.value)}
                        className={`text-xs rounded-full px-2 py-0.5 border border-slate-200 font-semibold ${STAGE_COLORS[stage] || 'bg-slate-100 text-slate-600'} cursor-pointer focus:outline-none`}>
                        {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* REMINDERS */}
          {activeTab === 'reminders' && (
            <div className="space-y-3">
              {reminders.map(r => {
                const overdue = r.due_date && new Date(r.due_date) < today;
                return (
                  <div key={r.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${overdue ? 'border-red-200 bg-red-50' : 'border-indigo-100 bg-white'}`}>
                    <button onClick={() => doneReminder(r.id)}
                      className={`flex-shrink-0 w-4 h-4 rounded-full border ${overdue ? 'border-red-300' : 'border-indigo-300'} hover:bg-green-100 transition`} />
                    <span className={`flex-1 ${overdue ? 'text-red-700' : 'text-slate-700'}`}>{r.note}</span>
                    <span className={overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}>{fmtDay(r.due_date)}</span>
                  </div>
                );
              })}
              {canWrite && (
                <form onSubmit={addReminder} className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500">Добавить напоминание</h4>
                  <input className="input-field" placeholder="Заметка" value={remNote}
                    onChange={e => setRemNote(e.target.value)} required />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="input-field" value={remDate} onChange={e => setRemDate(e.target.value)} />
                    <input type="time" className="input-field" value={remTime} onChange={e => setRemTime(e.target.value)} />
                  </div>
                  <button type="submit" className="btn-primary btn-sm w-full justify-center">+ Добавить</button>
                </form>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {activeTab === 'comments' && (
            <div className="space-y-3">
              {comments.length === 0
                ? <p className="text-xs text-slate-400">Нет комментариев</p>
                : comments.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                      <span className="font-semibold text-slate-600">{c.profiles?.full_name || 'Рекрутер'}</span>
                      <span>{fmtDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{c.content}</p>
                  </div>
                ))
              }
              <form onSubmit={addComment} className="flex gap-2 pt-2 border-t border-slate-100">
                <input className="input-field flex-1" placeholder="Написать комментарий…" value={comment}
                  onChange={e => setComment(e.target.value)} required />
                <button type="submit" className="btn-primary btn-sm">→</button>
              </form>
            </div>
          )}

          {/* INTERVIEWS */}
          {activeTab === 'interviews' && (
            <div className="space-y-3">
              {interviews.map(iv => (
                <div key={iv.id} className={`card p-3 text-sm ${iv.status === 'done' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{iv.interview_type === 'phone' ? '📞' : iv.interview_type === 'video' ? '🎥' : '🏢'} {new Date(iv.scheduled_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${iv.status === 'done' ? 'bg-green-100 text-green-700' : iv.status === 'cancelled' ? 'bg-red-100 text-red-500' : 'bg-indigo-100 text-indigo-700'}`}>
                      {iv.status === 'done' ? 'Проведён' : iv.status === 'cancelled' ? 'Отменён' : 'Запланирован'}
                    </span>
                  </div>
                  {iv.notes && <p className="text-xs text-slate-500">{iv.notes}</p>}
                  {iv.status === 'scheduled' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={async () => {
                        await sb.from('interviews').update({ status: 'done' }).eq('id', iv.id);
                        addToast('Собеседование проведено ✓');
                        loadAll();
                      }} className="btn-sm btn-secondary text-green-600">✓ Проведён</button>
                      <button onClick={async () => {
                        await sb.from('interviews').update({ status: 'cancelled' }).eq('id', iv.id);
                        loadAll();
                      }} className="btn-sm btn-secondary text-red-400">✕ Отменить</button>
                    </div>
                  )}
                </div>
              ))}
              {canWrite && (
                <form onSubmit={addInterview} className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500">Запланировать собеседование</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="input-field" value={intDate} onChange={e => setIntDate(e.target.value)} required />
                    <input type="time" className="input-field" value={intTime} onChange={e => setIntTime(e.target.value)} required />
                  </div>
                  <select className="input-field" value={intType} onChange={e => setIntType(e.target.value)}>
                    <option value="phone">📞 Звонок</option>
                    <option value="video">🎥 Видео</option>
                    <option value="office">🏢 Офис</option>
                  </select>
                  <input className="input-field" placeholder="Заметка" value={intNote} onChange={e => setIntNote(e.target.value)} />
                  <button type="submit" className="btn-primary btn-sm w-full justify-center">+ Добавить</button>
                </form>
              )}
            </div>
          )}

          {/* TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {timeline.length === 0
                ? <p className="text-xs text-slate-400">Нет активности</p>
                : timeline.map((e, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full ${e.color} flex items-center justify-center text-xs leading-none`}>
                      {e.icon}
                    </div>
                    <div className="flex-1 min-w-0 pb-2 border-b border-slate-50">
                      <p className="text-xs text-slate-700 leading-snug break-words">{e.text}</p>
                      {e.sub && <p className="text-xs text-slate-400 mt-0.5">{e.sub}</p>}
                      <p className="text-xs text-slate-300 mt-0.5">{fmtDate(e.ts)}</p>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </>
  );
}
