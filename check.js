
'use strict';

/* ──────────────────────────────────────────────────────────────────────
   ██████  CONFIG  ██████
   Замените значения ниже своими ключами.
   ──────────────────────────────────────────────────────────────────── */

// ① Supabase  →  app.supabase.com  →  ваш проект  →  Settings → API
const SUPABASE_URL      = 'https://xbqunyukacahlotbgrma.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhicXVueXVrYWNhaGxvdGJncm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzExMDIsImV4cCI6MjA5NDg0NzEwMn0.v63tntbHumEOe3I7oHus1TAmo-D8mWJVhkTZLiK-UA4';               // ← ЗАМЕНИТЬ

// ② EmailJS  →  https://www.emailjs.com
//    Создайте Email Service (Gmail / Outlook / …) и 3 шаблона.
//    Переменные в шаблонах: {{to_name}}, {{to_email}},
//                           {{recruiter_name}}, {{vacancy_name}}
const EMAILJS_PUBLIC_KEY         = 'YOUR_EMAILJS_PUBLIC_KEY';        // ← ЗАМЕНИТЬ
const EMAILJS_SERVICE_ID         = 'YOUR_SERVICE_ID';                // ← ЗАМЕНИТЬ
const EMAILJS_TMPL_INVITATION    = 'YOUR_TEMPLATE_INVITATION';       // ← ЗАМЕНИТЬ
const EMAILJS_TMPL_OFFER         = 'YOUR_TEMPLATE_OFFER';            // ← ЗАМЕНИТЬ
const EMAILJS_TMPL_REJECTION     = 'YOUR_TEMPLATE_REJECTION';        // ← ЗАМЕНИТЬ

/* ──────────────────────────────────────────────────────────────────────
   ИНИЦИАЛИЗАЦИЯ
   ──────────────────────────────────────────────────────────────────── */
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
emailjs.init(EMAILJS_PUBLIC_KEY);

/* ──────────────────────────────────────────────────────────────────────
   СОСТОЯНИЕ
   ──────────────────────────────────────────────────────────────────── */
let currentUser    = null;
let currentProfile = null;
let allCandidates  = [];
let allVacancies   = [];
let currentVacId   = null;
let currentVacTitle = '';
let pendingEmail   = null;  // { candidate, type }
let stagesChart    = null;

const STAGES = ['Новый', 'Собеседование', 'Оффер', 'Принят', 'Отказ'];

// ── Сортировка и выбор ─────────────────────────────────────────────
let sortField = null;
let sortDir   = 1;   // 1 = asc, -1 = desc
let selectedIds = new Set();

const STATUS_LABELS = { active: 'Активный', in_work: 'В работе', archive: 'Архив' };
const STATUS_BADGE  = { active: 'badge-active', in_work: 'badge-in_work', archive: 'badge-archive' };

// ── Сортировка ────────────────────────────────────────────────────
function sortBy(field) {
  if (sortField === field) sortDir *= -1;
  else { sortField = field; sortDir = 1; }
  document.querySelectorAll('.sort-icon').forEach(el => el.classList.remove('asc','desc'));
  const icon = document.querySelector(`.sort-icon[data-col="${field}"]`);
  if (icon) icon.classList.add(sortDir === 1 ? 'asc' : 'desc');
  filterCandidates();
}

// ── Массовый выбор ────────────────────────────────────────────────
function toggleSelect(id, el) {
  if (el.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkBar();
}

function toggleSelectAll(el) {
  const checkboxes = document.querySelectorAll('.row-check');
  checkboxes.forEach(cb => {
    cb.checked = el.checked;
    if (el.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
  });
  updateBulkBar();
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
  const sa = document.getElementById('select-all');
  if (sa) sa.checked = false;
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if (selectedIds.size > 0) {
    bar.classList.remove('hidden');
    cnt.textContent = `Выбрано: ${selectedIds.size}`;
  } else {
    bar.classList.add('hidden');
  }
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`Удалить ${selectedIds.size} кандидатов?`)) return;
  const ids = [...selectedIds];
  const { error } = await sb.from('candidates').delete().in('id', ids);
  if (error) { toast('Ошибка удаления: ' + error.message, 'err'); return; }
  toast(`Удалено: ${ids.length}`);
  clearSelection();
  loadCandidates();
}

function openBulkVacancyModal() {
  const list = document.getElementById('bulk-vac-list');
  if (!allVacancies.length) {
    list.innerHTML = '<p class="text-slate-400 text-center py-6">Нет вакансий</p>';
  } else {
    list.innerHTML = allVacancies.filter(v => v.status === 'open').map(v => `
      <button onclick="bulkAssignVacancy('${v.id}')"
        class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
        <div class="font-semibold text-slate-800">${esc(v.title)}</div>
      </button>`).join('');
  }
  openModal('modal-bulk-vacancy');
}

