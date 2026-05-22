import { sb, STAGES, STAGE_LABELS } from './config.js';
import { S } from './state.js';
import { esc, money, fmtDate, toast, openModal, closeModal } from './utils.js';
import { loadCandidates } from './candidates.js';

export async function openKanban(vacId, vacTitle) {
  S.currentVacId    = vacId;
  S.currentVacTitle = vacTitle;
  document.getElementById('kanban-vac-title').textContent = vacTitle;
  window._showView('kanban');
  await loadKanban();
}

export async function loadKanban() {
  const { data, error } = await sb.from('candidacies')
    .select('id, current_stage, created_at, candidates(id, full_name, email, phone, salary_expectation, skills)')
    .eq('vacancy_id', S.currentVacId);
  if (error) { toast('Ошибка загрузки канбана', 'err'); return; }
  renderKanban(data || []);
}

export function renderKanban(items) {
  const board = document.getElementById('kanban-board');
  board.innerHTML = STAGES.map(stage => {
    const cards = items.filter(x => x.current_stage === stage);
    const stageIdx = STAGES.indexOf(stage);
    const prevStage = STAGES[stageIdx - 1] || null;
    const nextStage = STAGES[stageIdx + 1] || null;

    const cardHtml = cards.map(item => {
      const c = item.candidates || {};
      return `<div class="kanban-card rounded-xl border p-3 stage-border-${stage}"
          draggable="true"
          data-candidacy-id="${item.id}"
          data-stage="${stage}"
          ondragstart="kanbanDragStart(event)">
        <div class="font-semibold text-slate-800 leading-tight mb-1">${esc(c.full_name)}</div>
        ${c.email  ? `<div class="text-xs text-slate-500 truncate">${esc(c.email)}</div>` : ''}
        ${c.salary_expectation ? `<div class="text-xs text-slate-400">${money(c.salary_expectation)}</div>` : ''}
        <div class="flex flex-wrap gap-1 mt-2">
          ${prevStage ? `<button onclick="moveStage('${item.id}','${stage}','${prevStage}')"
              class="text-xs bg-white border border-slate-200 hover:bg-slate-50 px-2 py-0.5 rounded transition">← ${STAGE_LABELS[prevStage]||prevStage}</button>` : ''}
          ${nextStage ? `<button onclick="moveStage('${item.id}','${stage}','${nextStage}')"
              class="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded transition">${STAGE_LABELS[nextStage]||nextStage} →</button>` : ''}
        </div>
        <div class="flex gap-2 mt-2 pt-2 border-t border-slate-100">
          <button onclick="openHistoryModal('${item.id}','${esc(c.full_name)}')" class="text-xs text-slate-400 hover:text-slate-600">📜 История</button>
          <button onclick="openCommentsModal('${c.id}','${esc(c.full_name)}')"   class="text-xs text-slate-400 hover:text-slate-600">💬 Комм.</button>
          <button onclick="openEmailModal('${c.id}','invitation')"               class="text-xs text-slate-400 hover:text-emerald-600">📩</button>
        </div>
      </div>`;
    }).join('');

    const stageLabel = STAGE_LABELS[stage] || stage;
    return `<div class="flex-shrink-0 w-52">
      <div class="stage-${stage} text-white text-xs font-bold px-3 py-2 rounded-t-xl flex justify-between items-center">
        <span>${stageLabel}</span>
        <span class="bg-white/30 rounded-full px-1.5">${cards.length}</span>
      </div>
      <div class="kanban-drop-zone bg-slate-50 border border-t-0 border-slate-200 rounded-b-xl p-2 min-h-[6rem] space-y-2"
          data-stage="${stage}"
          ondragover="kanbanDragOver(event)"
          ondragenter="kanbanDragEnter(event)"
          ondragleave="kanbanDragLeave(event)"
          ondrop="kanbanDrop(event)">
        ${cardHtml || '<p class="text-xs text-slate-400 text-center py-4 kanban-empty-hint">Пусто</p>'}
      </div>
    </div>`;
  }).join('');
}

// ── Drag-and-drop ─────────────────────────────────────────────────
let _dragCandidacyId = null;
let _dragFromStage   = null;

export function kanbanDragStart(event) {
  const card = event.currentTarget;
  _dragCandidacyId = card.dataset.candidacyId;
  _dragFromStage   = card.dataset.stage;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', _dragCandidacyId);
  card.classList.add('opacity-50');
  setTimeout(() => card.classList.add('opacity-50'), 0);
}

export function kanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

