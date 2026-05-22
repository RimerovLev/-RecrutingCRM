import { sb } from './config.js';
import { S } from './state.js';
import { esc, toast, openModal } from './utils.js';

export async function openTemplatesModal() {
  openModal('modal-templates');
  await loadTemplates();
}

async function loadTemplates() {
  const { data } = await sb.from('message_templates')
    .select('*').eq('recruiter_id', S.currentUser.id)
    .order('created_at', { ascending: false });
  S.templatesCache = data || [];
  renderTemplates();
}

export function renderTemplates() {
  const el = document.getElementById('templates-list');
  if (!S.templatesCache.length) {
    el.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">Нет шаблонов. Добавь первый ниже.</p>';
    return;
  }
  el.innerHTML = S.templatesCache.map(t => `
    <div class="border rounded-xl p-3 space-y-1">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-slate-700 text-sm">${esc(t.title)}</span>
        <div class="flex gap-2">
          <button onclick="copyTemplate('${t.id}')" class="btn-sm btn-secondary text-xs py-1">📋 Копировать</button>
          <button onclick="deleteTemplate('${t.id}')" class="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      </div>
      <p class="text-slate-500 text-xs whitespace-pre-wrap">${esc(t.body)}</p>
    </div>
  `).join('');
}

export async function saveTemplate() {
  const title = document.getElementById('tmpl-title').value.trim();
  const body  = document.getElementById('tmpl-body').value.trim();
  if (!title || !body) { toast('Заполни название и текст', 'err'); return; }
  const { error } = await sb.from('message_templates').insert({
    recruiter_id: S.currentUser.id, title, body
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  document.getElementById('tmpl-title').value = '';
  document.getElementById('tmpl-body').value  = '';
  toast('Шаблон добавлен ✓');
  await loadTemplates();
}

export function copyTemplate(id) {
  const tmpl = S.templatesCache.find(t => t.id === id);
  if (!tmpl) return;
  navigator.clipboard.writeText(tmpl.body).then(() => toast('Скопировано ✓'));
}

export async function deleteTemplate(id) {
  if (!confirm('Удалить шаблон?')) return;
  await sb.from('message_templates').delete().eq('id', id);
  toast('Шаблон удалён');
  await loadTemplates();
}
