import { sb, STAGES, FREE_STAGES, STAGE_COLORS, STAGE_LABELS, STATUS_LABELS, STATUS_BADGE, PAGE_SIZE } from './config.js';
import { S } from './state.js';
import { esc, money, fmtDate, fmtDay, toast, openModal, closeModal, renderPipelineBadge } from './utils.js';
import { isOnline, LS, cacheSet, cacheGet, queueOp } from './offline.js';

// ── Пагинация + поиск ─────────────────────────────────────────────

export async function loadCandidates(append = false) {
  if (!append) {
    S.candidatesOffset = 0;
    S.allCandidates    = [];
  }

  // Офлайн: из кэша
  if (!isOnline) {
    const cached = cacheGet(LS.candidates + '_' + S.currentUser.id) || [];
    if (!cached.length) { toast('📴 Офлайн — нет кэша кандидатов', 'warn'); return; }
    S.allCandidates    = cached;
    S.candidatesTotal  = cached.length;
    S.candidatesOffset = cached.length;
    toast('📴 Показаны кэшированные данные', 'warn');
    await _attachCandidacies();
    await populateVacancyFilters();
    _updateCandidatesCounter();
    filterCandidates();
    return;
  }

  // Онлайн
  const searchQ = (document.getElementById('search-all')?.value || '').trim();
  S.candidatesSearchMode = searchQ.length > 0;

  let query = sb.from('candidates')
    .select('*', { count: 'exact' })
    .eq('recruiter_id', S.currentUser.id)
    .order('created_at', { ascending: false });

  if (searchQ) {
    query = query.or(
      `full_name.ilike.%${searchQ}%,` +
      `phone.ilike.%${searchQ}%,` +
      `position.ilike.%${searchQ}%,` +
      `resume_source.ilike.%${searchQ}%,` +
      `district_residence.ilike.%${searchQ}%,` +
      `district_work.ilike.%${searchQ}%,` +
      `experience.ilike.%${searchQ}%,` +
      `contact_status.ilike.%${searchQ}%`
    );
    query = query.limit(500);
    S.candidatesOffset = 0;
    S.allCandidates    = [];
  } else {
    query = query.range(S.candidatesOffset, S.candidatesOffset + PAGE_SIZE - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    const cached = cacheGet(LS.candidates + '_' + S.currentUser.id);
    if (cached) { S.allCandidates = cached; toast('📴 Нет сети — показаны кэшированные данные', 'warn'); }
    else { toast('Ошибка загрузки кандидатов', 'err'); return; }
  } else {
    if (!searchQ) cacheSet(LS.candidates + '_' + S.currentUser.id, data || []);
    S.allCandidates    = append ? [...S.allCandidates, ...(data || [])] : (data || []);
    S.candidatesTotal  = count ?? S.allCandidates.length;
    S.candidatesOffset = S.allCandidates.length;
  }

  await _attachCandidacies();
  await populateVacancyFilters();
  _updateCandidatesCounter();
  filterCandidates();
}

export async function loadMoreCandidates() {
  await loadCandidates(true);
}

async function _attachCandidacies() {
  if (!S.allCandidates.length) return;
  const { data: candLinks } = await sb.from('candidacies')
    .select('id, candidate_id, vacancy_id, current_stage, vacancies(id, title, status)')
    .in('candidate_id', S.allCandidates.map(c => c.id));
  const candMap = {};
  (candLinks || []).forEach(cl => {
    if (!candMap[cl.candidate_id]) candMap[cl.candidate_id] = [];
    candMap[cl.candidate_id].push(cl);
  });
  S.allCandidates.forEach(c => {
    c._candidacies = candMap[c.id] || [];
    c._vacancyIds  = c._candidacies.map(cc => cc.vacancy_id);
  });
}

function _updateCandidatesCounter() {
  const el = document.getElementById('cand-counter');
  const btn = document.getElementById('load-more-btn');
  if (!el) return;
  const hasMore = !S.candidatesSearchMode && S.candidatesOffset < S.candidatesTotal;
  el.textContent = S.candidatesSearchMode
    ? `Найдено: ${S.allCandidates.length}`
    : `Показано ${S.allCandidates.length} из ${S.candidatesTotal}`;
  if (btn) btn.style.display = hasMore ? 'block' : 'none';
}

export async function populateVacancyFilters() {
  const { data: vacs } = await sb.from('vacancies')
    .select('id, title')
    .eq('recruiter_id', S.currentUser.id)
    .in('status', ['open', 'in_work'])
    .order('title');

  const opts = (vacs || []).map(v => `<option value="${v.id}">${esc(v.title)}</option>`).join('');

  const filterSel = document.getElementById('filter-vacancy');
  if (filterSel) filterSel.innerHTML = '<option value="">Все</option>' + opts;

  const formSel = document.getElementById('c-vacancy');
  if (formSel) formSel.innerHTML = '<option value="">— Без вакансии —</option>' + opts;
}

export function renderCandidates(list) {
  const tbody = document.getElementById('cand-tbody');
  const cards = document.getElementById('cand-cards');

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="py-10 text-center text-slate-400">Нет кандидатов</td></tr>';
    cards.innerHTML = '<div class="card p-8 text-center text-slate-400">Нет кандидатов</div>';
    return;
  }

  // Desktop table
  tbody.innerHTML = list.map(c => {
    const carBadge = c.has_car === 'Да'
      ? '<span class="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">✅ Да</span>'
      : c.has_car === 'Нет'
        ? '<span class="bg-red-50 text-red-400 text-xs px-2 py-0.5 rounded-full">✗ Нет</span>'
        : '<span class="text-slate-300">—</span>';
    const status    = c.status || 'active';
    const statusLbl = STATUS_LABELS[status] || status;
    const statusCls = STATUS_BADGE[status]  || 'badge-active';
    const pinned    = c.is_pinned;
    const checked   = S.selectedIds.has(c.id) ? 'checked' : '';
    return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition ${pinned ? 'bg-amber-50/40' : ''}">
      <td class="px-3 py-3">
        <input type="checkbox" class="row-check rounded" data-id="${c.id}" ${checked}
          onchange="toggleSelect('${c.id}', this)" />
      </td>
      <td class="px-1 py-3 text-center">
        <button onclick="togglePin('${c.id}', ${pinned})" title="${pinned ? 'Открепить' : 'Закрепить'}"
          class="text-lg leading-none hover:scale-110 transition-transform">
          ${pinned ? '⭐' : '☆'}
        </button>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <button onclick="openDrawer('${c.id}')" class="cand-name-btn block text-left">${esc(c.full_name)}</button>
        ${c.experience ? `<div class="text-xs text-slate-400 truncate max-w-[140px]">${esc(c.experience)}</div>` : ''}
      </td>
      <td class="px-3 py-3">
        <select onchange="setStatus('${c.id}', this.value)"
          class="text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${statusCls}">
          <option value="active"  ${status==='active'  ?'selected':''}>Активный</option>
          <option value="in_work" ${status==='in_work' ?'selected':''}>В работе</option>
          <option value="archive" ${status==='archive' ?'selected':''}>Архив</option>
        </select>
      </td>
      <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${esc(c.phone||'—')}</td>
      <td class="px-4 py-3 text-slate-500">${esc(c.district_residence||'—')}</td>
      <td class="px-4 py-3 text-slate-500">${esc(c.district_work||'—')}</td>
      <td class="px-4 py-3">${carBadge}</td>
      <td class="px-4 py-3 text-slate-700 whitespace-nowrap">
        ${esc(c.position||'—')}
        ${c.pipeline_stage && c.pipeline_stage !== 'new' ? renderPipelineBadge(c.pipeline_stage) : ''}
        ${Array.isArray(c.tags) && c.tags.length ? c.tags.map(t => `<span class="tag-chip ml-1">${esc(t)}</span>`).join('') : ''}
      </td>
      <td class="px-4 py-3 text-slate-500">${esc(c.resume_source||'—')}</td>
      <td class="px-4 py-3 text-slate-500 max-w-[160px]">
        <div class="truncate" title="${esc(c.contact_status)}">${esc(c.contact_status||'—')}</div>
      </td>
      <td class="px-4 py-3">
        ${c.candidate_link
          ? `<a href="${esc(c.candidate_link)}" target="_blank" class="text-indigo-500 hover:underline text-xs whitespace-nowrap">👤 Открыть</a>`
          : '<span class="text-slate-300">—</span>'}
      </td>
      <td class="px-4 py-3">
        ${c.resume_url
          ? `<a href="${esc(c.resume_url)}" target="_blank" class="text-indigo-500 hover:underline text-xs whitespace-nowrap">📎 Открыть</a>`
          : '<span class="text-slate-300">—</span>'}
      </td>
      <td class="px-4 py-3">
        <div class="flex flex-wrap gap-1">
          <button onclick="openCandidateModal('${c.id}')" title="Редактировать" class="action-btn text-blue-500 admin-only">✏️</button>
          <button onclick="deleteCandidate('${c.id}','${esc(c.full_name)}')" title="Удалить" class="action-btn text-red-400 admin-only">🗑️</button>
          <button onclick="openCommentsModal('${c.id}','${esc(c.full_name)}')" title="Комментарии" class="action-btn text-slate-500">💬</button>
          <button onclick="openReminderModal('${c.id}')" title="Напоминание" class="action-btn text-amber-500">🔔</button>
          <button onclick="openEmailModal('${c.id}','invitation')" title="Приглашение" class="action-btn text-emerald-500">📩</button>
          <button onclick="openEmailModal('${c.id}','offer')"      title="Оффер"       class="action-btn text-purple-500">🎉</button>
          <button onclick="openEmailModal('${c.id}','rejection')"  title="Отказ"       class="action-btn text-red-400">❌</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Mobile cards
  cards.innerHTML = list.map(c => {
    const status    = c.status || 'active';
    const statusLbl = STATUS_LABELS[status] || status;
    const statusCls = STATUS_BADGE[status]  || 'badge-active';
    const pinned    = c.is_pinned;

    const metaParts = [
      c.phone         ? `📞 ${esc(c.phone)}` : null,
      c.position      ? `💼 ${esc(c.position)}` : null,
      c.district_residence ? `🏠 ${esc(c.district_residence)}` : null,
      c.has_car === 'Да' ? '🚗 Есть авто' : null,
      c.resume_source ? `📋 ${esc(c.resume_source)}` : null,
    ].filter(Boolean);

    return `<div class="mob-cand-card ${pinned ? 'border-l-4 border-amber-400' : ''}">
      <div class="mob-cand-top">
        <div style="flex:1">
          <button onclick="openDrawer('${c.id}')" class="mob-cand-name text-left w-full">${esc(c.full_name)}</button>
          ${c.experience ? `<div style="font-size:.75rem;color:#94a3b8;margin-top:1px">${esc(c.experience)}</div>` : ''}
        </div>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}" style="white-space:nowrap;align-self:flex-start">${statusLbl}</span>
        ${pinned ? '<span style="font-size:1.1rem;margin-left:2px">⭐</span>' : ''}
      </div>
      ${metaParts.length ? `<div class="mob-cand-meta">${metaParts.map(p=>`<span>${p}</span>`).join('')}</div>` : ''}
      <div class="mob-cand-actions">
        <button onclick="openDrawer('${c.id}')" class="btn-sm btn-primary" style="font-size:.75rem;padding:.3rem .7rem">
          Открыть →
        </button>
        <button onclick="openReminderModal('${c.id}')" class="action-btn text-amber-500" title="Напоминание" style="font-size:1.2rem">🔔</button>
        <button onclick="openCommentsModal('${c.id}','${esc(c.full_name)}')" class="action-btn text-slate-400" title="Комментарии" style="font-size:1.2rem">💬</button>
        <button onclick="openCandidateModal('${c.id}')" class="action-btn text-blue-400" title="Редактировать" style="font-size:1.2rem">✏️</button>
        <button onclick="deleteCandidate('${c.id}','${esc(c.full_name)}')" class="action-btn text-red-300" title="Удалить" style="font-size:1.2rem">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

export function filterCandidates() {
  const q       = (document.getElementById('search-all')?.value || '').toLowerCase().trim();
  const statusQ = document.getElementById('filter-status')?.value   || '';
  const carQ    = document.getElementById('filter-car')?.value      || '';
  const distQ   = document.getElementById('filter-district')?.value.toLowerCase() || '';
  const dateQ   = document.getElementById('filter-date')?.value     || '';
  const vacQ    = document.getElementById('filter-vacancy')?.value  || '';

  let list = S.allCandidates.filter(c => {
    if (q) {
      if (S.candidatesSearchMode) {
        void 0; // Server already filtered, trust it
      } else {
        const haystack = [
          c.full_name, c.phone, c.position, c.resume_source,
          c.district_residence, c.district_work, c.contact_status,
          c.experience, ...(Array.isArray(c.tags) ? c.tags : []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
    }
    if (statusQ && (c.status || 'active') !== statusQ) return false;
    if (carQ    && c.has_car !== carQ) return false;
    if (distQ   && !(c.district_residence||'').toLowerCase().includes(distQ)) return false;
    if (dateQ   && c.created_at && c.created_at.slice(0,10) < dateQ) return false;
    if (vacQ    && !(c._vacancyIds || []).includes(vacQ)) return false;
    return true;
  });

  list.sort((a, b) => {
    if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
    if (!S.sortField) return 0;
    const av = (a[S.sortField] || '').toString().toLowerCase();
    const bv = (b[S.sortField] || '').toString().toLowerCase();
    return av < bv ? -S.sortDir : av > bv ? S.sortDir : 0;
  });

  renderCandidates(list);
}

export function sortBy(field) {
  if (S.sortField === field) S.sortDir *= -1;
  else { S.sortField = field; S.sortDir = 1; }
  document.querySelectorAll('.sort-icon').forEach(el => el.classList.remove('asc','desc'));
  const icon = document.querySelector(`.sort-icon[data-col="${field}"]`);
  if (icon) icon.classList.add(S.sortDir === 1 ? 'asc' : 'desc');
  filterCandidates();
}

export function toggleFilters() {
  const panel = document.getElementById('filters-panel');
  const btn   = document.getElementById('filters-toggle-btn');
  const open  = panel.classList.toggle('hidden');
  btn.classList.toggle('btn-primary', !open);
  btn.classList.toggle('btn-secondary', open);
}

export function resetFilters() {
  document.getElementById('search-all').value       = '';
  document.getElementById('filter-status').value    = '';
  document.getElementById('filter-car').value       = '';
  document.getElementById('filter-district').value  = '';
  document.getElementById('filter-date').value      = '';
  S.sortField = null; S.sortDir = 1;
  document.querySelectorAll('.sort-icon').forEach(el => el.classList.remove('asc','desc'));
  filterCandidates();
}

let _searchTimer = null;
export function debouncedSearch() {
  clearTimeout(_searchTimer);
  const q = document.getElementById('search-all')?.value.trim() || '';
  if (!q) {
    loadCandidates();
    return;
  }
  _searchTimer = setTimeout(() => loadCandidates(), 350);
}

// ── Массовый выбор ────────────────────────────────────────────────
export function toggleSelect(id, el) {
  if (el.checked) S.selectedIds.add(id);
  else S.selectedIds.delete(id);
  updateBulkBar();
}

export function toggleSelectAll(el) {
  const checkboxes = document.querySelectorAll('.row-check');
  checkboxes.forEach(cb => {
    cb.checked = el.checked;
    if (el.checked) S.selectedIds.add(cb.dataset.id);
    else S.selectedIds.delete(cb.dataset.id);
  });
  updateBulkBar();
}

export function clearSelection() {
  S.selectedIds.clear();
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
  const sa = document.getElementById('select-all');
  if (sa) sa.checked = false;
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if (S.selectedIds.size > 0) {
    bar.classList.remove('hidden');
    cnt.textContent = `Выбрано: ${S.selectedIds.size}`;
  } else {
    bar.classList.add('hidden');
  }
}

export async function bulkDelete() {
  if (!S.selectedIds.size) return;
  if (!confirm(`Удалить ${S.selectedIds.size} кандидатов?`)) return;
  const ids = [...S.selectedIds];
  const { error } = await sb.from('candidates').delete().in('id', ids);
  if (error) { toast('Ошибка удаления: ' + error.message, 'err'); return; }
  toast(`Удалено: ${ids.length}`);
  clearSelection();
  loadCandidates();
}

export function openBulkVacancyModal() {
  const list = document.getElementById('bulk-vac-list');
  if (!S.allVacancies.length) {
    list.innerHTML = '<p class="text-slate-400 text-center py-6">Нет вакансий</p>';
  } else {
    list.innerHTML = S.allVacancies.filter(v => v.status === 'open').map(v => `
      <button onclick="bulkAssignVacancy('${v.id}')"
        class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
        <div class="font-semibold text-slate-800">${esc(v.title)}</div>
      </button>`).join('');
  }
  openModal('modal-bulk-vacancy');
}

export async function bulkAssignVacancy(vacId) {
  const ids = [...S.selectedIds];
  let ok = 0, skip = 0;
  for (const candId of ids) {
    const { error } = await sb.from('candidacies').insert({
      candidate_id: candId, vacancy_id: vacId, current_stage: 'new'
    });
    error ? skip++ : ok++;
  }
  toast(`Добавлено в вакансию: ${ok}${skip ? `, уже привязаны: ${skip}` : ''}`);
  closeModal('modal-bulk-vacancy');
  clearSelection();
}

export async function togglePin(id, current) {
  const { error } = await sb.from('candidates').update({ is_pinned: !current }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadCandidates();
}

export async function setStatus(id, status) {
  const { error } = await sb.from('candidates').update({ status }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  toast('Статус обновлён');
  loadCandidates();
}

// ── Pipeline stages ───────────────────────────────────────────────
export function _updateStageButtonStates() {
  const vacId = document.getElementById('c-vacancy')?.value?.trim();
  document.querySelectorAll('.stage-btn').forEach(btn => {
    const s = btn.dataset.stage;
    if (!FREE_STAGES.has(s) && !vacId) {
      btn.style.opacity = '0.35';
      btn.title = 'Сначала выберите вакансию';
    } else {
      btn.style.opacity = '';
      btn.title = '';
    }
  });
}

export function setPipelineStage(stage) {
  const vacId = document.getElementById('c-vacancy')?.value?.trim();
  if (!FREE_STAGES.has(stage) && !vacId) {
    toast('⚠️ Выберите вакансию — этот этап требует конкретной позиции', 'warn');
    return;
  }
  document.getElementById('c-pipeline-stage').value = stage;
  document.querySelectorAll('.stage-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stage === stage);
  });
}

export async function onVacancyChange() {
  _updateStageButtonStates();
  const vacId  = document.getElementById('c-vacancy').value.trim();
  const candId = document.getElementById('cand-id').value;
  if (!vacId || !candId || !isOnline) return;
  const { data } = await sb.from('candidacies')
    .select('current_stage')
    .eq('candidate_id', candId)
    .eq('vacancy_id', vacId)
    .maybeSingle();
  if (data?.current_stage) setPipelineStage(data.current_stage);
}

// ── Tags ──────────────────────────────────────────────────────────
export function renderTagsSelected() {
  const el = document.getElementById('tags-selected');
  el.innerHTML = S.currentTags.map(t =>
    `<span class="tag-chip">${esc(t)}<button type="button" onclick="removeTag('${esc(t)}')" title="Удалить">×</button></span>`
  ).join('');
}

export function toggleTag(tag) {
  if (S.currentTags.includes(tag)) {
    S.currentTags = S.currentTags.filter(t => t !== tag);
  } else {
    S.currentTags.push(tag);
  }
  document.getElementById('c-tags').value = JSON.stringify(S.currentTags);
  renderTagsSelected();
}

export function removeTag(tag) {
  S.currentTags = S.currentTags.filter(t => t !== tag);
  document.getElementById('c-tags').value = JSON.stringify(S.currentTags);
  renderTagsSelected();
}

export function initTagInput() {
  const inp = document.getElementById('c-tags-custom');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inp.value.trim();
      if (val && !S.currentTags.includes(val)) {
        S.currentTags.push(val);
        document.getElementById('c-tags').value = JSON.stringify(S.currentTags);
        renderTagsSelected();
      }
      inp.value = '';
    }
  });
}

// ── Modal открыть/сохранить/удалить ──────────────────────────────
export async function openCandidateModal(id = null) {
  const form = document.getElementById('form-candidate');
  form.reset();
  document.getElementById('c-resume-hint').textContent = '';
  document.getElementById('cand-id').value = id || '';
  document.getElementById('cand-modal-title').textContent = id ? 'Редактировать кандидата' : 'Добавить кандидата';
  document.getElementById('status-history-block').classList.add('hidden');

  S.currentTags = [];
  document.getElementById('c-pipeline-stage').value = 'new';
  document.querySelectorAll('.stage-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.stage === 'new'));
  _updateStageButtonStates();
  renderTagsSelected();
  initTagInput();

  if (id) {
    const c = S.allCandidates.find(x => x.id === id);
    if (c) {
      document.getElementById('c-name').value          = c.full_name || '';
      document.getElementById('c-phone').value         = c.phone || '';
      document.getElementById('c-status').value        = c.status || 'active';
      document.getElementById('c-has-car').value       = c.has_car || '';
      document.getElementById('c-district-res').value  = c.district_residence || '';
      document.getElementById('c-district-work').value = c.district_work || '';
      document.getElementById('c-position').value      = c.position || '';
      document.getElementById('c-source').value        = c.resume_source || '';
      document.getElementById('c-contact').value       = c.contact_status || '';
      document.getElementById('c-link').value          = c.candidate_link || '';
      document.getElementById('c-resume-link').value   = c.resume_url || '';
      document.getElementById('c-exp').value           = c.experience || '';
      const vacSel = document.getElementById('c-vacancy');
      const firstCandidacy = c._candidacies && c._candidacies.length ? c._candidacies[0] : null;
      if (vacSel && firstCandidacy) {
        vacSel.value = firstCandidacy.vacancy_id;
        document.getElementById('c-pipeline-stage').value = firstCandidacy.current_stage || 'new';
        document.querySelectorAll('.stage-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.stage === (firstCandidacy.current_stage || 'new'));
        });
      } else {
        const gs = c.pipeline_stage || 'new';
        document.getElementById('c-pipeline-stage').value = gs;
        document.querySelectorAll('.stage-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.stage === gs);
        });
      }
      _updateStageButtonStates();
      S.currentTags = Array.isArray(c.tags) ? [...c.tags] : [];
      document.getElementById('c-tags').value = JSON.stringify(S.currentTags);
      renderTagsSelected();
      if (c.resume_url && c.resume_url.includes('supabase')) {
        document.getElementById('c-resume-hint').textContent =
          'Загружен файл: ' + decodeURIComponent(c.resume_url.split('/').pop().replace(/^\d+_/, ''));
      }
    }
  }
  openModal('modal-candidate');
}

export async function saveCandidate(e) {
  e.preventDefault();
  const id = document.getElementById('cand-id').value;

  let resumeUrl = undefined;
  const file = document.getElementById('c-resume').files[0];
  if (file) {
    if (!isOnline) {
      toast('📴 Файл резюме будет загружен при восстановлении сети', 'warn');
    } else {
      const path = `${S.currentUser.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await sb.storage.from('resumes').upload(path, file, { upsert: true });
      if (upErr) { toast('Ошибка загрузки резюме: ' + upErr.message, 'err'); return; }
      const { data: urlData } = sb.storage.from('resumes').getPublicUrl(path);
      resumeUrl = urlData.publicUrl;
    }
  }

  if (resumeUrl === undefined) {
    const manualLink = document.getElementById('c-resume-link').value.trim();
    if (manualLink) resumeUrl = manualLink;
  }

  const fullName = document.getElementById('c-name').value.trim();
  const phone    = document.getElementById('c-phone').value.trim() || null;
  const editId   = document.getElementById('cand-id').value;

  const dupByName  = S.allCandidates.find(c => c.id !== editId && c.full_name.toLowerCase() === fullName.toLowerCase());
  const dupByPhone = phone && S.allCandidates.find(c => c.id !== editId && c.phone === phone);
  if (dupByName) {
    if (!confirm(`Кандидат с именем «${dupByName.full_name}» уже есть в базе. Добавить всё равно?`)) return;
  }
  if (dupByPhone) {
    if (!confirm(`Телефон ${phone} уже используется кандидатом «${dupByPhone.full_name}». Добавить всё равно?`)) return;
  }

  const payload = {
    full_name:          fullName,
    phone,
    status:             document.getElementById('c-status').value || 'active',
    has_car:            document.getElementById('c-has-car').value || null,
    district_residence: document.getElementById('c-district-res').value.trim() || null,
    district_work:      document.getElementById('c-district-work').value.trim() || null,
    position:           document.getElementById('c-position').value.trim() || null,
    resume_source:      document.getElementById('c-source').value.trim() || null,
    contact_status:     document.getElementById('c-contact').value.trim() || null,
    candidate_link:     document.getElementById('c-link').value.trim() || null,
    experience:         document.getElementById('c-exp').value.trim() || null,
    pipeline_stage:     document.getElementById('c-pipeline-stage').value || 'new',
    tags:               JSON.parse(document.getElementById('c-tags').value || '[]'),
  };
  if (resumeUrl !== undefined) payload.resume_url = resumeUrl;

  let error;
  let savedId = id;

  if (!isOnline) {
    if (id) {
      queueOp({ type: 'update', table: 'candidates', data: payload, matchField: 'id', matchValue: id });
      const idx = S.allCandidates.findIndex(c => c.id === id);
      if (idx !== -1) S.allCandidates[idx] = { ...S.allCandidates[idx], ...payload };
    } else {
      const clientId = crypto.randomUUID();
      payload.recruiter_id = S.currentUser.id;
      payload.id = clientId;
      queueOp({ type: 'insert', table: 'candidates', data: payload });
      S.allCandidates.unshift({ ...payload, created_at: new Date().toISOString(), _vacancyIds: [] });

      const vacSelOff = document.getElementById('c-vacancy');
      const selVacIdOff = vacSelOff?.value?.trim() || '';
      const selStageOff = document.getElementById('c-pipeline-stage').value || 'new';
      if (selVacIdOff) {
        queueOp({ type: 'insert', table: 'candidacies', data: {
          id: crypto.randomUUID(),
          candidate_id: clientId,
          vacancy_id:   selVacIdOff,
          current_stage: selStageOff,
        }});
      }
    }
    cacheSet(LS.candidates + '_' + S.currentUser.id, S.allCandidates);
    closeModal('modal-candidate');
    renderCandidates(S.allCandidates);
    return;
  }

  if (id) {
    const prev = S.allCandidates.find(c => c.id === id);
    ({ error } = await sb.from('candidates').update(payload).eq('id', id));
    if (!error && prev && prev.status !== payload.status) {
      sb.from('bot_notifications').insert({
        recruiter_id: S.currentUser.id,
        type: 'status_changed',
        payload: {
          candidate_name: payload.full_name,
          old_status: prev.status,
          new_status: payload.status,
        },
        sent: false,
      });
    }
  } else {
    payload.recruiter_id = S.currentUser.id;
    const { data: inserted, error: insErr } = await sb.from('candidates').insert(payload).select('id').single();
    error = insErr;
    if (inserted) savedId = inserted.id;
  }
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  const vacSel     = document.getElementById('c-vacancy');
  const selectedVacId = vacSel?.value?.trim() || '';
  const selectedStage = document.getElementById('c-pipeline-stage').value || 'new';

  if (savedId && selectedVacId) {
    const { data: existing } = await sb.from('candidacies')
      .select('id, current_stage')
      .eq('candidate_id', savedId)
      .eq('vacancy_id', selectedVacId)
      .maybeSingle();

    if (!existing) {
      const { error: cavErr } = await sb.from('candidacies').insert({
        candidate_id:  savedId,
        vacancy_id:    selectedVacId,
        current_stage: selectedStage,
      });
      if (cavErr) toast('Ошибка привязки к вакансии: ' + cavErr.message, 'err');
    } else if (existing.current_stage !== selectedStage) {
      const { error: updErr } = await sb.from('candidacies')
        .update({ current_stage: selectedStage })
        .eq('id', existing.id);
      if (!updErr) {
        await sb.from('stage_history').insert({
          candidacy_id: existing.id,
          from_stage:   existing.current_stage,
          to_stage:     selectedStage,
          changed_by:   S.currentUser.id,
        });
      }
    }
  }

  toast(id ? 'Кандидат обновлён ✓' : 'Кандидат добавлен ✓');
  closeModal('modal-candidate');
  loadCandidates();
}

export async function deleteCandidate(id, name) {
  if (!confirm(`Удалить кандидата «${name}»?`)) return;
  const { error } = await sb.from('candidates').delete().eq('id', id);
  if (error) { toast('Ошибка удаления: ' + error.message, 'err'); return; }
  toast('Кандидат удалён');
  loadCandidates();
}

// ── CSV / Excel импорт / экспорт ──────────────────────────────────
const COL_MAP = {
  'фио':                    'full_name',
  'full_name':              'full_name',
  'имя':                    'full_name',
  'телефон':                'phone',
  'phone':                  'phone',
  'р-н проживания':         'district_residence',
  'район проживания':       'district_residence',
  'district_residence':     'district_residence',
  'р-н работы':             'district_work',
  'район работы':           'district_work',
  'district_work':          'district_work',
  'наличие авто':           'has_car',
  'авто':                   'has_car',
  'has_car':                'has_car',
  'должность':              'position',
  'position':               'position',
  'источник резюме':        'resume_source',
  'источник':               'resume_source',
  'resume_source':          'resume_source',
  'связь с кандидатом':     'contact_status',
  'связь':                  'contact_status',
  'contact_status':         'contact_status',
  'ссылка на кандидата':    'candidate_link',
  'candidate_link':         'candidate_link',
  'ссылка на резюме':       'resume_url',
  'resume_url':             'resume_url',
  'опыт':                   'experience',
  'experience':             'experience',
  'заметки':                'experience',
};

function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapRow(row) {
  const result = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const field = COL_MAP[normalizeKey(rawKey)];
    if (field && val != null && String(val).trim() !== '') {
      result[field] = String(val).trim();
    }
  }
  return result;
}

async function importRows(rows, filename) {
  if (!rows.length) { toast('Файл пустой', 'err'); return; }

  let skipped = 0;
  const records = [];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped.full_name) { skipped++; continue; }
    records.push({ recruiter_id: S.currentUser.id, ...mapped });
  }

  if (!records.length) {
    toast('Нет строк с ФИО', 'err');
    return;
  }

  const BATCH = 200;
  let ok = 0, fail = 0;
  toast(`Импорт ${records.length} записей…`, 'info');

  const batches = [];
  for (let i = 0; i < records.length; i += BATCH) {
    batches.push(records.slice(i, i + BATCH));
  }

  const results = await Promise.all(
    batches.map(batch => sb.from('candidates').insert(batch))
  );

  for (let i = 0; i < results.length; i++) {
    results[i].error ? fail += batches[i].length : ok += batches[i].length;
  }

  const msg = `«${filename}»: ${ok} добавлено` +
    (skipped ? `, ${skipped} пропущено (нет ФИО)` : '') +
    (fail    ? `, ${fail} ошибок` : '');
  toast(msg, fail > 0 ? 'info' : 'ok');
  loadCandidates();
}

