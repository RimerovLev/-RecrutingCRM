import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { useI18n } from '@/hooks/useI18n';
import { useOrgFields } from '@/hooks/useOrgFields';
import { STAGES, STAGE_LABELS, STAGE_COLORS, STATUS_BADGE } from '@/lib/config';
import { isMissingTableError } from '@/lib/apiErrors';

function fmtDate(d, locale = 'ru-RU') {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDay(d, locale = 'ru-RU') {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale);
}

export default function CandidateDrawer({ onReload }) {
  const drawerCandidateId = useStore(s => s.drawerCandidateId);
  const closeDrawer       = useStore(s => s.closeDrawer);
  // allCandidates read via getState() inside loadAll to avoid subscription
  const currentUserId     = useStore(s => s.currentUserId);
  const currentOrgId      = useStore(s => s.currentOrgId);
  const addToast          = useStore(s => s.addToast);
  const canWrite             = useCanWrite();
  const { t, isRTL }         = useI18n();
  const { visibleFields }    = useOrgFields();
  const [visible, setVisible] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);

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
    if (!drawerCandidateId || !currentUserId) return;

    // Try local store first
    const local = useStore.getState().allCandidates.find(c => c.id === drawerCandidateId);
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
    const locale = isRTL ? 'he-IL' : 'ru-RU';
    if (c?.created_at) events.push({ ts: c.created_at, icon: '👤', color: 'bg-indigo-100', text: t('drawer.candidateAdded') });
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
      events.push({ ts: r.created_at, icon: r.is_done ? '✅' : '⏰', color: r.is_done ? 'bg-green-100' : 'bg-yellow-100', text: r.note, sub: r.due_date ? `${t('drawer.dueDate')} ${fmtDay(r.due_date, locale)}` : null });
    });
    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    setTimeline(events);

    // Interviews
    const { data: intData, error: intErr } = await sb.from('interviews')
      .select('*').eq('candidate_id', drawerCandidateId).order('scheduled_at', { ascending: false });
      setInterviews(intErr && isMissingTableError(intErr, 'interviews') ? [] : (intData || []));
  }, [drawerCandidateId, currentUserId]);

  useEffect(() => { loadAll(); }, [drawerCandidateId, currentUserId]);

  const updateStage = async (candidacyId, newStage) => {
    const prev = candidacies.find(cc => cc.id === candidacyId);
    await sb.from('candidacies').update({ current_stage: newStage }).eq('id', candidacyId);
    if (prev && prev.current_stage !== newStage) {
      await sb.from('stage_history').insert({
        candidacy_id: candidacyId, from_stage: prev.current_stage,
        to_stage: newStage, changed_by: currentUserId,
      });
    }
    addToast(`${t('drawer.stage')} → ${STAGE_LABELS[newStage] || newStage} ✓`);
    loadAll();
  };

  const addReminder = async (e) => {
    e.preventDefault();
    if (!remNote.trim()) return;
    const noteText = remTime && remDate ? `${remNote} (в ${remTime})` : remNote;
    const { error } = await sb.from('reminders').insert({
      recruiter_id: currentUserId, candidate_id: drawerCandidateId,
      note: noteText, due_date: remDate || null, is_done: false,
    });
    if (error) { addToast(t('common.error') + ': ' + error.message, 'err'); return; }
    addToast(t('reminders.toastSaved') + ' ✓');
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
      candidate_id: drawerCandidateId, recruiter_id: currentUserId, content: comment.trim(),
    });
    if (error) { addToast(t('common.error') + ': ' + error.message, 'err'); return; }
    addToast(t('drawer.addComment') + ' ✓');
    setComment('');
    loadAll();
  };

  const addInterview = async (e) => {
    e.preventDefault();
    if (!intDate || !intTime) { addToast(t('common.error'), 'err'); return; }
    const scheduledAt = `${intDate}T${intTime}:00`;
    const { error } = await sb.from('interviews').insert({
      candidate_id: drawerCandidateId, recruiter_id: currentUserId,
      scheduled_at: scheduledAt, format: intType,
      notes: intNote.trim() || null, status: 'scheduled',
    });
    if (error) { addToast(t('common.error') + ': ' + error.message, 'err'); return; }
    addToast(t('interviews.toastSaved') + ' ✓');
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

  const handleResumeUpload = async (file) => {
    if (!file) return;
    setResumeUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `${currentOrgId || 'shared'}/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
    const { error } = await sb.storage.from('resumes').upload(path, file, { upsert: true });
    if (error) {
      addToast(t('common.error') + ': ' + error.message, 'err');
    } else {
      const { data: { publicUrl } } = sb.storage.from('resumes').getPublicUrl(path);
      setEditForm(prev => ({ ...prev, resume_url: publicUrl }));
      addToast('Резюме загружено ✓');
    }
    setResumeUploading(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    // Merge custom_data from editForm, keep other candidate fields intact
    const payload = { ...editForm };
    await sb.from('candidates').update(payload).eq('id', drawerCandidateId);
    addToast(t('candidates.toastSaved') + ' ✓');
    setEditMode(false);
    loadAll();
    onReload?.();
  };

  const handleDelete = async () => {
    if (!confirm(`${t('candidates.confirmDelete')} «${candidate?.full_name}»?`)) return;
    await sb.from('candidates').delete().eq('id', drawerCandidateId);
    addToast(t('candidates.toastDeleted'));
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
              {candidate.created_at ? `${t('drawer.createdAt')} ${new Date(candidate.created_at).toLocaleDateString(isRTL ? 'he-IL' : 'ru-RU')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={togglePin} className="text-xl hover:scale-110 transition-transform">
              {candidate.is_pinned ? '⭐' : '☆'}
            </button>
            {canWrite && (
              <select value={candidate.status || 'active'} onChange={e => updateStatus(e.target.value)}
                className={`text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${statusCls}`}>
                <option value="active">{t('status.active')}</option>
                <option value="in_work">{t('status.in_work')}</option>
                <option value="archive">{t('status.archive')}</option>
              </select>
            )}
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-1">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2 overflow-x-auto">
          {[
            { id: 'info',       label: t('drawer.tabInfo') },
            { id: 'vacancies',  label: '💼 ' + t('nav.vacancies') },
            { id: 'reminders',  label: '🔔 ' + t('drawer.tabReminders') },
            { id: 'comments',   label: '💬 ' + t('drawer.tabComments') },
            { id: 'interviews', label: '🤝 ' + t('drawer.tabInterviews') },
            { id: 'timeline',   label: '🕐 ' + t('drawer.tabTimeline') },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {tab.label}
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
                  {/* Render edit fields driven by org field config */}
                  {visibleFields
                    .filter(f => f.key !== 'notes') /* notes rendered separately */
                    .map(f => {
                      const isCustom = !f.system;
                      const value = isCustom
                        ? (editForm.custom_data?.[f.key] ?? '')
                        : (editForm[f.key] ?? '');
                      const onChange = isCustom
                        ? e => setEditForm(prev => ({
                            ...prev,
                            custom_data: { ...(prev.custom_data || {}), [f.key]: e.target.value },
                          }))
                        : e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }));
                      return (
                        <div key={f.key}>
                          <label className="form-label">{f.label}{f.required && ' *'}</label>
                          {f.type === 'boolean' ? (
                            <select className="input-field" value={String(value)} onChange={e => onChange({ target: { value: e.target.value === 'true' } })}>
                              <option value="">—</option>
                              <option value="true">{t('common.yes')}</option>
                              <option value="false">{t('common.no')}</option>
                            </select>
                          ) : f.key === 'resume_url' ? (
                            <div className="space-y-1.5">
                              <input className="input-field" type="text" placeholder="https://…"
                                value={value} onChange={onChange} />
                              <label className={`btn-secondary btn-sm cursor-pointer inline-flex items-center gap-1 ${resumeUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                {resumeUploading ? '⏳ …' : '📎 Загрузить PDF/DOCX'}
                                <input type="file" accept=".pdf,.docx,.doc" className="hidden"
                                  onChange={ev => { if (ev.target.files?.[0]) handleResumeUpload(ev.target.files[0]); }} />
                              </label>
                            </div>
                          ) : (
                            <input className="input-field" type={f.type === 'number' ? 'number' : 'text'}
                              value={value} onChange={onChange} />
                          )}
                        </div>
                      );
                    })}
                  {/* Notes always at bottom */}
                  {visibleFields.find(f => f.key === 'notes') && (
                    <div>
                      <label className="form-label">{visibleFields.find(f => f.key === 'notes').label}</label>
                      <textarea className="input-field" rows={3} value={editForm.notes || ''}
                        onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary btn-sm">{t('drawer.saveBtn')}</button>
                    <button type="button" onClick={() => setEditMode(false)} className="btn-secondary btn-sm">{t('drawer.cancelBtn')}</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Read-only info grid — only visible, non-notes fields */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {visibleFields
                      .filter(f => !['notes', 'candidate_link', 'resume_url'].includes(f.key))
                      .map(f => {
                        const isCustom = !f.system;
                        const raw = isCustom
                          ? candidate.custom_data?.[f.key]
                          : candidate[f.key];
                        const display = f.type === 'boolean'
                          ? (raw === true || raw === 'true' ? t('common.yes') : raw === false || raw === 'false' ? t('common.no') : '—')
                          : (raw || '—');
                        return (
                          <div key={f.key}>
                            <p className="text-xs text-slate-400">{f.label}</p>
                            <p className="font-medium text-slate-700">{display}</p>
                          </div>
                        );
                      })}
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
                    </div>
                  )}

                  {(candidate.candidate_link || candidate.resume_url) && (
                    <div className="flex gap-3">
                      {candidate.candidate_link && (
                        <a href={candidate.candidate_link} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:underline text-sm">{t('drawer.profileLink')}</a>
                      )}
                      {candidate.resume_url && (
                        <a href={candidate.resume_url} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:underline text-sm">{t('drawer.resumeLink')}</a>
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
                      <button onClick={() => { setEditForm({ ...candidate, custom_data: candidate.custom_data || {} }); setEditMode(true); }}
                        className="btn-secondary btn-sm">{t('drawer.editBtn')}</button>
                      <button onClick={handleDelete}
                        className="btn-secondary btn-sm text-red-400 hover:bg-red-50">{t('drawer.deleteBtn')}</button>
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
                ? <p className="text-sm text-slate-400">{t('drawer.noVacancies')}</p>
                : candidacies.map(cc => {
                  const v = cc.vacancies || {};
                  const stage = cc.current_stage || 'new';
                  return (
                    <div key={cc.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2 gap-2">
                      <span className="text-xs text-slate-700 font-medium truncate flex-1">
                        {v.title || t('drawer.vacancy')}
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
                    <span className={overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}>{fmtDay(r.due_date, isRTL ? 'he-IL' : 'ru-RU')}</span>
                  </div>
                );
              })}
              {canWrite && (
                <form onSubmit={addReminder} className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500">{t('drawer.reminderFormTitle')}</h4>
                  <input className="input-field" placeholder={t('drawer.reminderNotePh')} value={remNote}
                    onChange={e => setRemNote(e.target.value)} required />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="input-field" value={remDate} onChange={e => setRemDate(e.target.value)} />
                    <input type="time" className="input-field" value={remTime} onChange={e => setRemTime(e.target.value)} />
                  </div>
                  <button type="submit" className="btn-primary btn-sm w-full justify-center">{t('drawer.addReminder')}</button>
                </form>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {activeTab === 'comments' && (
            <div className="space-y-3">
              {comments.length === 0
                ? <p className="text-xs text-slate-400">{t('drawer.noComments')}</p>
                : comments.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                      <span className="font-semibold text-slate-600">{c.profiles?.full_name || t('drawer.recruiter')}</span>
                      <span>{fmtDate(c.created_at, isRTL ? 'he-IL' : 'ru-RU')}</span>
                    </div>
                    <p className="text-sm text-slate-700">{c.content}</p>
                  </div>
                ))
              }
              <form onSubmit={addComment} className="flex gap-2 pt-2 border-t border-slate-100">
                <input className="input-field flex-1" placeholder={t('drawer.commentPh')} value={comment}
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
                    <span className="font-semibold">{iv.format === 'phone' ? '📞' : iv.format === 'online' ? '🎥' : '🏢'} {new Date(iv.scheduled_at).toLocaleString(isRTL ? 'he-IL' : 'ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${iv.status === 'done' ? 'bg-green-100 text-green-700' : iv.status === 'cancelled' ? 'bg-red-100 text-red-500' : 'bg-indigo-100 text-indigo-700'}`}>
                      {iv.status === 'done' ? t('interviews.statusDone') : iv.status === 'cancelled' ? t('interviews.statusCancelled') : t('interviews.statusPlanned')}
                    </span>
                  </div>
                  {iv.notes && <p className="text-xs text-slate-500">{iv.notes}</p>}
                  {iv.status === 'scheduled' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={async () => {
                        await sb.from('interviews').update({ status: 'done' }).eq('id', iv.id);
                        addToast(t('drawer.interviewDone') + ' ✓');
                        loadAll();
                      }} className="btn-sm btn-secondary text-green-600">{t('drawer.markDone')}</button>
                      <button onClick={async () => {
                        await sb.from('interviews').update({ status: 'cancelled' }).eq('id', iv.id);
                        loadAll();
                      }} className="btn-sm btn-secondary text-red-400">{t('drawer.markCancel')}</button>
                    </div>
                  )}
                </div>
              ))}
              {canWrite && (
                <form onSubmit={addInterview} className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500">{t('drawer.interviewFormTitle')}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="input-field" value={intDate} onChange={e => setIntDate(e.target.value)} required />
                    <input type="time" className="input-field" value={intTime} onChange={e => setIntTime(e.target.value)} required />
                  </div>
                  <select className="input-field" value={intType} onChange={e => setIntType(e.target.value)}>
                    <option value="phone">📞 {t('interviews.formatPhone')}</option>
                    <option value="online">🎥 {t('interviews.formatOnline')}</option>
                    <option value="office">🏢 {t('interviews.formatOffice')}</option>
                  </select>
                  <input className="input-field" placeholder={t('drawer.reminderNotePh')} value={intNote} onChange={e => setIntNote(e.target.value)} />
                  <button type="submit" className="btn-primary btn-sm w-full justify-center">{t('drawer.addInterview')}</button>
                </form>
              )}
            </div>
          )}

          {/* TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {timeline.length === 0
                ? <p className="text-xs text-slate-400">{t('drawer.noTimeline')}</p>
                : timeline.map((e, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full ${e.color} flex items-center justify-center text-xs leading-none`}>
                      {e.icon}
                    </div>
                    <div className="flex-1 min-w-0 pb-2 border-b border-slate-50">
                      <p className="text-xs text-slate-700 leading-snug break-words">{e.text}</p>
                      {e.sub && <p className="text-xs text-slate-400 mt-0.5">{e.sub}</p>}
                      <p className="text-xs text-slate-300 mt-0.5">{fmtDate(e.ts, isRTL ? 'he-IL' : 'ru-RU')}</p>
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
