import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';
import { STAGES } from '@/lib/config';
import { isMissingTableError } from '@/lib/apiErrors';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function fmtDay(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const hasTime = d.includes('T') && !d.endsWith('T00:00:00');
  if (hasTime) return dt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('ru-RU');
}

function calcAvgInterviewDays(history) {
  const byCcy = {};
  history.forEach(h => { (byCcy[h.candidacy_id] ||= []).push(h); });
  let total = 0, cnt = 0;
  Object.values(byCcy).forEach(evs => {
    evs.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
    let enterAt = null;
    for (const e of evs) {
      if (e.to_stage === 'interview') enterAt = new Date(e.changed_at);
      else if (enterAt && e.from_stage === 'interview') { total += (new Date(e.changed_at) - enterAt) / 86400000; cnt++; enterAt = null; }
    }
  });
  return cnt > 0 ? Math.round(total / cnt) : null;
}

// ── Metric Card ───────────────────────────────────────────────────
function MetricCard({ label, value, sub, accentColor, delayClass, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`card fade-up ${delayClass}`}
      onClick={onClick}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.15s, box-shadow 0.15s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.1)' : undefined,
      }}
    >
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, borderRadius: '2px 2px 0 0' }} />
      <p style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: 'var(--ink)' }}>{value}</p>
      {sub && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{sub}</p>
          {onClick && <span style={{ fontSize: 10, color: accentColor, fontFamily: 'var(--font-sans)', fontWeight: 600, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>→</span>}
        </div>
      )}
    </div>
  );
}

// ── Funnel Bar ────────────────────────────────────────────────────
const STAGE_COLORS_NEW = {
  new: '#64748b', resume: 'var(--accent2)', phone: 'var(--amber)',
  interview: '#8b5cf6', offer: 'var(--green)', rejected: 'var(--accent)',
};

