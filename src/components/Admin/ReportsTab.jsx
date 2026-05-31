import { useState, useMemo } from 'react';

// ── Period helpers ────────────────────────────────────────────────────────────
const PERIODS = [
  { id: 'day',   label: 'День' },
  { id: 'week',  label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'all',   label: 'Всё время' },
];

function periodStart(id) {
  const now = new Date();
  if (id === 'day')   { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (id === 'week')  { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; }
  if (id === 'month') { const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; }
  return new Date(0);
}

function inPeriod(dateStr, period) {
  if (!dateStr) return false;
  return new Date(dateStr) >= periodStart(period);
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
function BarChart({ data, color = '#6366f1', height = 140 }) {
  // data: [{ label, value }]
  if (!data.length) return <div className="text-slate-400 text-sm text-center py-8">Нет данных</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 100 / data.length;

  return (
    <svg viewBox={`0 0 ${data.length * 40} ${height + 30}`} className="w-full" style={{ height: height + 30 }}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * height, d.value > 0 ? 4 : 0);
        const x = i * 40 + 4;
        const y = height - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={32} height={barH} rx={4} fill={color} opacity={0.85} />
            {d.value > 0 && (
              <text x={x + 16} y={y - 3} textAnchor="middle" fontSize={9} fill="#374151">{d.value}</text>
            )}
            <text x={x + 16} y={height + 14} textAnchor="middle" fontSize={8} fill="#9ca3af"
              style={{ overflow: 'hidden' }}>
              {d.label.length > 5 ? d.label.slice(0, 5) + '…' : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG Horizontal Bar Chart ──────────────────────────────────────────────────
function HBarChart({ data, color = '#6366f1' }) {
  // data: [{ label, value, color? }]
  if (!data.length) return <div className="text-slate-400 text-sm text-center py-8">Нет данных</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const ROW = 28;

  return (
    <svg viewBox={`0 0 300 ${data.length * ROW}`} className="w-full" style={{ height: data.length * ROW }}>
      {data.map((d, i) => {
        const barW = Math.max((d.value / max) * 200, d.value > 0 ? 4 : 0);
        const y = i * ROW;
        const c = d.color || color;
        return (
          <g key={i}>
            <text x={0} y={y + 17} fontSize={10} fill="#6b7280"
              style={{ fontFamily: 'sans-serif' }}>
              {d.label.length > 14 ? d.label.slice(0, 14) + '…' : d.label}
            </text>
            <rect x={90} y={y + 6} width={barW} height={16} rx={3} fill={c} opacity={0.8} />
            <text x={96 + barW} y={y + 17} fontSize={10} fill="#374151">{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ data }) {
  // data: [{ label, value, color }]
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="text-slate-400 text-sm text-center py-8">Нет данных</div>;

  const R = 50, cx = 70, cy = 70, stroke = 22;
  let offset = 0;
  const circ = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 140 140" className="w-28 h-28 shrink-0">
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circ;
          const gap  = circ - dash;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={R}
              fill="none" stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circ}
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
            />
          );
          offset += pct;
          return el;
        })}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#1e293b">{total}</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-semibold text-slate-800 ml-auto pl-3">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Timeline bar (candidates added per day) ───────────────────────────────────
function buildTimeline(candidates, period) {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const key = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    buckets[key] = 0;
  }
  const start = periodStart(period === 'all' ? 'month' : period);
  candidates.filter(c => new Date(c.created_at) >= start).forEach(c => {
    const key = new Date(c.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportsTab({ candidates, vacancies, activity, hrStats, exportFns }) {
  const [period, setPeriod] = useState('week');

  // ── Filter by period ─────────────────────────────────────────────
  const filteredCands = useMemo(
    () => candidates.filter(c => inPeriod(c.created_at, period)),
    [candidates, period]
  );

  const filteredActivity = useMemo(
    () => activity.filter(a => inPeriod(a.event_at, period)),
    [activity, period]
  );

  // ── Chart data ────────────────────────────────────────────────────

  // 1. Timeline: candidates added per day
  const timelineData = useMemo(
    () => period === 'all'
      ? buildTimeline(candidates, 'month')
      : buildTimeline(candidates, period),
    [candidates, period]
  );

  // 2. Candidates by status (donut)
  const statusData = useMemo(() => [
    { label: 'Активные',   value: filteredCands.filter(c => c.status === 'active').length,  color: '#10b981' },
    { label: 'В работе',   value: filteredCands.filter(c => c.status === 'in_work').length, color: '#f59e0b' },
    { label: 'Архив',      value: filteredCands.filter(c => c.status === 'archive').length, color: '#94a3b8' },
  ].filter(d => d.value > 0), [filteredCands]);

  // 3. Activity by type (bar)
  const actTypeData = useMemo(() => {
    const counts = {};
    filteredActivity.forEach(a => { counts[a.event_type] = (counts[a.event_type] || 0) + 1; });
    const labels = {
      candidate_added:   'Кандидаты',
      vacancy_added:     'Вакансии',
      interview_scheduled: 'Интервью',
      stage_changed:     'Этапы',
    };
    return Object.entries(counts).map(([k, v]) => ({ label: labels[k] || k, value: v }));
  }, [filteredActivity]);

  // 4. Top recruiters by candidates added (hbar)
  const recruiterData = useMemo(() => {
    const counts = {};
    filteredCands.forEach(c => {
      const name = c.recruiter_name || 'Неизвестно';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value, color: '#6366f1' }));
  }, [filteredCands]);

  // 5. Vacancies by status (donut)
  const vacStatusData = useMemo(() => [
    { label: 'Открытые',  value: vacancies.filter(v => v.status === 'open').length,   color: '#10b981' },
    { label: 'Закрытые',  value: vacancies.filter(v => v.status === 'closed').length,  color: '#94a3b8' },
    { label: 'На паузе',  value: vacancies.filter(v => v.status === 'paused').length,  color: '#f59e0b' },
  ].filter(d => d.value > 0), [vacancies]);

  // ── Summary numbers ───────────────────────────────────────────────
  const newCands    = filteredCands.length;
  const newActivity = filteredActivity.length;
  const interviews  = filteredActivity.filter(a => a.event_type === 'interview_scheduled').length;

  return (
    <div className="space-y-6">

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500 font-medium mr-1">Период:</span>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              period === p.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}>
            {p.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          {period !== 'all' && `с ${periodStart(period).toLocaleDateString('ru-RU')}`}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Новых кандидатов', value: newCands,    color: 'bg-indigo-50  text-indigo-700  border-indigo-200' },
          { label: 'Действий в CRM',   value: newActivity, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: 'Интервью',         value: interviews,  color: 'bg-purple-50  text-purple-700  border-purple-200' },
          { label: 'Всего вакансий',   value: vacancies.length, color: 'bg-amber-50 text-amber-700 border-amber-200' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-4 ${k.color}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{k.label}</p>
            <p className="text-3xl font-black mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Timeline */}
        {period !== 'day' && (
          <div className="card p-5 md:col-span-2">
            <h3 className="font-semibold text-slate-700 mb-4">
              📈 Новые кандидаты{period === 'all' ? ' (последние 30 дней)' : ''}
            </h3>
            <BarChart data={timelineData} color="#6366f1" height={120} />
          </div>
        )}

        {/* Candidates by status */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-4">👤 Кандидаты по статусу</h3>
          <DonutChart data={statusData} />
        </div>

        {/* Vacancies by status */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-4">💼 Вакансии по статусу</h3>
          <DonutChart data={vacStatusData} />
        </div>

        {/* Activity by type */}
        {actTypeData.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4">📋 Активность по типам</h3>
            <BarChart data={actTypeData} color="#10b981" height={100} />
          </div>
        )}

        {/* Top recruiters */}
        {recruiterData.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4">🏆 Рекрутеры по кандидатам</h3>
            <HBarChart data={recruiterData} />
          </div>
        )}
      </div>

      {/* Export buttons */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-700 mb-3">📥 Экспорт отчётов</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">👥 По рекрутерам</p>
            <div className="flex gap-2">
              <button onClick={exportFns.hrXLSX}   className="btn-primary  btn-sm flex-1 justify-center">📊 Excel</button>
              <button onClick={exportFns.hrDoc}    className="btn-secondary btn-sm">📄 Word</button>
              <button onClick={exportFns.hrPDF}    className="btn-secondary btn-sm">🖨 PDF</button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">💼 По вакансиям</p>
            <div className="flex gap-2">
              <button onClick={exportFns.vacXLSX}  className="btn-primary  btn-sm flex-1 justify-center">📊 Excel</button>
              <button onClick={exportFns.vacDoc}   className="btn-secondary btn-sm">📄 Word</button>
              <button onClick={exportFns.vacPDF}   className="btn-secondary btn-sm">🖨 PDF</button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">📋 Активность</p>
            <div className="flex gap-2">
              <button onClick={exportFns.actCSV}   className="btn-primary  btn-sm flex-1 justify-center">📊 CSV</button>
              <button onClick={exportFns.actPDF}   className="btn-secondary btn-sm">🖨 PDF</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