export function kanbanDragEnter(event) {
  event.preventDefault();
  const zone = event.currentTarget;
  if (zone.dataset.stage !== _dragFromStage) {
    zone.classList.add('drag-over');
  }
}

export function kanbanDragLeave(event) {
  const zone = event.currentTarget;
  if (!zone.contains(event.relatedTarget)) {
    zone.classList.remove('drag-over');
  }
}

export async function kanbanDrop(event) {
  event.preventDefault();
  const zone = event.currentTarget;
  zone.classList.remove('drag-over');

  const toStage = zone.dataset.stage;
  if (!toStage || toStage === _dragFromStage || !_dragCandidacyId) return;

  await moveStage(_dragCandidacyId, _dragFromStage, toStage);
  _dragCandidacyId = null;
  _dragFromStage   = null;
}

export async function moveStage(candidacyId, from, to) {
  const { error } = await sb.from('candidacies').update({ current_stage: to }).eq('id', candidacyId);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  await sb.from('stage_history').insert({
    candidacy_id: candidacyId,
    from_stage: from,
    to_stage: to,
    changed_by: S.currentUser.id,
  });
  toast(`${STAGE_LABELS[from]||from} → ${STAGE_LABELS[to]||to}`);
  loadKanban();
}

// ── Привязка кандидата ─────────────────────────────────────────────
let _linkAvailable = [];

export async function openLinkModal() {
  const { data: linked } = await sb.from('candidacies').select('candidate_id').eq('vacancy_id', S.currentVacId);
  const linkedIds = (linked||[]).map(x => x.candidate_id);
  _linkAvailable = S.allCandidates.filter(c => !linkedIds.includes(c.id));
  document.getElementById('link-search').value = '';
  renderLinkList(_linkAvailable);
  openModal('modal-link');
}

export function renderLinkList(list) {
  const el = document.getElementById('link-list');
  if (!list.length) {
    el.innerHTML = '<p class="text-slate-400 text-center py-6 text-xs">Нет доступных кандидатов</p>';
    return;
  }
  el.innerHTML = list.map(c => {
    const position = c.position ? `<span class="text-indigo-600 font-medium">${esc(c.position)}</span>` : '';
    const phone    = c.phone    ? `<span>${esc(c.phone)}</span>` : '';
    const status   = c.status === 'in_work' ? '🔵' : c.status === 'archive' ? '⚪' : '🟢';
    const meta     = [position, phone].filter(Boolean).join(' · ');
    return `
    <button onclick="linkCandidate('${c.id}')"
      class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
      <div class="flex items-center gap-2">
        <span>${status}</span>
        <span class="font-semibold text-slate-800">${esc(c.full_name)}</span>
      </div>
      ${meta ? `<div class="text-xs text-slate-500 mt-0.5 ml-5">${meta}</div>` : ''}
    </button>`;
  }).join('');
}

export function filterLinkList() {
  const q = document.getElementById('link-search').value.toLowerCase();
  renderLinkList(_linkAvailable.filter(c =>
    c.full_name.toLowerCase().includes(q) ||
    (c.position || '').toLowerCase().includes(q) ||
    (c.phone    || '').toLowerCase().includes(q) ||
    (c.skills   || []).join(' ').toLowerCase().includes(q)
  ));
}

export async function linkCandidate(candidateId) {
  const { error } = await sb.from('candidacies').insert({
    candidate_id: candidateId,
    vacancy_id:   S.currentVacId,
    current_stage: 'new',
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  const { data: ccy } = await sb.from('candidacies')
    .select('id').eq('candidate_id', candidateId).eq('vacancy_id', S.currentVacId).single();
  if (ccy) {
    await sb.from('stage_history').insert({
      candidacy_id: ccy.id, from_stage: null, to_stage: 'new', changed_by: S.currentUser.id
    });
  }
  toast('Кандидат привязан ✓');
  closeModal('modal-link');
  loadKanban();
}

export async function exportKanbanCSV() {
  const { data, error } = await sb.from('candidacies')
    .select('current_stage, candidates(full_name, email, phone, skills, salary_expectation)')
    .eq('vacancy_id', S.currentVacId);
  if (error || !data?.length) { toast('Нет данных для экспорта', 'info'); return; }
  const rows = data.map(x => ({
    full_name:          x.candidates?.full_name || '',
    email:              x.candidates?.email || '',
    phone:              x.candidates?.phone || '',
    skills:             (x.candidates?.skills||[]).join(', '),
    salary_expectation: x.candidates?.salary_expectation || '',
    stage:              x.current_stage,
  }));
  const csv  = Papa.unparse(rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${S.currentVacTitle}_candidates.csv` });
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV скачан ✓');
}