function FunnelBars({ stageCounts, t, isRTL }) {
  const funnelStages = STAGES.filter(s => s !== 'rejected');
  const maxCount = Math.max(1, ...funnelStages.map(s => stageCounts[s] || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {funnelStages.map((stage, i) => {
        const count = stageCounts[stage] || 0;
        const prev = i > 0 ? (stageCounts[funnelStages[i - 1]] || 0) : count;
        const conv = i > 0 && prev > 0 ? Math.round(count / prev * 100) : null;
        const pct = Math.round(count / maxCount * 100);
        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', width: 70, textAlign: isRTL ? 'left' : 'right', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
              {t(`stages.${stage}`)}
            </span>
            <div style={{ flex: 1, position: 'relative', height: 26, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: STAGE_COLORS_NEW[stage], borderRadius: 6, transition: 'width 0.5s ease' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
                {count}
              </span>
            </div>
            <span style={{ fontSize: 10, width: 32, textAlign: 'right', color: conv != null ? 'var(--muted)' : 'transparent', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
              {conv != null ? `${conv}%` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const currentUserId = useStore(s => s.currentUserId);
  const navigate      = useNavigate();
  const { t, isRTL }  = useI18n();

  const [stats, setStats]           = useState({ candidates: 0, vacOpen: 0, vacClosed: 0, reminders: 0, avgIntDays: null });
  const [stageCounts, setStageCounts] = useState(Object.fromEntries(STAGES.map(s => [s, 0])));
  const [dashRems, setDashRems]     = useState([]);
  const [vacancies, setVacancies]   = useState([]);
  const [funnelVacId, setFunnelVacId] = useState('');
  const [interviews, setInterviews] = useState([]);
  const [todayInterviews, setTodayInterviews] = useState([]);
  const [weekLabel, setWeekLabel]   = useState('');
  const [weekStart, setWeekStart]   = useState(null);

  const load = useCallback(async () => {
    if (!currentUserId) return;

    const { data: myVacs } = await sb.from('vacancies').select('id, status, title').eq('recruiter_id', currentUserId);
    const vacIds = (myVacs || []).map(v => v.id);
    setVacancies(myVacs || []);

    const [candsRes, remsRes, cciesRes, histRes] = await Promise.all([
      sb.from('candidates').select('id', { count: 'exact' }).eq('recruiter_id', currentUserId),
      sb.from('reminders').select('id').eq('recruiter_id', currentUserId).eq('is_done', false),
      vacIds.length ? sb.from('candidacies').select('current_stage').in('vacancy_id', vacIds) : Promise.resolve({ data: [] }),
      vacIds.length ? sb.from('stage_history').select('candidacy_id, from_stage, to_stage, changed_at').order('changed_at', { ascending: true }) : Promise.resolve({ data: [] }),
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
      .eq('recruiter_id', currentUserId).eq('is_done', false)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(6);
    setDashRems(remList || []);

    // Week interviews
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setHours(0,0,0,0); mon.setDate(now.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    setWeekStart(mon);
    setWeekLabel(
      mon.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' — ' +
      sun.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    );
    const { data: ivs, error: ivErr } = await sb.from('interviews')
      .select('*, candidates(full_name)')
      .eq('recruiter_id', currentUserId)
      .gte('scheduled_at', mon.toISOString())
      .lte('scheduled_at', sun.toISOString())
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true });
    if (ivErr && isMissingTableError(ivErr, 'interviews')) {
      setInterviews([]);
    } else {
      const all = ivs || [];
      setInterviews(all);
      const todayStr = new Date().toDateString();
      setTodayInterviews(all.filter(iv => new Date(iv.scheduled_at).toDateString() === todayStr));
    }
  }, [currentUserId]);

  useEffect(() => { if (currentUserId) load(); }, [currentUserId]);

  const filterFunnel = async (vacId) => {
    setFunnelVacId(vacId);
    const counts = Object.fromEntries(STAGES.map(s => [s, 0]));
    if (!vacId) {
      const { data: myVacs } = await sb.from('vacancies').select('id').eq('recruiter_id', currentUserId);
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

  // Mini bar chart data (15 bars, last 6 = current month activity)
  const barHeights = [30, 45, 35, 55, 40, 60, 50, 45, 65, 70, 55, 80, 90, 75, 100];

  return (
    <div className="p-4 md:p-7" style={{ minHeight: '100%' }}>

      {/* ── Metric cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        <MetricCard
          label={t('dashboard.candidates')}
          value={stats.candidates}
          sub={t('dashboard.candidatesSub')}
          accentColor="var(--accent)"
          delayClass="delay-1"
          onClick={() => navigate('/candidates')}
        />
        <MetricCard
          label={t('dashboard.vacOpen')}
          value={stats.vacOpen}
          sub={t('dashboard.vacOpenSub')}
          accentColor="var(--accent2)"
          delayClass="delay-2"
          onClick={() => navigate('/vacancies')}
        />
        <MetricCard
          label={t('dashboard.reminders')}
          value={stats.reminders}
          sub={t('dashboard.remindersSub')}
          accentColor="var(--green)"
          delayClass="delay-3"
          onClick={() => navigate('/reminders')}
        />
        <MetricCard
          label={t('dashboard.avgDays')}
          value={stats.avgIntDays != null ? `${stats.avgIntDays}${isRTL ? 'י' : 'д'}` : '—'}
          sub={t('dashboard.avgDaysSub')}
          accentColor="var(--amber)"
          delayClass="delay-4"
          onClick={() => navigate('/kanban')}
        />
      </div>

      {/* ── Main grid: Funnel + Side panel ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mb-5">

        {/* Funnel card */}
        <div className="card fade-up delay-5">
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{t('dashboard.funnel')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={funnelVacId}
                onChange={e => filterFunnel(e.target.value)}
                style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font-sans)', outline: 'none' }}
              >
                <option value="">{t('dashboard.allVacancies')}</option>
                {vacancies.map(v => <option key={v.id} value={v.id}>{v.title || t('nav.vacancies')}</option>)}
              </select>
              <button
                onClick={() => navigate('/kanban')}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >{t('dashboard.openKanban')}</button>
            </div>
          </div>
          <div style={{ padding: 24 }}>
            <FunnelBars stageCounts={stageCounts} t={t} isRTL={isRTL} />
          </div>

          {/* Mini bar chart */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 8px', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-sans)', letterSpacing: 1 }}>{t('dashboard.activityWeeks')}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>2026</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 40, gap: 4, paddingBottom: 16 }}>
              {barHeights.map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h}%`,
                  background: i >= 9 ? 'var(--accent)' : 'var(--border)',
                  opacity: i >= 9 ? (0.4 + (i - 9) * 0.12) : 1,
                  borderRadius: '3px 3px 0 0',
                  border: i >= 13 ? '1px dashed var(--accent)' : 'none',
                  ...(i >= 13 ? { background: 'transparent' } : {}),
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Today's interviews */}
          <div className="card fade-up delay-6">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t('dashboard.todayTitle')}</h3>
              <button onClick={() => navigate('/interviews')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{t('dashboard.allInterviews')}</button>
            </div>
            <div>
              {todayInterviews.length === 0 ? (
                <p style={{ padding: '16px 20px', fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{t('dashboard.noTodayIv')}</p>
              ) : todayInterviews.slice(0, 3).map(iv => {
                const dt = new Date(iv.scheduled_at);
                const hour = dt.getHours();
                const min  = dt.getMinutes().toString().padStart(2, '0');
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const h12  = hour % 12 || 12;
                const isAm = hour < 12;
                return (
                  <div key={iv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                      background: isAm ? 'rgba(232,68,26,0.1)' : 'rgba(26,92,232,0.1)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 800, color: isAm ? 'var(--accent)' : 'var(--accent2)', lineHeight: 1 }}>{h12}:{min}</span>
                      <span style={{ fontSize: 8, color: isAm ? 'var(--accent)' : 'var(--accent2)', marginTop: 1 }}>{ampm}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {iv.candidates?.full_name || '—'}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>
                        {iv.format === 'phone' ? t('dashboard.call') : iv.format === 'online' ? t('dashboard.video') : t('dashboard.office')} · {iv.notes || '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reminders */}
          <div className="card fade-up delay-6">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t('dashboard.remindersTitle')}</h3>
              <button onClick={() => navigate('/reminders')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{t('dashboard.allReminders')}</button>
            </div>
            {dashRems.length === 0 ? (
              <p style={{ padding: '16px 20px', fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{t('dashboard.noReminders')}</p>
            ) : dashRems.slice(0, 4).map(r => {
              const overdue = r.due_date && new Date(r.due_date) < today;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: overdue ? 'var(--accent)' : 'var(--green)', marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</p>
                    {r.candidates && <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{r.candidates.full_name}</p>}
                  </div>
                  <span style={{ fontSize: 10, color: overdue ? 'var(--accent)' : 'var(--muted)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {fmtDay(r.due_date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom grid: Week calendar ─────────────────────────────── */}
      <div className="card fade-up delay-7">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{t('dashboard.weekTitle')}</h3>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{weekLabel}</span>
        </div>
        {interviews.length === 0 ? (
          <p style={{ padding: '20px 24px', fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{t('dashboard.noWeekIv')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minWidth: 500 }}>
              {days.map(d => {
                const key    = d.toDateString();
                const events = byDay[key] || [];
                const isToday = key === todayStr;
                return (
                  <div key={key} style={{ borderRight: '1px solid var(--border)', minHeight: 100, background: isToday ? 'rgba(26,92,232,0.03)' : 'transparent' }}>
                    <div style={{
                      padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center',
                      background: isToday ? 'var(--accent2)' : 'transparent',
                    }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: isToday ? '#fff' : 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{DAY_NAMES[d.getDay()]}</p>
                      <p style={{ fontFamily: isToday ? 'var(--font-serif)' : 'var(--font-sans)', fontSize: isToday ? 18 : 14, fontWeight: 700, color: isToday ? '#fff' : 'var(--ink)' }}>{d.getDate()}</p>
                    </div>
                    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {events.map(iv => {
                        const time = new Date(iv.scheduled_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                        const name = iv.candidates?.full_name?.split(' ')[0] || '—';
                        return (
                          <div key={iv.id} style={{
                            background: iv.status === 'done' ? 'rgba(26,158,107,0.1)' : 'rgba(26,92,232,0.1)',
                            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                          }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: iv.status === 'done' ? 'var(--green)' : 'var(--accent2)', fontFamily: 'var(--font-sans)' }}>{time}</p>
                            <p style={{ fontSize: 10, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{name}</p>
                          </div>
                        );
                      })}
                    </div>
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
