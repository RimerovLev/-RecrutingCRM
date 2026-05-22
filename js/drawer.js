import { sb, STAGES, STAGE_LABELS, STAGE_COLORS, STATUS_BADGE } from './config.js';
import { S } from './state.js';
import { esc, fmtDate, fmtDay, toast, renderPipelineBadge } from './utils.js';
import { isOnline, LS, cacheSet, cacheGet, queueOp } from './offline.js';
import { loadCandidates, togglePin, setStatus } from './candidates.js';
import { openCommentsModal } from './comments.js';
import { updateReminderBadge } from './reminders.js';

export async function openDrawer(candidateId) {
  S.drawerCandidateId = candidateId;
  const c = S.allCandidates.find(x => x.id === candidateId);
  if (!c) return;

  const drawer = document.getElementById('candidate-drawer');
  drawer.classList.remove('hidden');
  requestAnimationFrame(() => drawer.classList.add('drawer-open'));

  document.getElementById('drawer-name').textContent     = c.full_name;
  document.getElementById('drawer-position').textContent = c.position || '';
  document.getElementById('drawer-pin-btn').textContent  = c.is_pinned ? '⭐' : '☆';
  document.getElementById('drawer-added').textContent    = c.created_at
    ? 'Добавлен ' + new Date(c.created_at).toLocaleDateString('ru-RU') : '';

  const statusSel = document.getElementById('drawer-status');
  statusSel.innerHTML = [
    ['active',  'Активный'],
    ['in_work', 'В работе'],
    ['archive', 'Архив'],
  ].map(([v, l]) =>
    `<option value="${v}" ${(c.status||'active')===v?'selected':''}>${l}</option>`
  ).join('');
  const sc = STATUS_BADGE[c.status||'active'];
  statusSel.className = `text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${sc}`;

  document.getElementById('dr-phone').textContent  = c.phone || '—';
  document.getElementById('dr-car').textContent    = c.has_car || '—';
  document.getElementById('dr-res').textContent    = c.district_residence || '—';
  document.getElementById('dr-work').textContent   = c.district_work || '—';

  document.getElementById('dr-source').textContent = c.resume_source || '—';
  document.getElementById('dr-exp').textContent    = c.experience || '—';

  loadDrawerVacancies(candidateId);

  const tagsEl = document.getElementById('dr-tags');
  const tags = Array.isArray(c.tags) ? c.tags : [];
  tagsEl.innerHTML = tags.length
    ? tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')
    : '';

  const linksEl = document.getElementById('dr-links');
  linksEl.innerHTML = '';
  if (c.candidate_link) linksEl.innerHTML +=
    `<a href="${esc(c.candidate_link)}" target="_blank"
      class="flex items-center gap-2 text-indigo-500 hover:underline text-sm">
      👤 Профиль кандидата
    </a>`;
  if (c.resume_url) linksEl.innerHTML +=
    `<a href="${esc(c.resume_url)}" target="_blank"
      class="flex items-center gap-2 text-indigo-500 hover:underline text-sm">
      📎 Резюме
    </a>`;
  if (!c.candidate_link && !c.resume_url)
    linksEl.innerHTML = '<span class="text-slate-400 text-sm">Нет ссылок</span>';

  document.getElementById('dr-contact').textContent = c.contact_status || 'Не указано';

  await loadDrawerReminders(candidateId);
  await loadDrawerInterviews(candidateId);
  loadDrawerTimeline(candidateId);
  await loadDrawerComments(candidateId);

  document.getElementById('drawer-rem-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('drawer-rem-note').value = '';
}

export function closeDrawer() {
  const drawer = document.getElementById('candidate-drawer');
  drawer.classList.remove('drawer-open');
  setTimeout(() => drawer.classList.add('hidden'), 300);
}

// ── Вакансии + этапы воронки ──────────────────────────────────────
export async function loadDrawerVacancies(candidateId) {
  const el = document.getElementById('dr-vacancies-list');
  const c  = S.allCandidates.find(x => x.id === candidateId);

  if (!isOnline) {
    const ccies = c?._candidacies || [];
    if (!ccies.length) {
      const gs = c?.pipeline_stage || 'new';
      el.innerHTML = `<div class="text-xs text-slate-500">Не привязан к вакансии &nbsp;${renderPipelineBadge(gs)}</div>`;
    } else {
      el.innerHTML = ccies.map(cc => _renderCandidacyRow(cc, true)).join('');
    }
    return;
  }

  const { data: ccies } = await sb.from('candidacies')
    .select('id, current_stage, vacancy_id, vacancies(id, title, status)')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });

  if (!ccies?.length) {
    const gs = c?.pipeline_stage || 'new';
    el.innerHTML = `<div class="text-xs text-slate-500">Не привязан к вакансии &nbsp;${renderPipelineBadge(gs)}</div>`;
    return;
  }
  el.innerHTML = ccies.map(cc => _renderCandidacyRow(cc, false)).join('');
}

