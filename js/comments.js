import { sb } from './config.js';
import { S } from './state.js';
import { esc, fmtDate, toast, openModal, closeModal } from './utils.js';

export async function openCommentsModal(candidateId, candidateName) {
  document.getElementById('comment-cand-id').value = candidateId;
  document.getElementById('comments-candidate-name').textContent = '💬 ' + (candidateName || 'Кандидат');
  document.getElementById('comment-text').value = '';
  await loadComments(candidateId);
  openModal('modal-comments');
}

export async function loadComments(candidateId) {
  const { data, error } = await sb.from('comments')
    .select('*, profiles(full_name)')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  const el = document.getElementById('comments-list');
  if (error || !data?.length) {
    el.innerHTML = '<p class="text-slate-400 text-center py-6 text-sm">Нет комментариев</p>';
    return;
  }
  el.innerHTML = data.map(c => `
    <div class="bg-slate-50 rounded-xl p-3">
      <div class="flex justify-between text-xs text-slate-400 mb-1">
        <span class="font-semibold text-slate-600">${esc(c.profiles?.full_name || 'Рекрутер')}</span>
        <span>${fmtDate(c.created_at)}</span>
      </div>
      <p class="text-slate-700 text-sm">${esc(c.content)}</p>
    </div>`).join('');
}

export async function addComment(e) {
  e.preventDefault();
  const candidateId = document.getElementById('comment-cand-id').value;
  const content = document.getElementById('comment-text').value.trim();
  if (!content) return;
  const { error } = await sb.from('comments').insert({
    candidate_id: candidateId, author_id: S.currentUser.id, content
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  document.getElementById('comment-text').value = '';
  loadComments(candidateId);
}

export async function openHistoryModal(candidacyId, candidateName) {
  const { data, error } = await sb.from('stage_history')
    .select('*').eq('candidacy_id', candidacyId)
    .order('changed_at', { ascending: true });
  const body = document.getElementById('history-body');
  if (error || !data?.length) {
    body.innerHTML = '<p class="text-slate-400 text-center py-6">История пуста</p>';
  } else {
    body.innerHTML = `
      <p class="font-semibold text-slate-700 mb-4">${esc(candidateName)}</p>
      <div class="space-y-2">
        ${data.map(h => `<div class="flex items-center gap-2 py-2 border-b border-slate-100 text-sm">
          <span class="text-slate-400 text-xs w-36 flex-shrink-0">${fmtDate(h.changed_at)}</span>
          <span class="text-slate-500">${h.from_stage ? esc(h.from_stage) : '—'}</span>
          <span class="text-slate-300">→</span>
          <span class="font-semibold text-indigo-600">${esc(h.to_stage)}</span>
        </div>`).join('')}
      </div>`;
  }
  openModal('modal-history');
}
