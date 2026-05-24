import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { useI18n } from '@/hooks/useI18n';
import { cacheSet, cacheGet, LS } from '@/hooks/useOffline';
import Modal from '@/components/common/Modal';

function fmtDay(d) {
  if (!d) return '—';
  const dt = new Date(d);
  // Если в строке есть время (не полночь) — показываем и время
  const hasTime = d.includes('T') && !d.endsWith('T00:00:00');
  if (hasTime) {
    return dt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString('ru-RU');
}

export default function RemindersPage() {
  const currentUserId = useStore(s => s.currentUserId);
  const currentOrgId  = useStore(s => s.currentOrgId);
  const addToast    = useStore(s => s.addToast);
  const canWrite    = useCanWrite();
  const { t }       = useI18n();

  const [reminders, setReminders]   = useState([]);
  const [hideDone, setHideDone]     = useState(false);
  const [sortDir, setSortDir]       = useState('asc');
  const [modalOpen, setModalOpen]   = useState(false);
  const [remNote, setRemNote]       = useState('');
  const [remDate, setRemDate]       = useState('');
  const [remTime, setRemTime]       = useState('10:00');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('reminders')
      .select('*, candidates(full_name)')
      .order('created_at', { ascending: true });
    if (error) {
      const cached = cacheGet(LS.reminders) || [];
      setReminders(cached);
    } else {
      cacheSet(LS.reminders, data || []);
      setReminders(data || []);
    }
  }, []);

  useEffect(() => { if (currentOrgId) load(); }, [currentOrgId]);

  const displayList = (() => {
    let list = hideDone ? reminders.filter(r => !r.is_done) : [...reminders];
    if (sortDir !== 'none') {
      const asc = sortDir === 'asc';
      list.sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date) : (asc ? new Date('9999-12-31') : new Date(0));
        const db = b.due_date ? new Date(b.due_date) : (asc ? new Date('9999-12-31') : new Date(0));
        return asc ? da - db : db - da;
      });
    }
    return list;
  })();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canWrite) { addToast(t('common.error'), 'err'); return; }
    if (!remNote.trim()) { addToast(t('common.error'), 'err'); return; }

    // Объединяем дату и время в один timestamp, если оба заполнены
    let dueDate = null;
    if (remDate) {
      dueDate = remTime ? `${remDate}T${remTime}:00` : remDate;
    }

    const { error } = await sb.from('reminders').insert({
      recruiter_id: currentUserId,
      org_id: currentOrgId,
      note: remNote.trim(),
      due_date: dueDate,
      is_done: false,
    });
    if (error) { addToast(t('common.error') + ': ' + error.message, 'err'); return; }
    addToast(t('reminders.toastSaved') + ' ✓');
    setModalOpen(false);
    setRemNote(''); setRemDate(''); setRemTime('10:00');
    load();
  };

  const toggleReminder = async (id, isDone) => {
    await sb.from('reminders').update({ is_done: !isDone }).eq('id', id);
    load();
  };

  const deleteReminder = async (id) => {
    await sb.from('reminders').delete().eq('id', id);
    load();
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const activeCount = reminders.filter(r => !r.is_done).length;

  const renderItem = (r) => {
    const overdue = !r.is_done && r.due_date && new Date(r.due_date) < today;
    return (
      <div key={r.id} className={`card p-4 flex items-center gap-4 ${r.is_done ? 'opacity-55' : ''}`}>
        <button
          onClick={() => toggleReminder(r.id, r.is_done)}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
            r.is_done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-400'
          }`}
        >
          {r.is_done && '✓'}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-slate-800 ${r.is_done ? 'line-through text-slate-400' : ''}`}>{r.note}</p>
          {r.candidates && (
            <p className="text-xs text-slate-500 mt-0.5">👤 {r.candidates.full_name}</p>
          )}
        </div>
        <div className={`text-sm whitespace-nowrap ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
          {fmtDay(r.due_date)} {overdue && '⚠️'}
        </div>
        <button onClick={() => deleteReminder(r.id)}
          className="text-slate-300 hover:text-red-400 transition text-lg leading-none">×</button>
      </div>
    );
  };

  const activeList = displayList.filter(r => !r.is_done);
  const doneList   = displayList.filter(r =>  r.is_done);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="page-title mb-0">
          {t('reminders.title')}
          {activeCount > 0 && (
            <span className="ml-2 bg-indigo-500 text-white text-xs rounded-full px-2 py-0.5">
              {activeCount}
            </span>
          )}
        </h2>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Sort buttons */}
          <div className="flex gap-1">
            {[['asc', t('reminders.sortAsc')], ['desc', t('reminders.sortDesc')], ['none', '≡']].map(([dir, label]) => (
              <button key={dir} onClick={() => setSortDir(dir)}
                className={`rem-sort-btn btn-sm text-xs border rounded-lg px-2 py-1 ${sortDir === dir ? 'active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="rounded" />
            {t('reminders.hideDone')}
          </label>
          {canWrite && (
            <button onClick={() => setModalOpen(true)} className="btn-primary">{t('reminders.addBtn')}</button>
          )}
        </div>
      </div>

      {/* List */}
      {displayList.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-3">🔔</p>
          <p className="font-semibold">{t('reminders.noReminders')}</p>
        </div>
      ) : sortDir !== 'none' ? (
        <div className="space-y-3">{displayList.map(renderItem)}</div>
      ) : (
        <>
          {activeList.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('reminders.sectionActive')}</h4>
              <div className="space-y-3">{activeList.map(renderItem)}</div>
            </div>
          )}
          {doneList.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t('reminders.sectionDone')}</h4>
              <div className="space-y-3">{doneList.map(renderItem)}</div>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('reminders.formTitle')}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="form-label">{t('reminders.fieldNote')}</label>
            <input className="input-field" value={remNote} onChange={e => setRemNote(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('reminders.fieldDate')}</label>
              <input type="date" className="input-field" value={remDate} onChange={e => setRemDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">{t('reminders.fieldTime')}</label>
              <input type="time" className="input-field" value={remTime} onChange={e => setRemTime(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5">💾 {t('common.save')}</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary px-6">{t('common.cancel')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
