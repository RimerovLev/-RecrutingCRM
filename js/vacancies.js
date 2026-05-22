import { sb, VAC_STATUS_BADGE, VAC_STATUS_LABEL } from './config.js';
import { S } from './state.js';
import { esc, money, toast, openModal, closeModal } from './utils.js';
import { isOnline, LS, cacheSet, cacheGet } from './offline.js';

export async function loadVacancies() {
  let data, error;
  if (!isOnline) {
    data = cacheGet(LS.vacancies + '_' + S.currentUser.id) || [];
  } else {
    ({ data, error } = await sb.from('vacancies')
      .select('*, candidacies(count)').eq('recruiter_id', S.currentUser.id)
      .order('created_at', { ascending: false }));
    if (error) {
      data = cacheGet(LS.vacancies + '_' + S.currentUser.id) || [];
      if (data.length) toast('📴 Нет сети — показаны кэшированные данные', 'warn');
      else { toast('Ошибка загрузки вакансий', 'err'); return; }
    } else {
      cacheSet(LS.vacancies + '_' + S.currentUser.id, data || []);
    }
  }
  S.allVacancies = data || [];
  renderVacancies(S.allVacancies);
}

export function renderVacancies(list) {
  const grid = document.getElementById('vac-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="col-span-3 card p-10 text-center text-slate-400">Нет вакансий</div>';
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  grid.innerHTML = list.map(v => {
    const open = v.status === 'open';
    const badgeCls = VAC_STATUS_BADGE[v.status] || 'bg-slate-100 text-slate-500';
    const badgeLbl = VAC_STATUS_LABEL[v.status] || v.status;

    const candCount = v.candidacies?.[0]?.count ?? null;

    let deadlineHtml = '';
    if (v.deadline) {
      const dl = new Date(v.deadline);
      const overdue = dl < today;
      const dlStr = dl.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      deadlineHtml = `<span class="text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}">⏰ до ${dlStr}</span>`;
    }

    let headcountHtml = '';
    if (v.headcount) {
      const hired = candCount !== null ? Math.min(candCount, v.headcount) : '?';
      headcountHtml = `<span class="text-xs text-slate-400">👥 ${hired}/${v.headcount}</span>`;
    } else if (candCount !== null) {
      headcountHtml = `<span class="text-xs text-slate-400">👤 ${candCount} канд.</span>`;
    }

    return `<div class="card p-5 flex flex-col gap-3">
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-slate-800 leading-tight">${esc(v.title)}</h3>
          ${v.department ? `<p class="text-xs text-slate-400 mt-0.5">${esc(v.department)}</p>` : ''}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${badgeCls}">${badgeLbl}</span>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1">
        ${(v.salary_min||v.salary_max) ? `<span class="text-xs text-slate-500">💰 ${money(v.salary_min)} — ${money(v.salary_max)}</span>` : ''}
        ${deadlineHtml}
        ${headcountHtml}
      </div>
      ${v.description ? `<p class="text-slate-600 text-xs line-clamp-2">${esc(v.description)}</p>` : ''}
      ${v.notes ? `<div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">📝 ${esc(v.notes)}</div>` : ''}
      <div class="flex flex-wrap gap-1.5 mt-auto pt-1 border-t border-slate-100">
        <button onclick="openKanban('${v.id}','${esc(v.title)}')" class="btn-primary btn-sm flex-1">📋 Канбан</button>
        <button onclick="openVacancyModal('${v.id}')"             class="btn-secondary btn-sm px-2.5 admin-only" title="Редактировать">✏️</button>
        <button onclick="toggleVacStatus('${v.id}','${v.status}')" class="btn-secondary btn-sm admin-only">
          ${open ? '🔒 Закрыть' : '🔓 Открыть'}
        </button>
        <button onclick="deleteVacancy('${v.id}','${esc(v.title)}')" class="btn-secondary btn-sm px-2.5 hover:bg-red-50 hover:text-red-500 admin-only" title="Удалить">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

export async function openVacancyModal(id = null) {
  const form = document.getElementById('form-vacancy');
  form.reset();
  document.getElementById('vac-id').value = id || '';
  document.getElementById('vac-modal-title').textContent = id ? 'Редактировать вакансию' : 'Создать вакансию';
  if (id) {
    const v = S.allVacancies.find(x => x.id === id);
    if (v) {
      document.getElementById('v-title').value     = v.title || '';
      document.getElementById('v-desc').value      = v.description || '';
      document.getElementById('v-req').value       = v.requirements || '';
      document.getElementById('v-sal-min').value   = v.salary_min || '';
      document.getElementById('v-sal-max').value   = v.salary_max || '';
      document.getElementById('v-status').value    = v.status || 'open';
      document.getElementById('v-notes').value     = v.notes || '';
      document.getElementById('v-dept').value      = v.department || '';
      document.getElementById('v-headcount').value = v.headcount || '';
      document.getElementById('v-deadline').value  = v.deadline || '';
    }
  }
  openModal('modal-vacancy');
}

export async function saveVacancy(e) {
  e.preventDefault();
  const id = document.getElementById('vac-id').value;
  const payload = {
    title:        document.getElementById('v-title').value.trim(),
    description:  document.getElementById('v-desc').value.trim() || null,
    requirements: document.getElementById('v-req').value.trim() || null,
    salary_min:   parseInt(document.getElementById('v-sal-min').value) || null,
    salary_max:   parseInt(document.getElementById('v-sal-max').value) || null,
    status:       document.getElementById('v-status').value || 'open',
    notes:        document.getElementById('v-notes').value.trim() || null,
    department:   document.getElementById('v-dept').value.trim() || null,
    headcount:    parseInt(document.getElementById('v-headcount').value) || null,
    deadline:     document.getElementById('v-deadline').value || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('vacancies').update(payload).eq('id', id));
  } else {
    payload.recruiter_id = S.currentUser.id;
    payload.status = 'open';
    ({ error } = await sb.from('vacancies').insert(payload));
  }
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast(id ? 'Вакансия обновлена ✓' : 'Вакансия создана ✓');
  closeModal('modal-vacancy');
  loadVacancies();
}

export async function toggleVacStatus(id, current) {
  const next = current === 'open' ? 'closed' : 'open';
  const { error } = await sb.from('vacancies').update({ status: next }).eq('id', id);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast(`Вакансия ${next === 'open' ? 'открыта' : 'закрыта'}`);
  loadVacancies();
}

export async function deleteVacancy(id, title) {
  if (!confirm(`Удалить вакансию «${title}»?`)) return;
  const { data: linked } = await sb.from('candidacies').select('id').eq('vacancy_id', id);
  if (linked?.length > 0 && !confirm(`К вакансии привязано ${linked.length} кандидатов. Удалить всё равно?`)) return;
  const { error } = await sb.from('vacancies').delete().eq('id', id);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Вакансия удалена');
  loadVacancies();
}
