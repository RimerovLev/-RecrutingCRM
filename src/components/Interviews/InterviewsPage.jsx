import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import Modal from '@/components/common/Modal';

const TYPE_ICON  = { phone: '📞', online: '🎥', office: '🏢' };
const TYPE_LABEL = { phone: 'Звонок', online: 'Видео', office: 'Офис' };
const STATUS_BADGE = {
  scheduled: 'bg-blue-100 text-blue-700',
  done:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { scheduled: 'Запланировано', done: 'Проведено', cancelled: 'Отменено' };

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

export default function InterviewsPage() {
  const currentUserId = useStore(s => s.currentUserId);
  const addToast    = useStore(s => s.addToast);
  const openDrawer  = useStore(s => s.openDrawer);
  const canWrite    = useCanWrite();

  const [interviews, setInterviews]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [viewMode, setViewMode]         = useState('list'); // 'list' | 'calendar'
  const [filterStatus, setFilterStatus] = useState('scheduled');
  const [weekOffset, setWeekOffset]     = useState(0);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candSearch, setCandSearch] = useState('');
  const [form, setForm] = useState({
    candidate_id: '', date: '', time: '10:00',
    format: 'phone', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('interviews')
      .select('*, candidates(id, full_name, email, phone)')
      .eq('recruiter_id', currentUserId)
      .order('scheduled_at', { ascending: true });
    if (error) { addToast('Ошибка загрузки', 'err'); }
    else setInterviews(data || []);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { if (currentUserId) load(); }, [currentUserId]);

  const loadCandidates = useCallback(async () => {
    const { data } = await sb.from('candidates')
      .select('id, full_name, email')
      .eq('recruiter_id', currentUserId)
      .neq('status', 'archive')
      .order('full_name');
    setCandidates(data || []);
  }, [currentUserId]);

  const openCreate = () => {
    loadCandidates();
    setForm({ candidate_id: '', date: '', time: '10:00', format: 'phone', notes: '' });
    setCandSearch('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.candidate_id) { addToast('Выбери кандидата', 'err'); return; }
    if (!form.date || !form.time) { addToast('Укажи дату и время', 'err'); return; }

    // Build UTC timestamp from local date+time (fix: без этого браузер трактует как UTC → сдвиг на +3)
    const [year, month, day] = form.date.split('-').map(Number);
    const [hours, minutes]   = form.time.split(':').map(Number);
    const localDt = new Date(year, month - 1, day, hours, minutes, 0);
    const scheduledAt = localDt.toISOString();

    // Проверка конфликта: нельзя поставить двух кандидатов на одно и то же время
    const conflict = interviews.find(iv => {
      if (iv.status === 'cancelled') return false;
      return new Date(iv.scheduled_at).getTime() === localDt.getTime();
    });
    if (conflict) {
      const name = conflict.candidates?.full_name || 'другой кандидат';
      addToast(`В ${form.time} уже запланировано: ${name}`, 'err');
      return;
    }

    const { error } = await sb.from('interviews').insert({
      candidate_id: form.candidate_id,
      recruiter_id: currentUserId,
      scheduled_at: scheduledAt,
      format: form.format,
      notes: form.notes.trim() || null,
      status: 'scheduled',
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Собеседование создано ✓');
    setModalOpen(false);
    load();
  };

  const setStatus = async (id, status) => {
    const { error } = await sb.from('interviews').update({ status }).eq('id', id);
    if (error) { addToast('Ошибка', 'err'); return; }
    addToast(status === 'done' ? 'Отмечено как проведено ✓' : 'Отменено');
    load();
  };

  const deleteInterview = async (id) => {
    await sb.from('interviews').delete().eq('id', id);
    addToast('Удалено');
    load();
  };

  // ── Calendar logic ──────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const filteredList = filterStatus === 'all'
    ? interviews
    : interviews.filter(iv => iv.status === filterStatus);

  const filteredCandidates = candSearch
    ? candidates.filter(c =>
        c.full_name.toLowerCase().includes(candSearch.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(candSearch.toLowerCase()))
    : candidates;

  const todayCount     = interviews.filter(iv => iv.status === 'scheduled' && isSameDay(iv.scheduled_at, today)).length;
  const scheduledCount = interviews.filter(iv => iv.status === 'scheduled').length;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="page-title mb-0">
            Интервью
            {scheduledCount > 0 && (
              <span className="ml-2 bg-purple-500 text-white text-xs rounded-full px-2 py-0.5">
                {scheduledCount}
              </span>
            )}
          </h2>
          {todayCount > 0 && (
            <p className="text-sm text-purple-600 font-medium mt-0.5">
              🤝 Сегодня {todayCount} собеседование{todayCount > 1 ? 'я' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[['list', '☰ Список'], ['calendar', '📅 Неделя']].map(([m, l]) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-xs px-3 py-1 rounded-md font-semibold transition ${viewMode === m ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                {l}
              </button>
            ))}
          </div>
          {canWrite && (
            <button onClick={openCreate} className="btn-primary">+ Интервью</button>
          )}
        </div>
      </div>

      {/* Status filter (list mode) */}
      {viewMode === 'list' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {[['scheduled', '📅 Запланировано'], ['done', '✅ Проведено'], ['cancelled', '❌ Отменено'], ['all', 'Все']].map(([s, l]) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${filterStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── List view ───────────────────────────────────────────── */}
      {viewMode === 'list' && (
        loading ? (
          <div className="card p-10 text-center text-slate-400">Загрузка…</div>
        ) : filteredList.length === 0 ? (
          <div className="card p-10 text-center text-slate-400">
            <p className="text-4xl mb-3">🤝</p>
            <p className="font-semibold">Нет интервью</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredList.map(iv => {
              const c = iv.candidates || {};
              const isPast = new Date(iv.scheduled_at) < new Date() && iv.status === 'scheduled';
              return (
                <div key={iv.id} className={`card p-4 flex items-start gap-4 ${iv.status !== 'scheduled' ? 'opacity-70' : ''}`}>
                  <div className="flex-shrink-0 text-2xl pt-0.5">{TYPE_ICON[iv.format] || '🤝'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openDrawer(c.id)} className="font-semibold text-slate-800 hover:text-indigo-600 transition">
                        {c.full_name || '—'}
                      </button>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[iv.status] || ''}`}>
                        {STATUS_LABEL[iv.status] || iv.status}
                      </span>
                      <span className="text-xs text-slate-400">{TYPE_LABEL[iv.format] || iv.format}</span>
                      {isPast && <span className="text-xs text-red-500 font-semibold">⚠️ Не отмечено</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      📅 {fmtDate(iv.scheduled_at)} в {fmtTime(iv.scheduled_at)}
                    </p>
                    {iv.notes && <p className="text-xs text-slate-400 mt-1 italic">{iv.notes}</p>}
                    {c.phone && <p className="text-xs text-slate-400 mt-0.5">☎ {c.phone}</p>}
                  </div>
                  {iv.status === 'scheduled' && canWrite && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => setStatus(iv.id, 'done')}
                        className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg transition">
                        ✓ Провели
                      </button>
                      <button onClick={() => setStatus(iv.id, 'cancelled')}
                        className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1 rounded-lg transition">
                        × Отмена
                      </button>
                    </div>
                  )}
                  {canWrite && (
                    <button onClick={() => deleteInterview(iv.id)}
                      className="text-slate-300 hover:text-red-400 transition text-lg leading-none shrink-0 ml-1">×</button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Calendar view ────────────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <div className="card overflow-hidden">
          {/* Week nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <button onClick={() => setWeekOffset(w => w - 1)} className="btn-secondary btn-sm">← Пред.</button>
            <span className="text-sm font-semibold text-slate-700">
              {weekDays[0].toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })} —{' '}
              {weekDays[6].toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setWeekOffset(0)} className="btn-secondary btn-sm text-xs">Сегодня</button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary btn-sm">След. →</button>
            </div>
          </div>

          {/* Day columns */}
          <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-64">
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, today);
              const dayIvs = interviews.filter(iv =>
                isSameDay(iv.scheduled_at, day) && iv.status !== 'cancelled'
              );
              return (
                <div key={i} className={`flex flex-col ${isToday ? 'bg-indigo-50' : 'bg-white'}`}>
                  <div className={`text-center py-2 border-b border-slate-100 ${isToday ? 'bg-indigo-600 text-white' : ''}`}>
                    <p className="text-xs font-semibold">{DAY_NAMES[day.getDay()]}</p>
                    <p className={`text-lg font-black ${isToday ? 'text-white' : 'text-slate-700'}`}>{day.getDate()}</p>
                  </div>
                  <div className="flex flex-col gap-1 p-1 flex-1">
                    {dayIvs.length === 0 && (
                      <p className="text-xs text-slate-300 text-center mt-3">—</p>
                    )}
                    {dayIvs.map(iv => {
                      const c = iv.candidates || {};
                      return (
                        <button
                          key={iv.id}
                          onClick={() => c.id && openDrawer(c.id)}
                          className={`text-left rounded-lg px-2 py-1.5 text-xs leading-tight w-full transition hover:opacity-80 ${
                            iv.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          <div className="font-semibold truncate">{c.full_name || '—'}</div>
                          <div className="text-xs opacity-70">{TYPE_ICON[iv.format]} {fmtTime(iv.scheduled_at)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Create modal ─────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Создать интервью">
        <form onSubmit={handleSave} className="space-y-4">
          {/* Candidate search */}
          <div>
            <label className="form-label">Кандидат *</label>
            <input
              className="input-field mb-2"
              placeholder="Поиск кандидата…"
              value={candSearch}
              onChange={e => { setCandSearch(e.target.value); setForm(f => ({ ...f, candidate_id: '' })); }}
            />
            {form.candidate_id ? (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <span className="text-sm font-semibold text-indigo-800">
                  ✓ {candidates.find(c => c.id === form.candidate_id)?.full_name}
                </span>
                <button type="button" onClick={() => { setForm(f => ({ ...f, candidate_id: '' })); setCandSearch(''); }}
                  className="ml-auto text-indigo-400 hover:text-indigo-600 text-xs">✕</button>
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-0.5 border border-slate-200 rounded-lg">
                {filteredCandidates.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Нет кандидатов</p>
                ) : filteredCandidates.map(c => (
                  <button type="button" key={c.id}
                    onClick={() => { setForm(f => ({ ...f, candidate_id: c.id })); setCandSearch(c.full_name); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition">
                    <span className="font-semibold text-slate-800">{c.full_name}</span>
                    {c.email && <span className="text-xs text-slate-400 ml-2">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Дата *</label>
              <input type="date" className="input-field" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div>
              <label className="form-label">Время *</label>
              <input type="time" className="input-field" value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))} required />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="form-label">Формат</label>
            <div className="flex gap-2">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <button type="button" key={k}
                  onClick={() => setForm(f => ({ ...f, format: k }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition ${
                    form.format === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                  }`}>
                  {TYPE_ICON[k]} {v}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Заметки</label>
            <textarea className="input-field" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ссылка на meet, адрес офиса…" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5">💾 Сохранить</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary px-6">Отмена</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