function _renderCandidacyRow(cc, readOnly) {
  const v     = cc.vacancies || {};
  const stage = cc.current_stage || 'new';
  const openBadge = v.status === 'open'
    ? '<span class="ml-1 text-emerald-600 font-semibold">●</span>'
    : '<span class="ml-1 text-slate-300">●</span>';
  const stageOpts = STAGES.map(s =>
    `<option value="${s}" ${stage===s?'selected':''}>${STAGE_LABELS[s]}</option>`
  ).join('');
  const stageControl = readOnly
    ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[stage]||'bg-slate-100 text-slate-600'}">${STAGE_LABELS[stage]||stage}</span>`
    : `<select onchange="updateDrawerCandidacyStage('${cc.id}', this.value)"
         class="text-xs rounded-full px-2 py-0.5 border border-slate-200 font-semibold ${STAGE_COLORS[stage]||'bg-slate-100 text-slate-600'} cursor-pointer focus:outline-none">
         ${stageOpts}</select>`;
  return `<div class="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2 gap-2">
    <span class="text-xs text-slate-700 font-medium truncate flex-1">${esc(v.title || 'Вакансия')}${openBadge}</span>
    ${stageControl}
  </div>`;
}

export async function updateDrawerCandidacyStage(candidacyId, newStage) {
  const { data: prev } = await sb.from('candidacies')
    .select('current_stage')
    .eq('id', candidacyId)
    .maybeSingle();

  const { error } = await sb.from('candidacies')
    .update({ current_stage: newStage })
    .eq('id', candidacyId);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  if (prev && prev.current_stage !== newStage) {
    await sb.from('stage_history').insert({
      candidacy_id: candidacyId,
      from_stage:   prev.current_stage,
      to_stage:     newStage,
      changed_by:   S.currentUser.id,
    });
  }
  toast(`Этап → ${STAGE_LABELS[newStage] || newStage} ✓`);
  loadDrawerVacancies(S.drawerCandidateId);
}