async function bulkAssignVacancy(vacId) {
  const ids = [...selectedIds];
  let ok = 0, skip = 0;
  for (const candId of ids) {
    const { error } = await sb.from('candidacies').insert({
      candidate_id: candId, vacancy_id: vacId, current_stage: 'Новый'
    });
    error ? skip++ : ok++;
  }
  toast(`Добавлено в вакансию: ${ok}${skip ? `, уже привязаны: ${skip}` : ''}`);
  closeModal('modal-bulk-vacancy');
  clearSelection();
}

// ── Закрепление ───────────────────────────────────────────────────
async function togglePin(id, current) {
  const { error } = await sb.from('candidates').update({ is_pinned: !current }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadCandidates();
}

// ── Статус кандидата ──────────────────────────────────────────────
async function setStatus(id, status) {
  const { error } = await sb.from('candidates').update({ status }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  toast('Статус обновлён');
  loadCandidates();
}

// ── Фильтры ───────────────────────────────────────────────────────
function toggleFilters() {
  const panel = document.getElementById('filters-panel');
  const btn   = document.getElementById('filters-toggle-btn');
  const open  = panel.classList.toggle('hidden');
  btn.classList.toggle('btn-primary', !open);
  btn.classList.toggle('btn-secondary', open);
}

function resetFilters() {
  document.getElementById('search-name').value     = '';
  document.getElementById('search-position').value = '';
  document.getElementById('filter-status').value   = '';
  document.getElementById('filter-car').value      = '';
  document.getElementById('filter-district').value = '';
  document.getElementById('filter-date').value     = '';
  sortField = null; sortDir = 1;
  document.querySelectorAll('.sort-icon').forEach(el => el.classList.remove('asc','desc'));
  filterCandidates();
}

/* ──────────────────────────────────────────────────────────────────────
   УТИЛИТЫ
   ──────────────────────────────────────────────────────────────────── */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function money(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

function toast(msg, type = 'ok') {
  const colors = { ok:'bg-emerald-600', err:'bg-red-600', info:'bg-indigo-600' };
  const el = document.createElement('div');
  el.className = `toast-enter pointer-events-auto ${colors[type]||colors.ok} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg max-w-xs`;
  el.textContent = msg;
  const c = document.getElementById('toast-container');
  c.appendChild(el);
  setTimeout(() => { el.classList.remove('toast-enter'); el.classList.add('toast-leave'); }, 3400);
  setTimeout(() => el.remove(), 3800);
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

/* ──────────────────────────────────────────────────────────────────────
   АУТЕНТИФИКАЦИЯ
   ──────────────────────────────────────────────────────────────────── */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('auth-login').classList.toggle('hidden', !isLogin);
  document.getElementById('auth-register').classList.toggle('hidden', isLogin);
  const activeClass  = 'font-semibold text-indigo-600 border-b-2 border-indigo-600';
  const idleClass    = 'font-semibold text-slate-400 border-b-2 border-transparent';
  document.getElementById('auth-tab-login').className    = isLogin  ? activeClass : idleClass;
  document.getElementById('auth-tab-register').className = !isLogin ? activeClass : idleClass;
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { toast('Ошибка входа: ' + error.message, 'err'); return; }
  currentUser = data.user;
  await loadProfile();
  showApp();
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Аккаунт создан! Проверьте email для подтверждения.', 'info');
  switchAuthTab('login');
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = currentProfile = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-page').classList.remove('hidden');
}

async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !data) {
    // Create profile manually (trigger may not have fired yet)
    const name = currentUser.user_metadata?.full_name || currentUser.email;
    const { data: np } = await sb.from('profiles').upsert({
      id: currentUser.id, full_name: name, role: 'recruiter'
    }, { onConflict: 'id' }).select().single();
    currentProfile = np;
  } else {
    currentProfile = data;
  }
  document.getElementById('user-display').textContent =
    currentProfile?.full_name || currentUser.email;
}

function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  showView('dashboard');
}

/* ──────────────────────────────────────────────────────────────────────
   НАВИГАЦИЯ
   ──────────────────────────────────────────────────────────────────── */
function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (btn) btn.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  else if (name === 'candidates') loadCandidates();
  else if (name === 'vacancies') loadVacancies();
  else if (name === 'reminders') loadReminders();
  // 'kanban' is opened separately via openKanban()
}

/* ──────────────────────────────────────────────────────────────────────
   КАНДИДАТЫ
   ──────────────────────────────────────────────────────────────────── */