export async function importFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    await importRows(rows, file.name);
  } else {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => { await importRows(data, file.name); },
      error: () => toast('Ошибка чтения CSV', 'err'),
    });
  }
}

export function exportAllCandidatesCSV() {
  if (!S.allCandidates.length) { toast('Нет данных', 'info'); return; }
  const rows = S.allCandidates.map(c => ({
    full_name:          c.full_name,
    phone:              c.phone || '',
    district_residence: c.district_residence || '',
    district_work:      c.district_work || '',
    has_car:            c.has_car || '',
    position:           c.position || '',
    resume_source:      c.resume_source || '',
    contact_status:     c.contact_status || '',
    candidate_link:     c.candidate_link || '',
    resume_url:         c.resume_url || '',
    experience:         c.experience || '',
  }));
  downloadCSV(rows, 'candidates_export.csv');
}

function downloadCSV(data, filename) {
  const csv  = Papa.unparse(data);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV скачан ✓');
}

// Seed test data
export async function seedCandidates() {
  const role = S.currentProfile?.role || 'recruiter';
  if (role === 'viewer') { toast('Недостаточно прав', 'err'); return; }
  if (role !== 'admin' && window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')) {
    if (!confirm('Кнопка "Тест-данные" предназначена только для разработки. Продолжить?')) return;
  }
  const names = [
    'Иванов Иван Иванович','Петров Пётр Петрович','Сидорова Мария Алексеевна',
    'Козлов Дмитрий Сергеевич','Новикова Анна Владимировна','Морозов Алексей Николаевич',
    'Волкова Елена Юрьевна','Соколов Андрей Константинович','Попова Наталья Игоревна','Лебедев Максим Олегович'
  ];
  const positions = ['Менеджер по продажам','Разработчик','HR-специалист','Аналитик','Дизайнер'];
  const sources = ['hh.ru','Авито','Реферал','LinkedIn','HeadHunter'];
  const records = names.map((n, i) => ({
    recruiter_id: S.currentUser.id,
    full_name: n,
    phone: `+7 900 ${String(i).padStart(3,'0')}-00-00`,
    position: positions[i % positions.length],
    resume_source: sources[i % sources.length],
    status: 'active',
  }));
  const { error } = await sb.from('candidates').insert(records);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast(`Добавлено ${records.length} тестовых кандидатов ✓`);
  loadCandidates();
}
