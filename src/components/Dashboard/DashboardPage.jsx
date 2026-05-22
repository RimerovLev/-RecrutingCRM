import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { STAGES, STAGE_LABELS } from '@/lib/config';

function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const STAGE_BAR_COLORS = {
  new:'#94a3b8', resume:'#3b82f6', phone:'#f59e0b',
  interview:'#8b5cf6', offer:'#10b981', rejected:'#ef4444',
};

function calcAvgInterviewDays(history) {
  const byCcy = {};
  history.forEach(h => { (byCcy[h.candidacy_id] ||= []).push(h); });
  let total = 0, cnt = 0;
  Object.values(byCcy).forEach(evs => {
    evs.sort((a,b) => new Date(a.changed_at) - new Date(b.changed_at));
    let enterAt = null;
    for (const e of evs) {
      if (e.to_stage === 'interview') enterAt = new Date(e.changed_at);
      else if (enterAt && e.from_stage === 'interview') {
        total += (new Date(e.changed_at) - enterAt) / 86400000;
        cnt++; enterAt = null;
      }
    }
  });
  return cnt > 0 ? total / cnt : null;
}

function FunnelChart({ stageCounts }) {
  const funnelStages = STAGES.filter(s => s !== 'rejected');
  const maxCount = Math.max(1, ...funnelStages.map(s => stageCounts[s] || 0));
  const rejCount = stageCounts['rejected'] || 0;

  return (
    <div className="space-y-2">
      {funnelStages.map((stage, i) => {
        const count = stageCounts[stage] || 0;
        const prev  = i > 0 ? (stageCounts[funnelStages[i-1]] || 0) : count;
        const conv  = (i > 0 && prev > 0) ? Math.round(count / prev * 100) : null;
        const barPct = Math.round(count / maxCount * 100);
        return (
          <div key={stage} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20 shrink-0 text-right">{STAGE_LABELS[stage]}</span>
            <div className="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
              <div className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${barPct}%`, background: STAGE_BAR_COLORS[stage] }} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
                {count}
              </span>
            </div>
            <span className={`text-xs w-10 text-right shrink-0 text-slate-400 ${conv == null ? 'invisible' : ''}`}>
              {conv != null ? `${conv}%` : ''}
            </span>
          </div>
        );
      })}
      <div className="border-t border-slate-100 pt-2 mt-1 flex items-center gap-2">
        <span className="text-xs text-slate-500 w-20 shrink-0 text-right">{STAGE_LABELS['rejected']}</span>
        <div className="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
          <div className="h-full rounded-lg transition-all duration-500 bg-red-400"
            style={{ width: `${Math.round(rejCount / maxCount * 100)}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">{rejCount}</span>
        </div>
        <span className="text-xs w-10 shrink-0" />
      </div>
      <p className="text-xs text-slate-400 mt-1 text-right">% — конверсия от предыдущего этапа</p>
    </div>
  );
}

export default function DashboardPage() {
  const currentUser   = useStore(s => s.currentUser);
  const addToast      = useStore(s => s.addToast);
  const setActiveView = useStore(s => s.setActiveView);
  const allCandidates = useStore(s => s.allCandidates);

  const [stats, setStats] = useState({ candidates: 0, vacOpen: 0, vacClosed: 0, reminders: 0, avgIntDays: null });
  const [stageCounts, setStageCounts] = useState(Object.fromEntries(STAGES.map(s => [s, 0])));
  const [dashRems, setDashRems] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [funnelVacId, setFunnelVacId] = useState('');
  const [interviews, setInterviews] = useState([]);
  const [weekLabel, setWeekLabel] = useState('');
  const [weekStart, setWeekStart] = useState(null);

  const load = useCallback(async () => {
    if (!currentUser) return;

    const { data: myVacs } = await sb.from('vacancies').select('id, status, title').eq('recruiter_id', currentUser.id);
    const vacIds = (myVacs || []).map(v => v.id);
    setVacancies(myVacs || []);

    const [candsRes, remsRes, cciesRes, histRes] = await Promise.all([
      sb.from('candidates').select('id', { count: 'exact' }).eq('recruiter_id', currentUser.id),
      sb.from('reminders').select('id').eq('recruiter_id', currentUser.id).eq('is_done', false),
      vacIds.length
        ? sb.from('candidacies').select('current_stage').in('vacancy_id', vacIds)
        : Promise.resolve({ data: [] }),
      vacIds.length
        ? sb.from('stage_history').select('candidacy_id, from_stage, to_stage, changed_at').order('changed_at', { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const avg = calcAvgInterviewDays(histRes.data || []);
    setStats({
      candidates: candsRes.count ?? 0,
      vacOpen:    (myVacs || []).filter(v => v.status === 'open').length,
      vacClosed:  (myVacs || []).filter(v => v.status !== 'open').length,
      reminders:  remsRes.data?.length ?? 0,
      avgIntDays: avg,
    });

    const counts = Object.fromEntries(STAGES.map(s => [s, 0]));
    (cciesRes.data || []).forEach(x => { if (x.current_stage in counts) counts[x.current_stage]++; });
    setStageCounts(counts);

    const { data: remList } = await sb.from('reminders')
      .select('*, candidates(full_name)')
      .eq('recruiter_id', currentUser.id).eq('is_done', false)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(6);
    setDashRems(remList || []);

    // Interview calendar
    const now  = new Date();
    const dow  = (now.getDay() + 6) % 7;
    const mon  = new Date(now); mon.setHours(0,0,0,0); mon.setDate(now.getDate() - dow);
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    setWeekStart(mon);
    setWeekLabel(
      mon.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' — ' +
      sun.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    );
    const { data: ivs } = await sb.from('interviews')
      .select('*, candidates(full_name)')
      .eq('recruiter_id', currentUser.id)
      .gte('scheduled_at', mon.toISOString())
      .lte('scheduled_at', sun.toISOString())
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true });
    setInterviews(ivs || []);
  }, [currentUser?.id]);

  useEffect(() => { if (currentUser) load(); }, [load]);

  const filterFunnel = async (vacId) => {
    setFunnelVacId(vacId);
    const counts = Object.fromEntries(STAGES.map(s => [s, 0]));
    if (!vacId) {
      allCandidates.forEach(c => { if (c.pipeline_stage in counts) counts[c.pipeline_stage]++; });
      const { data: myVacs } = await sb.from('vacancies').select('id').eq('recruiter_id', currentUser.id);
      const vacIds = (myVacs || []).map(v => v.id);
      if (vacIds.length) {
        const { data } = await sb.from('candidacies').select('current_stage').in('vacancy_id', vacIds);
        (data || []).forEach(c => { if (c.current_stage in counts) counts[c.current_stage]++; });
      }
    } else {
      const { data } = await sb.from('candidacies').select('current_stage').eq('vacancy_id', vacId);
      (data || []).forEach(c => { if (c.current_stage in counts) counts[c.current_stage]++; });
    }
    setStageCounts(counts);
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const days = weekStart
    ? Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; })
    : [];
  const byDay = {};
  interviews.forEach(iv => { const k = new Date(iv.scheduled_at).toDateString(); (byDay[k] ||= []).push(iv); });
  const todayStr = new Date().toDateString();

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-6">
      <h2 className="page-title mb-0">Дашборд</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Кандидатов', value: stats.candidates, icon: '👤', onClick: () => setActiveView('candidates') },
          { label: 'Вакансий открыто', value: stats.vacOpen, icon: '💼', onClick: () => setActiveView('vacancies') },
          { label: 'Вакансий закрыто', value: stats.vacClosed, icon: '🔒', onClick: null },
          { label: 'Напоминаний', value: stats.reminders, icon: '🔔', onClick: () => setActiveView('reminders') },
        ].map(s => (
          <div key={s.label}
            onClick={s.onClick || undefined}
            className={`card p-5 text-center ${s.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
            <p className="text-3xl mb-1">{s.icon}</p>
            <p className="text-2xl font-black text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveView('candidates')} className="btn-secondary btn-sm">📤 Импорт / Экспорт</button>
        <button onClick={() => setActiveView('candidates')} className="btn-secondary btn-sm">📝 Шаблоны</button>
        <button onClick={() => setActiveView('reminders')} className="btn-secondary btn-sm">🔔 Напоминания</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="font-bold text-slate-700">Воронка найма</h3>
            <select
              className="input-field text-xs w-auto"
              value={funnelVacId}
              onChange={e => filterFunnel(e.target.value)}
            >
              <option value="">Все вакансии</option>
              {vacancies.map(v => <option key={v.id} value={v.id}>{v.title || 'Вакансия'}</option>)}
            </select>
          </div>
          <FunnelChart stageCounts={stageCounts} />
        </div>

        {/* Reminders */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Ближайшие напоминания</h3>
            <button onClick={() => setActiveView('reminders')} className="text-xs text-indigo-500 hover:underline">
              Все →
            </button>
          </div>
          {dashRems.length === 0 ? (
            <p className="text-slate-400 text-sm">Нет активных напоминаний</p>
          ) : (
            <div className="space-y-0.5">
              {dashRems.map(r => {
                const overdue = r.due_date && new Date(r.due_date) < today;
                return (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 truncate text-sm">{r.note}</p>
                      {r.candidates && <p className="text-xs text-slate-400">👤 {r.candidates.full_name}</p>}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                      {fmtDay(r.due_date)} {overdue && '⚠️'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Interview calendar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-700">Собеседования на неделе</h3>
          <span className="text-xs text-slate-400">{weekLabel}</span>
        </div>
        {interviews.length === 0 ? (
          <p className="text-slate-400 text-sm">На этой неделе собеседований нет 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-1.5 min-w-[500px]">
              {days.map(d => {
                const key = d.toDateString();
                const events = byDay[key] || [];
                const isToday = key === todayStr;
                return (
                  <div key={key} className={`flex flex-col ${isToday ? 'bg-indigo-50 rounded-xl' : ''} p-1.5 min-h-20`}>
                    <div className="text-center mb-1">
                      <span className={`text-xs font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-500'}`}>
                        {DAY_NAMES[d.getDay()]}
                      </span>
                      <div className={`text-xs ${isToday ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                        {d.getDate()}
                      </div>
                    </div>
                    {events.map(iv => {
                      const time = new Date(iv.scheduled_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                      const name = iv.candidates?.full_name?.split(' ')[0] || '—';
                      return (
                        <div key={iv.id}
                          className="text-xs bg-indigo-100 text-indigo-800 rounded-lg px-1.5 py-1 mb-1 leading-tight cursor-pointer hover:bg-indigo-200 transition"
                          title={iv.candidates?.full_name || ''}>
                          <div className="font-semibold">{time}</div>
                          <div className="truncate opacity-80">{name}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
