import { sb, EMAIL_FROM } from './config.js';
import { S } from './state.js';
import { esc, toast, openModal, closeModal } from './utils.js';

export async function openEmailModal(candidateId, type) {
  const c = S.allCandidates.find(x => x.id === candidateId);
  if (!c) { toast('Кандидат не найден', 'err'); return; }
  if (!c.email) { toast('У кандидата не указан email', 'err'); return; }

  const labels = { invitation: '📩 Приглашение на собеседование', offer: '🎉 Оффер', rejection: '❌ Отказ' };
  const descs  = {
    invitation: `Отправить ${c.full_name} (${c.email}) приглашение на собеседование?`,
    offer:      `Отправить ${c.full_name} (${c.email}) предложение о работе (оффер)?`,
    rejection:  `Отправить ${c.full_name} (${c.email}) уведомление об отказе?`,
  };
  document.getElementById('email-modal-title').textContent = labels[type] || 'Отправить письмо';
  document.getElementById('email-modal-desc').textContent  = descs[type] || '';
  // Clear subject override
  const subjectEl = document.getElementById('email-subject');
  if (subjectEl) subjectEl.value = '';
  S.pendingEmail = { candidate: c, type };
  // Load saved templates into dropdown
  try {
    await window.loadEmailTemplateDropdown?.();
  } catch {}
  openModal('modal-email');
}

function _applyTemplateVars(html, vars) {
  return html
    .replace(/{candidate_name}/g, esc(vars.candidateName))
    .replace(/{vacancy_name}/g, esc(vars.vacancyName))
    .replace(/{recruiter_name}/g, esc(vars.recruiterName));
}

export function _buildEmailHtml(type, toName, recruiterName, vacancyName) {
  const base = `font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b`;
  const n = esc(toName);
  const v = esc(vacancyName);
  const r = esc(recruiterName);
  const bodies = {
    invitation: `<p>Здравствуйте, <b>${n}</b>!</p>
      <p>Мы рассмотрели ваше резюме и приглашаем вас на собеседование на позицию <b>${v}</b>.</p>
      <p>Пожалуйста, ответьте на это письмо, чтобы согласовать удобное время.</p>`,
    offer: `<p>Здравствуйте, <b>${n}</b>!</p>
      <p>Мы рады сообщить, что вам предложена позиция <b>${v}</b>.</p>
      <p>Пожалуйста, свяжитесь с нами для обсуждения деталей оффера.</p>`,
    rejection: `<p>Здравствуйте, <b>${n}</b>!</p>
      <p>Спасибо за интерес к позиции <b>${v}</b> и потраченное время.</p>
      <p>К сожалению, на данный момент мы не готовы сделать вам предложение. Желаем удачи в поисках!</p>`,
  };
  return `<div style="${base}">
    ${bodies[type] || '<p>—</p>'}
    <p style="margin-top:24px;color:#64748b">С уважением,<br><b>${r}</b></p>
  </div>`;
}

// Apply chosen template from the dropdown in email modal
export function applyEmailTemplateFromSel(templateId) {
  if (!templateId) return;
  const tmpl = (S._emailTemplatesCache || []).find(t => t.id === templateId);
  if (!tmpl) return;
  const subjectEl = document.getElementById('email-subject');
  if (subjectEl) subjectEl.value = tmpl.subject;
  S._pendingEmailTemplate = tmpl;
  toast(`Шаблон «${tmpl.name}» выбран`);
}

export async function confirmSendEmail() {
  if (!S.pendingEmail) return;
  const { candidate: c, type } = S.pendingEmail;
  const recruiterName = S.currentProfile?.full_name || S.currentUser.email;
  const vacancyName   = S.currentVacTitle || 'Открытая вакансия';

  const defaults = {
    invitation: `Приглашение на собеседование — ${vacancyName}`,
    offer:      `Предложение о работе — ${vacancyName}`,
    rejection:  `Результат рассмотрения вашей кандидатуры`,
  };

  // Use saved template if selected, otherwise builtin
  let subject, html;
  const savedTmpl    = S._pendingEmailTemplate;
  const subjectInput = document.getElementById('email-subject')?.value.trim();

  if (savedTmpl) {
    subject = subjectInput || savedTmpl.subject;
    html = _applyTemplateVars(savedTmpl.body_html, {
      candidateName: c.full_name,
      vacancyName,
      recruiterName,
    });
  } else {
    subject = subjectInput || defaults[type] || 'Письмо от рекрутера';
    html    = _buildEmailHtml(type, c.full_name, recruiterName, vacancyName);
  }

  try {
    const { error } = await sb.functions.invoke('send-email', {
      body: { from: EMAIL_FROM, to: c.email, subject, html },
    });
    if (error) throw error;
    toast('Письмо отправлено ✓');
    closeModal('modal-email');
  } catch (err) {
    toast('Ошибка отправки: ' + (err.message || JSON.stringify(err)), 'err');
  }
  S.pendingEmail          = null;
  S._pendingEmailTemplate = null;
}
