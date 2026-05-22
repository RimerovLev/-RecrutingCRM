import { sb, STAGES, STAGE_LABELS } from './config.js';
import { S } from './state.js';
import { esc, fmtDay, fmtDate, toast } from './utils.js';
import { isOnline, LS, cacheGet } from './offline.js';
import { updateReminderBadge } from './reminders.js';

export async function loadDashboard() {
  if (!S.currentUser) return;

  if (!isOnline) {
    const cachedCands = cacheGet(LS.candidates + '_' + S.currentUser.id) || [];
    const cachedVacs  = cacheGet(LS.vacancies  + '_' + S.currentUser.id) || [];
    const cachedRems  = cacheGet(LS.reminders  + '_' + S.currentUser.id) || [];
    const activeRems  = cachedRems.filter(r => !r.is_done);

    document.getElementById('stat-candidates').textContent  = cachedCands.length;
    document.getElementById('stat-vac-open').textContent    = cachedVacs.filter(v => v.status === 'open').length;
    document.getElementById('stat-vac-closed').textContent  = cachedVacs.filter(v => v.status !== 'open').length;
    const statRem = document.getElementById('stat-reminders');
    if (statRem) statRem.textContent = activeRems.length;

    updateReminderBadge(activeRems);

    const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0]));
    cachedCands.forEach(c => { if (c.pipeline_stage in stageCounts) stageCounts[c.pipeline_stage]++; });
    drawStagesChart(stageCounts);

    document.getElementById('stat-avg-interview').textContent = '—';

    const upcomingRems = activeRems
      .filter(r => r.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 6);
    renderDashReminders(upcomingRems);
    return;
  }

  const { data: myVacs } = await sb.from('vacancies').select('id').eq('recruiter_id', S.currentUser.id);
  const vacIds = (myVacs || []).map(v => v.id);

  const [
    { data: cands  },
    { data: allVacs },
    { data: rems  },
    { data: ccies },
    { data: hist  },
  ] = await Promise.all([
    sb.from('candidates').select('id',       { count: 'exact' }).eq('recruiter_id', S.currentUser.id),
    sb.from('vacancies').select('id, status, title').eq('recruiter_id', S.currentUser.id),
    sb.from('reminders').select('id').eq('recruiter_id', S.currentUser.id).eq('is_done', false),
    vacIds.length
      ? sb.from('candidacies').select('current_stage').in('vacancy_id', vacIds)
      : Promise.resolve({ data: [] }),
    vacIds.length
      ? sb.from('stage_history')
          .select('candidacy_id, from_stage, to_stage, changed_at')
          .order('changed_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  document.getElementById('stat-candidates').textContent  = cands?.length ?? '—';
  document.getElementById('stat-vac-open').textContent    = (allVacs||[]).filter(v => v.status==='open').length;
  document.getElementById('stat-vac-closed').textContent  = (allVacs||[]).filter(v => v.status!=='open').length;
  const statRem2 = document.getElementById('stat-reminders');
  if (statRem2) statRem2.textContent = rems?.length ?? '—';

  updateReminderBadge(rems || []);

  const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0]));
  (ccies||[]).forEach(x => { if (x.current_stage in stageCounts) stageCounts[x.current_stage]++; });
  drawStagesChart(stageCounts);

  const avg = calcAvgInterviewDays(hist || []);
  document.getElementById('stat-avg-interview').textContent = avg != null ? avg.toFixed(1) : '—';

  const { data: dashRems } = await sb.from('reminders')
    .select('*, candidates(full_name)')
    .eq('recruiter_id', S.currentUser.id).eq('is_done', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(6);
  renderDashReminders(dashRems || []);

  // Populate vacancy selector for funnel filter
  _populateFunnelSelector(allVacs || []);

  // Load interview calendar
  await loadDashInterviews();
}

export function drawStagesChart(counts) {
  const el = document.getElementById('stages-chart');
  const COLORS = { new:'#94a3b8', resume:'#3b82f6', phone:'#f59e0b', interview:'#8b5cf6', offer:'#10b981', rejected:'#ef4444' };
  const funnelStages = STAGES.filter(s => s !== 'rejected');
  const maxCount = Math.max(1, ...funnelStages.map(s => counts[s] || 0));

  const rows = funnelStages.map((stage, i) => {
    const count = counts[stage] || 0;
    const prev  = i > 0 ? (counts[funnelStages[i-1]] || 0) : count;
    const conv  = (i > 0 && prev > 0) ? Math.round(count / prev * 100) : null;
    const barPct = Math.round(count / maxCount * 100);
    return { stage, count, conv, barPct, color: COLORS[stage] };
  });

  const rejCount = counts['rejected'] || 0;

  el.innerHTML = `
    <div class="space-y-2">
      ${rows.map((r, i) => `
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500 w-20 shrink-0 text-right">${STAGE_LABELS[r.stage]}</span>
          <div class="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
            <div class="h-full rounded-lg transition-all duration-500" style="width:${r.barPct}%;background:${r.color}"></div>
            <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">${r.count}</span>
          </div>
          <span class="text-xs w-10 text-right shrink-0 ${r.conv != null ? 'text-slate-400' : 'invisible'}">
            ${r.conv != null ? r.conv + '%' : ''}
          </span>
        </div>
      `).join('')}
      <div class="border-t border-slate-100 pt-2 mt-1 flex items-center gap-2">
        <span class="text-xs text-slate-500 w-20 shrink-0 text-right">${STAGE_LABELS['rejected']}</span>
        <div class="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
          <div class="h-full rounded-lg transition-all duration-500 bg-red-400" style="width:${Math.round(rejCount/maxCount*100)}%"></div>
          <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">${rejCount}</span>
        </div>
        <span class="text-xs w-10 shrink-0"></span>
      </div>
    </div>
    <p class="text-xs text-slate-400 mt-3 text-right">% — конверсия от предыдущего этапа</p>`;
}

