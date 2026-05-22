/**
 * email_templates.js — editable email templates stored in Supabase
 * Handles CRUD for email_templates table + tab switching in templates modal
 */

import { sb } from './config.js';
import { S } from './state.js';
import { canWrite } from './auth.js';
import { esc, toast } from './utils.js';

// ── Tab switching ─────────────────────────────────────────────────
export function switchTemplateTab(tab) {
  const tabs  = ['msg', 'email'];
  tabs.forEach(t => {
    const btn  = document.getElementById(`tmpl-tab-${t}`);
    const pane = document.getElementById(`tmpl-pane-${t}`);
    const active = t === tab;
    btn.className  = `py-2.5 text-sm font-semibold border-b-2 -mb-px ${
      active ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;
    pane.classList.toggle('hidden', !active);
    pane.classList.toggle('flex-1', active);
    pane.classList.toggle('flex', active);
    pane.classList.toggle('flex-col', active);
    pane.classList.toggle('overflow-hidden', active);
  });
  if (tab === 'email') loadEmailTemplates();
}

// ── Встроенные шаблоны ───────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    name: 'Приглашение на собеседование',
    type: 'invite',
    subject: 'Приглашение на собеседование — {vacancy_name}',
    body_html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
<p>Здравствуйте, <b>{candidate_name}</b>!</p>
<p>Мы рассмотрели ваше резюме и хотели бы пригласить вас на собеседование на позицию <b>{vacancy_name}</b>.</p>
<p>Пожалуйста, ответьте на это письмо, чтобы согласовать удобное время для встречи.</p>
<p style="margin-top:24px;color:#64748b">С уважением,<br><b>{recruiter_name}</b></p>
</div>`,
  },
  {
    name: 'Предложение о работе (оффер)',
    type: 'offer',
    subject: 'Предложение о работе — {vacancy_name}',
    body_html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
<p>Здравствуйте, <b>{candidate_name}</b>!</p>
<p>Мы рады сообщить, что по итогам собеседований вам предложена позиция <b>{vacancy_name}</b>.</p>
<p>Пожалуйста, свяжитесь с нами в ближайшее время для обсуждения деталей и оформления документов.</p>
<p style="margin-top:24px;color:#64748b">С уважением,<br><b>{recruiter_name}</b></p>
</div>`,
  },
  {
    name: 'Отказ после собеседования',
    type: 'rejection',
    subject: 'Результат рассмотрения кандидатуры — {vacancy_name}',
    body_html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
<p>Здравствуйте, <b>{candidate_name}</b>!</p>
<p>Благодарим вас за интерес к позиции <b>{vacancy_name}</b> и время, уделённое нашим встречам.</p>
<p>К сожалению, на данном этапе мы приняли решение продолжить поиск другого кандидата. Мы сохраним ваше резюме и свяжемся с вами, если появятся подходящие вакансии.</p>
<p>Желаем вам успехов в карьере!</p>
<p style="margin-top:24px;color:#64748b">С уважением,<br><b>{recruiter_name}</b></p>
</div>`,
  },
  {
    name: 'Первый контакт',
    type: 'custom',
    subject: 'Интересная вакансия для вас — {vacancy_name}',
    body_html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
<p>Здравствуйте, <b>{candidate_name}</b>!</p>
<p>Меня зовут <b>{recruiter_name}</b>, я занимаюсь подбором персонала.</p>
<p>Хочу предложить вам рассмотреть вакансию <b>{vacancy_name}</b>. Буду рад(а) рассказать подробнее об условиях и ответить на ваши вопросы.</p>
<p>Напишите мне в ответ, если вам интересно!</p>
<p style="margin-top:24px;color:#64748b">С уважением,<br><b>{recruiter_name}</b></p>
</div>`,
  },
];

async function _seedDefaultTemplates() {
  const rows = DEFAULT_TEMPLATES.map(t => ({ ...t, recruiter_id: S.currentUser.id }));
  await sb.from('email_templates').insert(rows);
}

// ── Load & render ─────────────────────────────────────────────────
export async function loadEmailTemplates() {
  const el = document.getElementById('email-templates-list');
  if (!el) return;

  const { data, error } = await sb.from('email_templates')
    .select('*')
    .eq('recruiter_id', S.currentUser.id)
    .order('created_at', { ascending: false });

  if (error) { el.innerHTML = `<p class="text-red-400 text-sm">${esc(error.message)}</p>`; return; }

  // Первый раз — засеваем встроенные шаблоны
  if (!data || data.length === 0) {
    await _seedDefaultTemplates();
    return loadEmailTemplates();
  }

  S._emailTemplatesCache = data;
  _renderEmailTemplates(el, data);
}

const TYPE_LABEL = { invite: '💌 Приглашение', rejection: '❌ Отказ', offer: '🎉 Оффер', custom: '📝 Прочее' };

function _renderEmailTemplates(el, list) {
  if (!list.length) {
    el.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">Нет email-шаблонов.</p>';
    return;
  }
  el.innerHTML = list.map(t => `
    <div class="border rounded-xl p-3 space-y-1.5">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <span class="font-semibold text-slate-700 text-sm">${esc(t.name)}</span>
          <span class="ml-2 text-xs text-indigo-500">${TYPE_LABEL[t.type] || t.type}</span>
          <p class="text-xs text-slate-400 truncate mt-0.5">📌 ${esc(t.subject)}</p>
        </div>
        <div class="flex gap-1 shrink-0">
          <button onclick="useEmailTemplate('${t.id}')" class="btn-sm btn-secondary text-xs py-1">📩 Применить</button>
          <button onclick="editEmailTemplate('${t.id}')" class="btn-sm btn-secondary text-xs py-1">✏️ Изменить</button>
          <button onclick="deleteEmailTemplate('${t.id}')" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
        </div>
      </div>
      <p class="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">${esc(_stripHtml(t.body_html))}</p>
    </div>
  `).join('');
}

function _stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ── Save ──────────────────────────────────────────────────────────
export async function saveEmailTemplate() {
  if (!canWrite()) { toast('Недостаточно прав (роль viewer)', 'err'); return; }
  const name     = document.getElementById('etmpl-name').value.trim();
  const type     = document.getElementById('etmpl-type').value;
  const subject  = document.getElementById('etmpl-subject').value.trim();
  const bodyText = document.getElementById('etmpl-body').value.trim();
  const editId   = document.getElementById('etmpl-edit-id')?.value;

  if (!name || !subject || !bodyText) {
    toast('Заполни название, тему и текст', 'err'); return;
  }

  // Wrap plain text in basic HTML div preserving newlines
  const bodyHtml = bodyText.includes('<') ? bodyText
    : `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">${bodyText.replace(/\n/g, '<br>')}</div>`;

  let error;
  if (editId) {
    ({ error } = await sb.from('email_templates').update({ name, type, subject, body_html: bodyHtml })
      .eq('id', editId).eq('recruiter_id', S.currentUser.id));
  } else {
    ({ error } = await sb.from('email_templates').insert({
      recruiter_id: S.currentUser.id, name, type, subject, body_html: bodyHtml,
    }));
  }
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  toast(editId ? 'Шаблон обновлён ✓' : 'Email-шаблон сохранён ✓');
  document.getElementById('etmpl-name').value    = '';
  document.getElementById('etmpl-subject').value = '';
  document.getElementById('etmpl-body').value    = '';
  if (document.getElementById('etmpl-edit-id')) document.getElementById('etmpl-edit-id').value = '';
  if (document.getElementById('etmpl-save-btn')) document.getElementById('etmpl-save-btn').textContent = '💾 Сохранить шаблон';
  await loadEmailTemplates();
}

// ── Edit (load into form) ─────────────────────────────────────────
export function editEmailTemplate(id) {
  const tmpl = (S._emailTemplatesCache || []).find(t => t.id === id);
  if (!tmpl) return;
  document.getElementById('etmpl-name').value    = tmpl.name;
  document.getElementById('etmpl-type').value    = tmpl.type;
  document.getElementById('etmpl-subject').value = tmpl.subject;
  document.getElementById('etmpl-body').value    = _stripHtml(tmpl.body_html);
  // Store id for update instead of insert
  document.getElementById('etmpl-edit-id').value = tmpl.id;
  document.getElementById('etmpl-save-btn').textContent = '💾 Сохранить изменения';
  document.getElementById('etmpl-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Шаблон «${tmpl.name}» загружен для редактирования`);
}

// ── Delete ────────────────────────────────────────────────────────
export async function deleteEmailTemplate(id) {
  if (!confirm('Удалить шаблон?')) return;
  await sb.from('email_templates').delete().eq('id', id);
  toast('Шаблон удалён');
  await loadEmailTemplates();
}

// ── Preview ───────────────────────────────────────────────────────
export function previewEmailTemplate() {
  const body = document.getElementById('etmpl-body').value.trim();
  if (!body) { toast('Введи текст шаблона', 'err'); return; }
  // Open preview in a new window
  const win = window.open('', '_blank', 'width=700,height=600');
  if (win) {
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Превью шаблона</title></head><body>${body}</body></html>`);
    win.document.close();
  }
}

// ── Use template in email modal ───────────────────────────────────
export function useEmailTemplate(id) {
  const tmpl = (S._emailTemplatesCache || []).find(t => t.id === id);
  if (!tmpl) return;

  // Pre-fill the email send modal if it's open, otherwise store for next open
  S._pendingEmailTemplate = tmpl;

  const subjectEl = document.getElementById('email-subject');
  const bodyEl    = document.getElementById('email-body-preview');

  if (subjectEl) subjectEl.value = tmpl.subject;
  if (bodyEl)    bodyEl.innerHTML = tmpl.body_html;

  toast(`Шаблон «${tmpl.name}» применён`);
}

// ── Load templates for email send dropdown ────────────────────────
export async function loadEmailTemplateDropdown() {
  const { data } = await sb.from('email_templates')
    .select('id, name, type, subject, body_html')
    .eq('recruiter_id', S.currentUser.id)
    .order('created_at', { ascending: false });

  S._emailTemplatesCache = data || [];
  _renderEmailTemplateDropdown(data || []);
}

function _renderEmailTemplateDropdown(list) {
  const sel = document.getElementById('email-template-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— использовать шаблон —</option>' +
    list.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  sel.classList.toggle('hidden', list.length === 0);
}
