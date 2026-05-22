import { sb } from './config.js';
import { S } from './state.js';
import { esc, toast, openModal, closeModal } from './utils.js';
import { loadCandidates } from './candidates.js';

let _mergeMain = null;
let _mergeDupe = null;

export function openMergeModal() {
  _mergeMain = _mergeDupe = null;
  document.getElementById('merge-search').value = '';
  document.getElementById('merge-selected').classList.add('hidden');
  renderMergeList();
  openModal('modal-merge');
}

export function renderMergeList() {
  const q = document.getElementById('merge-search').value.toLowerCase().trim();
  const list = S.allCandidates.filter(c =>
    !q ||
    c.full_name?.toLowerCase().includes(q) ||
    c.email?.toLowerCase().includes(q) ||
    c.phone?.includes(q)
  ).slice(0, 30);

  document.getElementById('merge-list').innerHTML = list.map(c => {
    const isMain = _mergeMain?.id === c.id;
    const isDupe = _mergeDupe?.id === c.id;
    const cls = isMain ? 'border-emerald-400 bg-emerald-50' : isDupe ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-indigo-300';
    return `<div class="border rounded-lg p-3 cursor-pointer transition ${cls}" onclick="selectMergeCandidate('${c.id}')">
      <div class="font-semibold text-sm text-slate-800">${esc(c.full_name)}</div>
      <div class="text-xs text-slate-400">${c.email || ''} ${c.phone || ''}</div>
      ${isMain ? '<span class="text-xs text-emerald-600 font-bold">✓ Основная</span>' : ''}
      ${isDupe ? '<span class="text-xs text-red-600 font-bold">✓ Дубликат</span>' : ''}
    </div>`;
  }).join('') || '<p class="text-sm text-slate-400 text-center py-4">Нет кандидатов</p>';
}

export function selectMergeCandidate(id) {
  const c = S.allCandidates.find(x => x.id === id);
  if (!c) return;
  if (!_mergeMain) {
    _mergeMain = c;
  } else if (_mergeMain.id === c.id) {
    _mergeMain = null;
  } else if (!_mergeDupe) {
    _mergeDupe = c;
  } else if (_mergeDupe.id === c.id) {
    _mergeDupe = null;
  } else {
    _mergeDupe = c;
  }

  const sel = document.getElementById('merge-selected');
  if (_mergeMain && _mergeDupe) {
    document.getElementById('merge-main-card').innerHTML =
      `<p class="font-semibold">${esc(_mergeMain.full_name)}</p><p class="text-xs text-slate-400">${_mergeMain.email || ''}</p>`;
    document.getElementById('merge-dupe-card').innerHTML =
      `<p class="font-semibold">${esc(_mergeDupe.full_name)}</p><p class="text-xs text-slate-400">${_mergeDupe.email || ''}</p>`;
    sel.classList.remove('hidden');
  } else {
    sel.classList.add('hidden');
  }
  renderMergeList();
}

export async function confirmMerge() {
  if (!_mergeMain || !_mergeDupe) return;
  const mainId = _mergeMain.id;
  const dupeId = _mergeDupe.id;

  if (!confirm(`Объединить «${_mergeDupe.full_name}» → «${_mergeMain.full_name}»? Дубликат будет удалён безвозвратно.`)) return;

  const { data: dupeVacs } = await sb.from('candidacies').select('vacancy_id').eq('candidate_id', dupeId);
  const { data: mainVacs } = await sb.from('candidacies').select('vacancy_id').eq('candidate_id', mainId);
  const mainVacIds = new Set((mainVacs || []).map(x => x.vacancy_id));
  for (const cv of (dupeVacs || [])) {
    if (!mainVacIds.has(cv.vacancy_id)) {
      await sb.from('candidacies').update({ candidate_id: mainId }).eq('candidate_id', dupeId).eq('vacancy_id', cv.vacancy_id);
    }
  }

  await Promise.all([
    sb.from('comments').update({ candidate_id: mainId }).eq('candidate_id', dupeId),
    sb.from('reminders').update({ candidate_id: mainId }).eq('candidate_id', dupeId),
  ]);

  const { error } = await sb.from('candidates').delete().eq('id', dupeId);
  if (error) { toast('Ошибка удаления: ' + error.message, 'err'); return; }

  toast(`✅ «${_mergeDupe.full_name}» объединён с «${_mergeMain.full_name}»`);
  closeModal('modal-merge');
  _mergeMain = _mergeDupe = null;
  loadCandidates();
}