export function calcAvgInterviewDays(history) {
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
        cnt++;
        enterAt = null;
      }
    }
  });
  return cnt > 0 ? total / cnt : null;
}

export function renderDashReminders(list) {
  const el = document.getElementById('dash-reminders');
  const today = new Date(); today.setHours(0,0,0,0);
  if (!list.length) {
    el.innerHTML = '<p class="text-slate-400 text-sm">Нет активных напоминаний</p>';
    return;
  }
  el.innerHTML = list.map(r => {
    const overdue = r.due_date && new Date(r.due_date) < today;
    return `<div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <div class="flex-1 min-w-0">
        <p class="text-slate-800 truncate">${esc(r.note)}</p>
        ${r.candidates ? `<p class="text-xs text-slate-400">👤 ${esc(r.candidates.full_name)}</p>` : ''}
      </div>
      <span class="text-xs whitespace-nowrap ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}">
        ${fmtDay(r.due_date)} ${overdue ? '⚠️' : ''}
      </span>
    </div>`;
  }).join('');
}

// ── Item 13: Funnel per vacancy ───────────────────────────────────
function _populateFunnelSelector(vacs) {
  const sel = document.getElementById('funnel-vacancy-sel');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Все вакансии</option>' +
    vacs.map(v => `<option value="${v.id}" ${current===v.id?'selected':''}>${esc(v.title||'Вакансия')}</option>`).join('');
}

export async function filterFunnelByVacancy(vacId) {
  if (!S.currentUser) return;

  const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0]));

  if (!vacId) {
    // All vacancies — rebuild from S.allCandidates pipeline_stage
    S.allCandidates.forEach(c => {
      if (c.pipeline_stage in stageCounts) stageCounts[c.pipeline_stage]++;
    });
    drawStagesChart(stageCounts);
    return;
  }

  const { data: ccies } = await sb.from('candidacies')
    .select('current_stage')
    .eq('vacancy_id', vacId);

  (ccies || []).forEach(c => {
    if (c.current_stage in stageCounts) stageCounts[c.current_stage]++;
  });
  drawStagesChart(stageCounts);
}

// ── Item 11: Interview calendar ───────────────────────────────────
const INT_FORMAT = { online: '💻', office: '🏢', phone: '📞' };
const DAY_NAMES  = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export async function loadDashInterviews() {
  const el = document.getElementById('dash-interviews');
  if (!el) return;

  if (!isOnline) {
    el.innerHTML = '<p class="text-xs text-slate-400">Недоступно офлайн</p>';
    return;
  }

  // Mon–Sun of current week
  const now  = new Date();
  const dow  = (now.getDay() + 6) % 7; // 0=Mon
  const mon  = new Date(now); mon.setHours(0,0,0,0); mon.setDate(now.getDate() - dow);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);

  const weekLabel = mon.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}) +
    ' — ' + sun.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  const wl = document.getElementById('dash-int-week');
  if (wl) wl.textContent = weekLabel;

  const { data: ivs } = await sb.from('interviews')
    .select('*, candidates(full_name), vacancies(title)')
    .eq('recruiter_id', S.currentUser.id)
    .gte('scheduled_at', mon.toISOString())
    .lte('scheduled_at', sun.toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });

  _renderDashCalendar(el, ivs || [], mon);
}

function _renderDashCalendar(el, ivs, mon) {
  // Build 7-day grid
  const days = Array.from({length: 7}, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return d;
  });

  const byDay = {};
  ivs.forEach(iv => {
    const key = new Date(iv.scheduled_at).toDateString();
    (byDay[key] ||= []).push(iv);
  });

  if (!ivs.length) {
    el.innerHTML = `<p class="text-slate-400 text-sm">На этой неделе собеседований нет 🎉</p>`;
    return;
  }

  const todayStr = new Date().toDateString();
  el.innerHTML = `<div class="grid grid-cols-7 gap-1.5 min-w-[500px]">
    ${days.map(d => {
      const key    = d.toDateString();
      const events = byDay[key] || [];
      const isToday = key === todayStr;
      const dayNum = d.getDate();
      const dayName = DAY_NAMES[d.getDay()];
      return `<div class="flex flex-col ${isToday ? 'bg-indigo-50 rounded-xl' : ''} p-1.5 min-h-[80px]">
        <div class="text-center mb-1">
          <span class="text-xs font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-500'}">${dayName}</span>
          <div class="text-xs ${isToday ? 'text-indigo-700 font-bold' : 'text-slate-400'}">${dayNum}</div>
        </div>
        ${events.map(iv => {
          const time = new Date(iv.scheduled_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
          const fmt  = INT_FORMAT[iv.format] || '📅';
          const name = iv.candidates?.full_name?.split(' ')[0] || '—';
          return `<div class="text-xs bg-indigo-100 text-indigo-800 rounded-lg px-1.5 py-1 mb-1 leading-tight
            cursor-pointer hover:bg-indigo-200 transition"
            title="${esc((iv.candidates?.full_name||'')+' · '+(iv.vacancies?.title||'')+' · '+(iv.location||''))}"
            onclick="openDrawer('${iv.candidate_id}')">
            <div class="font-semibold">${time} ${fmt}</div>
            <div class="truncate opacity-80">${esc(name)}</div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}