// ── Таймлайн ─────────────────────────────────────────────────────
export async function loadDrawerTimeline(candidateId) {
  const el = document.getElementById('dr-timeline');
  if (!el) return;
  el.innerHTML = '<p class="text-xs text-slate-300 animate-pulse">Загрузка…</p>';

  const c = S.allCandidates.find(x => x.id === candidateId);
  const events = [];

  if (c?.created_at) {
    events.push({ ts: c.created_at, icon: '👤', color: 'bg-indigo-100',
      text: 'Кандидат добавлен' });
  }

  if (!isOnline) {
    _renderTimeline(el, events);
    return;
  }

  const candIds = (c?._candidacies || []).map(cc => cc.id);
  const [stageRes, commentRes, reminderRes] = await Promise.all([
    candIds.length
      ? sb.from('stage_history')
          .select('from_stage, to_stage, changed_at, candidacy_id, candidacies(vacancies(title))')
          .in('candidacy_id', candIds)
          .order('changed_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
    sb.from('comments')
      .select('content, created_at, profiles(full_name)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(15),
    sb.from('reminders')
      .select('note, created_at, due_date, is_done')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  (stageRes.data || []).forEach(e => {
    const vac  = e.candidacies?.vacancies?.title;
    const from = STAGE_LABELS[e.from_stage] || e.from_stage || '?';
    const to   = STAGE_LABELS[e.to_stage]   || e.to_stage   || '?';
    events.push({
      ts:    e.changed_at,
      icon:  '🔄',
      color: 'bg-purple-100',
      text:  `${from} → ${to}`,
      sub:   vac ? `💼 ${vac}` : null,
    });
  });

  (commentRes.data || []).forEach(cm => {
    events.push({
      ts:    cm.created_at,
      icon:  '💬',
      color: 'bg-blue-100',
      text:  cm.content,
      sub:   cm.profiles?.full_name || null,
    });
  });

  (reminderRes.data || []).forEach(r => {
    events.push({
      ts:    r.created_at,
      icon:  r.is_done ? '✅' : '⏰',
      color: r.is_done ? 'bg-green-100' : 'bg-yellow-100',
      text:  r.note,
      sub:   r.due_date ? `Срок: ${fmtDay(r.due_date)}` : null,
    });
  });

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  _renderTimeline(el, events);
}

function _renderTimeline(el, events) {
  if (!events.length) {
    el.innerHTML = '<p class="text-xs text-slate-400">Нет активности</p>';
    return;
  }
  el.innerHTML = events.map(e => `
    <div class="flex gap-2.5 items-start">
      <div class="flex-shrink-0 w-6 h-6 rounded-full ${e.color} flex items-center justify-center text-xs leading-none">
        ${e.icon}
      </div>
      <div class="flex-1 min-w-0 pb-2 border-b border-slate-50">
        <p class="text-xs text-slate-700 leading-snug break-words">${esc(e.text)}</p>
        ${e.sub ? `<p class="text-xs text-slate-400 mt-0.5">${esc(e.sub)}</p>` : ''}
        <p class="text-xs text-slate-300 mt-0.5">${fmtDate(e.ts)}</p>
      </div>
    </div>`).join('');
}

// ── Напоминания в drawer ──────────────────────────────────────────
export async function loadDrawerReminders(candidateId) {
  let data;
  if (!isOnline) {
    const cached = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
    data = cached
      .filter(r => r.candidate_id === candidateId && !r.is_done)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  } else {
    ({ data } = await sb.from('reminders')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('is_done', false)
      .order('due_date', { ascending: true }));
  }

  const el = document.getElementById('drawer-reminders');
  if (!data?.length) { el.innerHTML = ''; return; }

  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = data.map(r => {
    const overdue = r.due_date && new Date(r.due_date) < today;
    return `<div class="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs border ${overdue ? 'border-red-200 bg-red-50' : 'border-indigo-100'}">
      <button onclick="drawerDoneReminder('${r.id}')" class="flex-shrink-0 w-4 h-4 rounded-full border ${overdue ? 'border-red-300' : 'border-indigo-300'} hover:bg-green-100 transition"></button>
      <span class="flex-1 ${overdue ? 'text-red-700' : 'text-slate-700'}">${esc(r.note)}</span>
      <span class="${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}">${fmtDay(r.due_date)}</span>
    </div>`;
  }).join('');
}

export async function drawerAddReminder(e) {
  e.preventDefault();
  const note    = document.getElementById('drawer-rem-note').value.trim();
  const date    = document.getElementById('drawer-rem-date').value;
  const time    = document.getElementById('drawer-rem-time').value;
  const dueDate = date || null;
  const noteWithTime = time && date ? `${note} (в ${time})` : note;

  const record = {
    id:           crypto.randomUUID(),
    recruiter_id: S.currentUser.id,
    candidate_id: S.drawerCandidateId,
    note:         noteWithTime,
    due_date:     dueDate,
    is_done:      false,
    created_at:   new Date().toISOString(),
  };

  if (!isOnline) {
    queueOp({ type: 'insert', table: 'reminders', data: record });
    const cached = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
    cached.unshift(record);
    cacheSet(LS.reminders + '_' + S.currentUser.id, cached);
    toast('📴 Напоминание сохранено офлайн');
    document.getElementById('drawer-rem-note').value = '';
    document.getElementById('drawer-rem-date').value = '';
    document.getElementById('drawer-rem-time').value = '';
    loadDrawerReminders(S.drawerCandidateId);
    return;
  }

  const { error } = await sb.from('reminders').insert(record);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Напоминание добавлено ✓');
  document.getElementById('drawer-rem-note').value = '';
  document.getElementById('drawer-rem-date').value = '';
  document.getElementById('drawer-rem-time').value = '';
  loadDrawerReminders(S.drawerCandidateId);
  const { data } = await sb.from('reminders').select('id').eq('recruiter_id', S.currentUser.id).eq('is_done', false);
  updateReminderBadge(data || []);
}

export async function drawerDoneReminder(id) {
  if (!isOnline) {
    queueOp({ type: 'update', table: 'reminders', data: { is_done: true }, matchField: 'id', matchValue: id });
    const cached = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
    const idx = cached.findIndex(r => r.id === id);
    if (idx !== -1) cached.splice(idx, 1);
    cacheSet(LS.reminders + '_' + S.currentUser.id, cached);
    loadDrawerReminders(S.drawerCandidateId);
    return;
  }
  await sb.from('reminders').update({ is_done: true }).eq('id', id);
  loadDrawerReminders(S.drawerCandidateId);
}

// ── Комментарии в drawer ──────────────────────────────────────────
function _renderComments(el, data) {
  if (!data?.length) {
    el.innerHTML = '<p class="text-slate-400 text-xs">Нет комментариев</p>';
    return;
  }
  el.innerHTML = data.map(c => `
    <div class="bg-slate-50 rounded-lg px-3 py-2 ${c._offline ? 'opacity-60 border border-amber-200 bg-amber-50' : ''}">
      <div class="flex justify-between text-xs text-slate-400 mb-0.5">
        <span class="font-semibold text-slate-600">${esc(c.profiles?.full_name || c._authorName || 'Рекрутер')}${c._offline ? ' 📴' : ''}</span>
        <span>${fmtDate(c.created_at)}</span>
      </div>
      <p class="text-sm text-slate-700">${esc(c.content)}</p>
    </div>`).join('');
}

export async function loadDrawerComments(candidateId) {
  const el = document.getElementById('drawer-comments');

  if (!isOnline) {
    const cached = cacheGet(LS.comments + '_' + candidateId) || [];
    _renderComments(el, cached);
    return;
  }

  const { data } = await sb.from('comments')
    .select('*, profiles(full_name)')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (data) cacheSet(LS.comments + '_' + candidateId, data);
  _renderComments(el, data);
}

export async function drawerAddComment(e) {
  e.preventDefault();
  const content = document.getElementById('drawer-comment-text').value.trim();
  if (!content) return;

  if (!isOnline) {
    const record = {
      id: crypto.randomUUID(),
      candidate_id: S.drawerCandidateId,
      author_id: S.currentUser.id,
      content,
      created_at: new Date().toISOString(),
      _offline: true,
      _authorName: S.currentProfile?.full_name || 'Вы',
    };
    queueOp({ type: 'insert', table: 'comments', data: {
      id: record.id, candidate_id: record.candidate_id,
      author_id: record.author_id, content: record.content,
    }});
    const cached = cacheGet(LS.comments + '_' + S.drawerCandidateId) || [];
    cached.unshift(record);
    cacheSet(LS.comments + '_' + S.drawerCandidateId, cached);
    document.getElementById('drawer-comment-text').value = '';
    loadDrawerComments(S.drawerCandidateId);
    return;
  }

  const { error } = await sb.from('comments').insert({
    candidate_id: S.drawerCandidateId,
    author_id: S.currentUser.id,
    content,
  });
  if (error) { toast('Ошибка', 'err'); return; }
  document.getElementById('drawer-comment-text').value = '';
  loadDrawerComments(S.drawerCandidateId);
}

// ── Собеседования в drawer ────────────────────────────────────────
const FORMAT_LABEL = { online: '💻 Онлайн', office: '🏢 В офисе', phone: '📞 Телефон' };
const INT_STATUS   = { scheduled: '🗓 Запланировано', done: '✅ Проведено', cancelled: '❌ Отменено' };

export async function loadDrawerInterviews(candidateId) {
  const el = document.getElementById('dr-interviews-list');
  if (!el) return;

  if (!isOnline) {
    el.innerHTML = '<p class="text-xs text-slate-400">Недоступно офлайн</p>';
    return;
  }

  const { data, error } = await sb.from('interviews')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('scheduled_at', { ascending: true });

  if (error) { el.innerHTML = ''; return; }
  if (!data?.length) {
    el.innerHTML = '<p class="text-xs text-slate-400">Нет запланированных собеседований</p>';
    return;
  }

  const now = new Date();
  el.innerHTML = data.map(iv => {
    const dt      = new Date(iv.scheduled_at);
    const past    = dt < now;
    const dtStr   = dt.toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    const bgCls   = iv.status === 'done'      ? 'bg-green-50 border-green-200'
                  : iv.status === 'cancelled' ? 'bg-slate-50 border-slate-200 opacity-60'
                  : past                      ? 'bg-amber-50 border-amber-200'
                  : 'bg-white border-indigo-100';
    const locHtml = iv.location
      ? `<span class="text-slate-400 truncate max-w-[140px]" title="${esc(iv.location)}">${esc(iv.location)}</span>` : '';
    const actHtml = iv.status === 'scheduled'
      ? `<button onclick="drawerInterviewDone('${iv.id}')" title="Проведено"
           class="action-btn text-green-600" >✓</button>
         <button onclick="drawerInterviewCancel('${iv.id}')" title="Отменить"
           class="action-btn text-red-400">✕</button>`
      : `<span class="text-xs text-slate-400">${INT_STATUS[iv.status]||iv.status}</span>`;
    return `<div class="flex items-start gap-2 border rounded-lg px-3 py-2 ${bgCls}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs font-semibold text-slate-700">${dtStr}</span>
          <span class="text-xs text-indigo-600">${FORMAT_LABEL[iv.format]||iv.format}</span>
          ${locHtml}
        </div>
        ${iv.notes ? `<p class="text-xs text-slate-500 mt-0.5 truncate">${esc(iv.notes)}</p>` : ''}
      </div>
      <div class="flex-shrink-0 flex gap-1 items-center">${actHtml}</div>
    </div>`;
  }).join('');
}

export async function drawerAddInterview(e) {
  e.preventDefault();
  const datetimeVal = document.getElementById('dr-int-datetime').value;
  const format      = document.getElementById('dr-int-format').value;
  const location    = document.getElementById('dr-int-location').value.trim();
  const notes       = document.getElementById('dr-int-notes').value.trim();

  if (!datetimeVal) { toast('Укажите дату и время', 'err'); return; }

  const { error } = await sb.from('interviews').insert({
    candidate_id: S.drawerCandidateId,
    recruiter_id: S.currentUser.id,
    scheduled_at: new Date(datetimeVal).toISOString(),
    format, location: location || null, notes: notes || null,
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  toast('Собеседование запланировано ✓');
  document.getElementById('dr-int-datetime').value = '';
  document.getElementById('dr-int-location').value = '';
  document.getElementById('dr-int-notes').value    = '';
  // collapse the details
  const det = document.querySelector('#dr-interviews-list')?.closest('.mx-5')?.querySelector('details');
  if (det) det.open = false;
  loadDrawerInterviews(S.drawerCandidateId);
}

export async function drawerInterviewDone(id) {
  await sb.from('interviews').update({ status: 'done' }).eq('id', id);
  loadDrawerInterviews(S.drawerCandidateId);
}

export async function drawerInterviewCancel(id) {
  await sb.from('interviews').update({ status: 'cancelled' }).eq('id', id);
  loadDrawerInterviews(S.drawerCandidateId);
}

// ── Действия из drawer ─────────────────────────────────────────────
export function drawerEdit() {
  closeDrawer();
  setTimeout(() => window.openCandidateModal(S.drawerCandidateId), 320);
}

export function drawerOpenComments() {
  const c = S.allCandidates.find(x => x.id === S.drawerCandidateId);
  openCommentsModal(S.drawerCandidateId, c?.full_name || '');
}

export async function drawerTogglePin() {
  const c = S.allCandidates.find(x => x.id === S.drawerCandidateId);
  if (!c) return;
  await togglePin(c.id, c.is_pinned);
  await loadCandidates();
  openDrawer(S.drawerCandidateId);
}

export async function drawerSetStatus(status) {
  await setStatus(S.drawerCandidateId, status);
  const sc = STATUS_BADGE[status] || 'badge-active';
  const sel = document.getElementById('drawer-status');
  sel.className = `text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${sc}`;
}

export async function drawerDelete() {
  const c = S.allCandidates.find(x => x.id === S.drawerCandidateId);
  if (!c || !confirm(`Удалить кандидата «${c.full_name}»?`)) return;
  const { error } = await sb.from('candidates').delete().eq('id', S.drawerCandidateId);
  if (error) { toast('Ошибка', 'err'); return; }
  toast('Кандидат удалён');
  closeDrawer();
  loadCandidates();
}