async function loadCandidates() {
  const { data, error } = await sb.from('candidates')
    .select('*').eq('recruiter_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { toast('Ошибка загрузки кандидатов', 'err'); return; }
  allCandidates = data || [];
  renderCandidates(allCandidates);
}

function renderCandidates(list) {
  const tbody = document.getElementById('cand-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="py-10 text-center text-slate-400">Нет кандидатов</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => {
    // Авто badge
    const carBadge = c.has_car === 'Да'
      ? '<span class="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">✅ Да</span>'
      : c.has_car === 'Нет'
        ? '<span class="bg-red-50 text-red-400 text-xs px-2 py-0.5 rounded-full">✗ Нет</span>'
        : '<span class="text-slate-300">—</span>';

    const status    = c.status || 'active';
    const statusLbl = STATUS_LABELS[status] || status;
    const statusCls = STATUS_BADGE[status]  || 'badge-active';
    const pinned    = c.is_pinned;
    const checked   = selectedIds.has(c.id) ? 'checked' : '';

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
        <div class="font-semibold text-slate-800">${esc(c.full_name)}</div>
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
      <td class="px-4 py-3 text-slate-700 whitespace-nowrap">${esc(c.position||'—')}</td>
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
          <button onclick="openCandidateModal('${c.id}')" title="Редактировать" class="action-btn text-blue-500">✏️</button>
          <button onclick="deleteCandidate('${c.id}','${esc(c.full_name)}')" title="Удалить" class="action-btn text-red-400">🗑️</button>
          <button onclick="openCommentsModal('${c.id}','${esc(c.full_name)}')" title="Комментарии" class="action-btn text-slate-500">💬</button>
          <button onclick="openReminderModal('${c.id}')" title="Напоминание" class="action-btn text-amber-500">🔔</button>
          <button onclick="openEmailModal('${c.id}','invitation')" title="Приглашение" class="action-btn text-emerald-500">📩</button>
          <button onclick="openEmailModal('${c.id}','offer')"      title="Оффер"       class="action-btn text-purple-500">🎉</button>
          <button onclick="openEmailModal('${c.id}','rejection')"  title="Отказ"       class="action-btn text-red-400">❌</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterCandidates() {
  const nameQ    = document.getElementById('search-name').value.toLowerCase();
  const posQ     = document.getElementById('search-position').value.toLowerCase();
  const statusQ  = document.getElementById('filter-status')?.value   || '';
  const carQ     = document.getElementById('filter-car')?.value      || '';
  const distQ    = document.getElementById('filter-district')?.value.toLowerCase() || '';
  const dateQ    = document.getElementById('filter-date')?.value     || '';

  let list = allCandidates.filter(c => {
    if (nameQ   && !c.full_name.toLowerCase().includes(nameQ)) return false;
    if (posQ    && !(
      (c.position||'').toLowerCase().includes(posQ) ||
      (c.district_residence||'').toLowerCase().includes(posQ) ||
      (c.district_work||'').toLowerCase().includes(posQ) ||
      (c.resume_source||'').toLowerCase().includes(posQ)
    )) return false;
    if (statusQ && (c.status || 'active') !== statusQ) return false;
    if (carQ    && c.has_car !== carQ) return false;
    if (distQ   && !(c.district_residence||'').toLowerCase().includes(distQ)) return false;
    if (dateQ   && c.created_at && c.created_at.slice(0,10) < dateQ) return false;
    return true;
  });

  // Sort: pinned first, then by sortField
  list.sort((a, b) => {
    if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
    if (!sortField) return 0;
    const av = (a[sortField] || '').toString().toLowerCase();
    const bv = (b[sortField] || '').toString().toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });

  renderCandidates(list);
}

async function openCandidateModal(id = null) {
  const form = document.getElementById('form-candidate');
  form.reset();
  document.getElementById('c-resume-hint').textContent = '';
  document.getElementById('cand-id').value = id || '';
  document.getElementById('cand-modal-title').textContent = id ? 'Редактировать кандидата' : 'Добавить кандидата';

  if (id) {
    const c = allCandidates.find(x => x.id === id);
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
      if (c.resume_url && c.resume_url.includes('supabase')) {
        document.getElementById('c-resume-hint').textContent =
          'Загружен файл: ' + decodeURIComponent(c.resume_url.split('/').pop().replace(/^\d+_/, ''));
      }
    }
  }
  openModal('modal-candidate');
}

async function saveCandidate(e) {
  e.preventDefault();
  const id = document.getElementById('cand-id').value;
  const skills = document.getElementById('c-skills').value
    .split(',').map(s => s.trim()).filter(Boolean);

  // Upload resume if selected
  let resumeUrl = undefined;
  const file = document.getElementById('c-resume').files[0];
  if (file) {
    const path = `${currentUser.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('resumes').upload(path, file, { upsert: true });
    if (upErr) { toast('Ошибка загрузки резюме: ' + upErr.message, 'err'); return; }
    const { data: urlData } = sb.storage.from('resumes').getPublicUrl(path);
    resumeUrl = urlData.publicUrl;
  }

  // If no file uploaded, use manual URL field
  if (resumeUrl === undefined) {
    const manualLink = document.getElementById('c-resume-link').value.trim();
    if (manualLink) resumeUrl = manualLink;
  }

  const fullName = document.getElementById('c-name').value.trim();
  const phone    = document.getElementById('c-phone').value.trim() || null;
  const editId   = document.getElementById('cand-id').value;

  // ── Проверка дубликатов ──────────────────────────────────────────
  const dupByName  = allCandidates.find(c => c.id !== editId && c.full_name.toLowerCase() === fullName.toLowerCase());
  const dupByPhone = phone && allCandidates.find(c => c.id !== editId && c.phone === phone);
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
  };
  if (resumeUrl !== undefined) payload.resume_url = resumeUrl;

  let error;
  if (id) {
    ({ error } = await sb.from('candidates').update(payload).eq('id', id));
  } else {
    payload.recruiter_id = currentUser.id;
    ({ error } = await sb.from('candidates').insert(payload));
  }
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  toast(id ? 'Кандидат обновлён ✓' : 'Кандидат добавлен ✓');
  closeModal('modal-candidate');
  loadCandidates();
}

async function deleteCandidate(id, name) {
  if (!confirm(`Удалить кандидата «${name}»?`)) return;
  const { error } = await sb.from('candidates').delete().eq('id', id);
  if (error) { toast('Ошибка удаления: ' + error.message, 'err'); return; }
  toast('Кандидат удалён');
  loadCandidates();
}

/* ──────────────────────────────────────────────────────────────────────
   ВАКАНСИИ
   ──────────────────────────────────────────────────────────────────── */
async function loadVacancies() {
  const { data, error } = await sb.from('vacancies')
    .select('*').eq('recruiter_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { toast('Ошибка загрузки вакансий', 'err'); return; }
  allVacancies = data || [];
  renderVacancies(allVacancies);
}

function renderVacancies(list) {
  const grid = document.getElementById('vac-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="col-span-3 card p-10 text-center text-slate-400">Нет вакансий</div>';
    return;
  }
  grid.innerHTML = list.map(v => {
    const open = v.status === 'open';
    return `<div class="card p-5 flex flex-col gap-3">
      <div class="flex items-start gap-2">
        <h3 class="font-bold text-slate-800 flex-1 leading-tight">${esc(v.title)}</h3>
        <span class="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
          ${open ? 'Открыта' : 'Закрыта'}
        </span>
      </div>
      ${(v.salary_min||v.salary_max) ? `<p class="text-slate-500 text-xs">💰 ${money(v.salary_min)} — ${money(v.salary_max)}</p>` : ''}
      ${v.description ? `<p class="text-slate-600 text-xs line-clamp-2">${esc(v.description)}</p>` : ''}
      ${v.notes ? `<div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">📝 ${esc(v.notes)}</div>` : ''}
      <div class="flex flex-wrap gap-1.5 mt-auto pt-1 border-t border-slate-100">
        <button onclick="openKanban('${v.id}','${esc(v.title)}')" class="btn-primary btn-sm flex-1">📋 Канбан</button>
        <button onclick="openVacancyModal('${v.id}')"             class="btn-secondary btn-sm px-2.5" title="Редактировать">✏️</button>
        <button onclick="toggleVacStatus('${v.id}','${v.status}')" class="btn-secondary btn-sm">
          ${open ? '🔒 Закрыть' : '🔓 Открыть'}
        </button>
        <button onclick="deleteVacancy('${v.id}','${esc(v.title)}')" class="btn-secondary btn-sm px-2.5 hover:bg-red-50 hover:text-red-500" title="Удалить">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

async function openVacancyModal(id = null) {
  const form = document.getElementById('form-vacancy');
  form.reset();
  document.getElementById('vac-id').value = id || '';
  document.getElementById('vac-modal-title').textContent = id ? 'Редактировать вакансию' : 'Создать вакансию';
  if (id) {
    const v = allVacancies.find(x => x.id === id);
    if (v) {
      document.getElementById('v-title').value   = v.title || '';
      document.getElementById('v-desc').value    = v.description || '';
      document.getElementById('v-req').value     = v.requirements || '';
      document.getElementById('v-sal-min').value = v.salary_min || '';
      document.getElementById('v-sal-max').value = v.salary_max || '';
      document.getElementById('v-notes').value   = v.notes || '';
    }
  }
  openModal('modal-vacancy');
}

async function saveVacancy(e) {
  e.preventDefault();
  const id = document.getElementById('vac-id').value;
  const payload = {
    title:        document.getElementById('v-title').value.trim(),
    description:  document.getElementById('v-desc').value.trim() || null,
    requirements: document.getElementById('v-req').value.trim() || null,
    salary_min:   parseInt(document.getElementById('v-sal-min').value) || null,
    salary_max:   parseInt(document.getElementById('v-sal-max').value) || null,
    notes:        document.getElementById('v-notes').value.trim() || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('vacancies').update(payload).eq('id', id));
  } else {
    payload.recruiter_id = currentUser.id;
    payload.status = 'open';
    ({ error } = await sb.from('vacancies').insert(payload));
  }
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast(id ? 'Вакансия обновлена ✓' : 'Вакансия создана ✓');
  closeModal('modal-vacancy');
  loadVacancies();
}

async function toggleVacStatus(id, current) {
  const next = current === 'open' ? 'closed' : 'open';
  const { error } = await sb.from('vacancies').update({ status: next }).eq('id', id);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast(`Вакансия ${next === 'open' ? 'открыта' : 'закрыта'}`);
  loadVacancies();
}

async function deleteVacancy(id, title) {
  if (!confirm(`Удалить вакансию «${title}»?`)) return;
  const { data: linked } = await sb.from('candidacies').select('id').eq('vacancy_id', id);
  if (linked?.length > 0 && !confirm(`К вакансии привязано ${linked.length} кандидатов. Удалить всё равно?`)) return;
  const { error } = await sb.from('vacancies').delete().eq('id', id);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Вакансия удалена');
  loadVacancies();
}

/* ──────────────────────────────────────────────────────────────────────
   КАНБАН
   ──────────────────────────────────────────────────────────────────── */
async function openKanban(vacId, vacTitle) {
  currentVacId    = vacId;
  currentVacTitle = vacTitle;
  document.getElementById('kanban-vac-title').textContent = vacTitle;
  showView('kanban');
  await loadKanban();
}

async function loadKanban() {
  const { data, error } = await sb.from('candidacies')
    .select('id, current_stage, created_at, candidates(id, full_name, email, phone, salary_expectation, skills)')
    .eq('vacancy_id', currentVacId);
  if (error) { toast('Ошибка загрузки канбана', 'err'); return; }
  renderKanban(data || []);
}

function renderKanban(items) {
  const board = document.getElementById('kanban-board');
  board.innerHTML = STAGES.map(stage => {
    const cards = items.filter(x => x.current_stage === stage);
    const stageIdx = STAGES.indexOf(stage);
    const prevStage = STAGES[stageIdx - 1] || null;
    const nextStage = STAGES[stageIdx + 1] || null;

    const cardHtml = cards.map(item => {
      const c = item.candidates || {};
      return `<div class="kanban-card rounded-xl border p-3 stage-border-${stage}">
        <div class="font-semibold text-slate-800 leading-tight mb-1">${esc(c.full_name)}</div>
        ${c.email  ? `<div class="text-xs text-slate-500 truncate">${esc(c.email)}</div>` : ''}
        ${c.salary_expectation ? `<div class="text-xs text-slate-400">${money(c.salary_expectation)}</div>` : ''}
        <div class="flex flex-wrap gap-1 mt-2">
          ${prevStage ? `<button onclick="moveStage('${item.id}','${stage}','${prevStage}')"
              class="text-xs bg-white border border-slate-200 hover:bg-slate-50 px-2 py-0.5 rounded transition">← ${prevStage}</button>` : ''}
          ${nextStage ? `<button onclick="moveStage('${item.id}','${stage}','${nextStage}')"
              class="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded transition">${nextStage} →</button>` : ''}
        </div>
        <div class="flex gap-2 mt-2 pt-2 border-t border-slate-100">
          <button onclick="openHistoryModal('${item.id}','${esc(c.full_name)}')" class="text-xs text-slate-400 hover:text-slate-600">📜 История</button>
          <button onclick="openCommentsModal('${c.id}','${esc(c.full_name)}')"   class="text-xs text-slate-400 hover:text-slate-600">💬 Комм.</button>
          <button onclick="openEmailModal('${c.id}','invitation')"               class="text-xs text-slate-400 hover:text-emerald-600">📩</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="flex-shrink-0 w-52">
      <div class="stage-${stage} text-white text-xs font-bold px-3 py-2 rounded-t-xl flex justify-between items-center">
        <span>${stage}</span>
        <span class="bg-white/30 rounded-full px-1.5">${cards.length}</span>
      </div>
      <div class="bg-slate-50 border border-t-0 border-slate-200 rounded-b-xl p-2 min-h-[6rem] space-y-2">
        ${cardHtml || '<p class="text-xs text-slate-400 text-center py-4">Пусто</p>'}
      </div>
    </div>`;
  }).join('');
}

async function moveStage(candidacyId, from, to) {
  const { error } = await sb.from('candidacies').update({ current_stage: to }).eq('id', candidacyId);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  await sb.from('stage_history').insert({
    candidacy_id: candidacyId,
    from_stage: from,
    to_stage: to,
    changed_by: currentUser.id,
  });
  toast(`${from} → ${to}`);
  loadKanban();
}

/* ──────────────────────────────────────────────────────────────────────
   ПРИВЯЗКА КАНДИДАТА К ВАКАНСИИ
   ──────────────────────────────────────────────────────────────────── */
let _linkAvailable = [];

async function openLinkModal() {
  // Find candidates not yet in this vacancy
  const { data: linked } = await sb.from('candidacies').select('candidate_id').eq('vacancy_id', currentVacId);
  const linkedIds = (linked||[]).map(x => x.candidate_id);
  _linkAvailable = allCandidates.filter(c => !linkedIds.includes(c.id));
  document.getElementById('link-search').value = '';
  renderLinkList(_linkAvailable);
  openModal('modal-link');
}

function renderLinkList(list) {
  const el = document.getElementById('link-list');
  if (!list.length) {
    el.innerHTML = '<p class="text-slate-400 text-center py-6 text-xs">Нет доступных кандидатов</p>';
    return;
  }
  el.innerHTML = list.map(c => `
    <button onclick="linkCandidate('${c.id}')"
      class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
      <div class="font-semibold text-slate-800">${esc(c.full_name)}</div>
      <div class="text-xs text-slate-400">${esc(c.email||'')} · ${(c.skills||[]).slice(0,3).join(', ')}</div>
    </button>`).join('');
}

function filterLinkList() {
  const q = document.getElementById('link-search').value.toLowerCase();
  renderLinkList(_linkAvailable.filter(c =>
    c.full_name.toLowerCase().includes(q) ||
    (c.skills||[]).join(' ').toLowerCase().includes(q)));
}

async function linkCandidate(candidateId) {
  const { error } = await sb.from('candidacies').insert({
    candidate_id: candidateId,
    vacancy_id:   currentVacId,
    current_stage: 'Новый',
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }

  // Log initial stage
  const { data: ccy } = await sb.from('candidacies')
    .select('id').eq('candidate_id', candidateId).eq('vacancy_id', currentVacId).single();
  if (ccy) {
    await sb.from('stage_history').insert({
      candidacy_id: ccy.id, from_stage: null, to_stage: 'Новый', changed_by: currentUser.id
    });
  }
  toast('Кандидат привязан ✓');
  closeModal('modal-link');
  loadKanban();
}

/* ──────────────────────────────────────────────────────────────────────
   ИСТОРИЯ ЭТАПОВ
   ──────────────────────────────────────────────────────────────────── */
async function openHistoryModal(candidacyId, candidateName) {
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

/* ──────────────────────────────────────────────────────────────────────
   КОММЕНТАРИИ
   ──────────────────────────────────────────────────────────────────── */
async function openCommentsModal(candidateId, candidateName) {
  document.getElementById('comment-cand-id').value = candidateId;
  document.getElementById('comments-candidate-name').textContent = '💬 ' + (candidateName || 'Кандидат');
  document.getElementById('comment-text').value = '';
  await loadComments(candidateId);
  openModal('modal-comments');
}

async function loadComments(candidateId) {
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

async function addComment(e) {
  e.preventDefault();
  const candidateId = document.getElementById('comment-cand-id').value;
  const content = document.getElementById('comment-text').value.trim();
  if (!content) return;
  const { error } = await sb.from('comments').insert({
    candidate_id: candidateId, author_id: currentUser.id, content
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  document.getElementById('comment-text').value = '';
  loadComments(candidateId);
}

/* ──────────────────────────────────────────────────────────────────────
   НАПОМИНАНИЯ
   ──────────────────────────────────────────────────────────────────── */
async function loadReminders() {
  const { data, error } = await sb.from('reminders')
    .select('*, candidates(full_name)')
    .eq('recruiter_id', currentUser.id)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) { toast('Ошибка загрузки', 'err'); return; }
  renderReminders(data || []);
  updateReminderBadge(data || []);
}

function updateReminderBadge(data) {
  const active = data.filter(r => !r.is_done).length;
  const badge = document.getElementById('badge-reminders');
  badge.textContent = active;
  badge.classList.toggle('hidden', active === 0);
}

function renderReminders(list) {
  const el = document.getElementById('reminders-list');
  if (!list.length) {
    el.innerHTML = '<div class="card p-10 text-center text-slate-400">Нет напоминаний</div>';
    return;
  }
  const active = list.filter(r => !r.is_done);
  const done   = list.filter(r =>  r.is_done);
  const today  = new Date(); today.setHours(0,0,0,0);

  const renderItem = r => {
    const overdue = !r.is_done && r.due_date && new Date(r.due_date) < today;
    return `<div class="card p-4 flex items-center gap-4 ${r.is_done ? 'opacity-55' : ''}">
      <button onclick="toggleReminder('${r.id}',${r.is_done})"
        class="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition
               ${r.is_done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-400'}">
        ${r.is_done ? '✓' : ''}
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-slate-800 ${r.is_done ? 'line-through text-slate-400' : ''}">${esc(r.note)}</p>
        ${r.candidates ? `<p class="text-xs text-slate-500 mt-0.5">👤 ${esc(r.candidates.full_name)}</p>` : ''}
      </div>
      <div class="text-sm whitespace-nowrap ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}">
        ${fmtDay(r.due_date)} ${overdue ? '⚠️' : ''}
      </div>
      <button onclick="deleteReminder('${r.id}')" class="text-slate-300 hover:text-red-400 transition text-lg leading-none">×</button>
    </div>`;
  };

  el.innerHTML = '';
  if (active.length) el.innerHTML += `<h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Активные</h4>` + active.map(renderItem).join('');
  if (done.length)   el.innerHTML += `<h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">Выполненные</h4>` + done.map(renderItem).join('');
}

function openReminderModal(candidateId = null) {
  document.getElementById('rem-cand-id').value = candidateId || '';
  document.getElementById('rem-note').value = '';
  document.getElementById('rem-date').value = '';
  openModal('modal-reminder');
}

async function saveReminder(e) {
  e.preventDefault();
  const { error } = await sb.from('reminders').insert({
    recruiter_id: currentUser.id,
    candidate_id: document.getElementById('rem-cand-id').value || null,
    note:     document.getElementById('rem-note').value.trim(),
    due_date: document.getElementById('rem-date').value || null,
    is_done:  false,
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Напоминание создано ✓');
  closeModal('modal-reminder');
  loadReminders();
}

async function toggleReminder(id, isDone) {
  const { error } = await sb.from('reminders').update({ is_done: !isDone }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadReminders();
}

async function deleteReminder(id) {
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadReminders();
}

/* ──────────────────────────────────────────────────────────────────────
   EMAIL  (EmailJS)
   ──────────────────────────────────────────────────────────────────── */
function openEmailModal(candidateId, type) {
  const c = allCandidates.find(x => x.id === candidateId);
  if (!c) { toast('Кандидат не найден', 'err'); return; }
  if (!c.email) { toast('У кандидата не указан email', 'err'); return; }

  const labels = { invitation: '📩 Приглашение на собеседование', offer: '🎉 Оффер', rejection: '❌ Отказ' };
  const descs  = {
    invitation: `Отправить ${c.full_name} (${c.email}) приглашение на собеседование?`,
    offer:      `Отправить ${c.full_name} (${c.email}) предложение о работе (оффер)?`,
    rejection:  `Отправить ${c.full_name} (${c.email}) уведомление об отказе?`,
  };
  document.getElementById('email-modal-title').textContent = labels[type];
  document.getElementById('email-modal-desc').textContent  = descs[type];
  pendingEmail = { candidate: c, type };
  openModal('modal-email');
}

async function confirmSendEmail() {
  if (!pendingEmail) return;
  const { candidate: c, type } = pendingEmail;
  const templates = {
    invitation: EMAILJS_TMPL_INVITATION,
    offer:      EMAILJS_TMPL_OFFER,
    rejection:  EMAILJS_TMPL_REJECTION,
  };
  const params = {
    to_name:       c.full_name,
    to_email:      c.email,
    recruiter_name: currentProfile?.full_name || currentUser.email,
    vacancy_name:  currentVacTitle || 'Открытая вакансия',
  };
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, templates[type], params);
    toast('Письмо отправлено ✓');
    closeModal('modal-email');
  } catch (err) {
    toast('Ошибка EmailJS: ' + (err.text || err.message || JSON.stringify(err)), 'err');
  }
  pendingEmail = null;
}

/* ──────────────────────────────────────────────────────────────────────
   ДАШБОРД
   ──────────────────────────────────────────────────────────────────── */
async function loadDashboard() {
  if (!currentUser) return;

  // My vacancy IDs (needed for candidacies/history)
  const { data: myVacs } = await sb.from('vacancies').select('id').eq('recruiter_id', currentUser.id);
  const vacIds = (myVacs || []).map(v => v.id);

  // Parallel requests
  const [
    { data: cands  },
    { data: allVacs },
    { data: rems  },
    { data: ccies },
    { data: hist  },
  ] = await Promise.all([
    sb.from('candidates').select('id',       { count: 'exact' }).eq('recruiter_id', currentUser.id),
    sb.from('vacancies').select('id, status').eq('recruiter_id', currentUser.id),
    sb.from('reminders').select('id').eq('recruiter_id', currentUser.id).eq('is_done', false),
    vacIds.length
      ? sb.from('candidacies').select('current_stage').in('vacancy_id', vacIds)
      : Promise.resolve({ data: [] }),
    vacIds.length
      ? sb.from('stage_history')
          .select('candidacy_id, from_stage, to_stage, changed_at')
          .order('changed_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  // Stats
  document.getElementById('stat-candidates').textContent  = cands?.length ?? '—';
  document.getElementById('stat-vac-open').textContent    = (allVacs||[]).filter(v => v.status==='open').length;
  document.getElementById('stat-vac-closed').textContent  = (allVacs||[]).filter(v => v.status!=='open').length;
  document.getElementById('stat-reminders') && (document.getElementById('stat-reminders').textContent = rems?.length ?? '—');

  updateReminderBadge(rems || []);

  // Stage counts
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0]));
  (ccies||[]).forEach(x => { if (x.current_stage in stageCounts) stageCounts[x.current_stage]++; });
  drawStagesChart(stageCounts);

  // Avg interview days
  const avg = calcAvgInterviewDays(hist || []);
  document.getElementById('stat-avg-interview').textContent = avg != null ? avg.toFixed(1) : '—';

  // Dash reminders
  const { data: dashRems } = await sb.from('reminders')
    .select('*, candidates(full_name)')
    .eq('recruiter_id', currentUser.id).eq('is_done', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(6);
  renderDashReminders(dashRems || []);
}

function drawStagesChart(counts) {
  const ctx = document.getElementById('stages-chart').getContext('2d');
  if (stagesChart) stagesChart.destroy();
  stagesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: STAGES,
      datasets: [{
        label: 'Кандидаты',
        data: STAGES.map(s => counts[s] || 0),
        backgroundColor: ['#3b82f6','#f59e0b','#8b5cf6','#10b981','#ef4444'],
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
    }
  });
}

function calcAvgInterviewDays(history) {
  // Group by candidacy
  const byCcy = {};
  history.forEach(h => { (byCcy[h.candidacy_id] ||= []).push(h); });
  let total = 0, cnt = 0;
  Object.values(byCcy).forEach(evs => {
    evs.sort((a,b) => new Date(a.changed_at) - new Date(b.changed_at));
    let enterAt = null;
    for (const e of evs) {
      if (e.to_stage === 'Собеседование') enterAt = new Date(e.changed_at);
      else if (enterAt && e.from_stage === 'Собеседование') {
        total += (new Date(e.changed_at) - enterAt) / 86400000;
        cnt++;
        enterAt = null;
      }
    }
  });
  return cnt > 0 ? total / cnt : null;
}

function renderDashReminders(list) {
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

/* ──────────────────────────────────────────────────────────────────────
   CSV ИМПОРТ / ЭКСПОРТ
   ──────────────────────────────────────────────────────────────────── */
// Маппинг заголовков файла → поля БД (регистронезависимо, лишние пробелы игнорируются)
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
  let ok = 0, fail = 0, skipped = 0;
  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped.full_name) { skipped++; continue; }
    const { error } = await sb.from('candidates').insert({
      recruiter_id: currentUser.id,
      ...mapped,
    });
    error ? fail++ : ok++;
  }
  const msg = `«${filename}»: ${ok} добавлено` +
    (skipped ? `, ${skipped} пропущено (нет ФИО)` : '') +
    (fail    ? `, ${fail} ошибок` : '');
  toast(msg, fail > 0 ? 'info' : 'ok');
  loadCandidates();
}

async function importFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    // Excel — SheetJS
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];          // первый лист
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    await importRows(rows, file.name);
  } else {
    // CSV — PapaParse
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => { await importRows(data, file.name); },
      error: () => toast('Ошибка чтения CSV', 'err'),
    });
  }
}

function exportAllCandidatesCSV() {
  if (!allCandidates.length) { toast('Нет данных', 'info'); return; }
  const rows = allCandidates.map(c => ({
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

async function exportKanbanCSV() {
  const { data, error } = await sb.from('candidacies')
    .select('current_stage, candidates(full_name, email, phone, skills, salary_expectation)')
    .eq('vacancy_id', currentVacId);
  if (error || !data?.length) { toast('Нет данных для экспорта', 'info'); return; }
  const rows = data.map(x => ({
    full_name:          x.candidates?.full_name || '',
    email:              x.candidates?.email || '',
    phone:              x.candidates?.phone || '',
    skills:             (x.candidates?.skills||[]).join(', '),
    salary_expectation: x.candidates?.salary_expectation || '',
    stage:              x.current_stage,
  }));
  downloadCSV(rows, `${currentVacTitle}_candidates.csv`);
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

/* ──────────────────────────────────────────────────────────────────────
   ADDITIONAL CSS SHORTCUTS (appended dynamically to avoid repetition)
   ──────────────────────────────────────────────────────────────────── */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `.action-btn { padding: .2rem .35rem; border-radius: .35rem; transition: background .12s; font-size: 1rem; line-height: 1; cursor: pointer; }
  .action-btn:hover { background: rgba(0,0,0,.05); }`;
  document.head.appendChild(style);
})();

/* ──────────────────────────────────────────────────────────────────────
   ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
   ──────────────────────────────────────────────────────────────────── */
async function init() {
  // Restore session
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    showApp();
  }

  // Listen for auth state changes (e.g. email confirmation redirect)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !currentUser) {
      currentUser = session.user;
      await loadProfile();
      showApp();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = currentProfile = null;
    }
  });
}

init();
