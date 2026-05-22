import { STAGE_COLORS, STAGE_LABELS } from './config.js';

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Escape % and _ for PostgREST ilike patterns */
export function escapeIlike(q) {
  return String(q).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function money(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

export function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

export function toast(msg, type = 'ok') {
  const colors = { ok:'bg-emerald-600', err:'bg-red-600', info:'bg-indigo-600', warn:'bg-amber-500' };
  const el = document.createElement('div');
  el.className = `toast-enter pointer-events-auto ${colors[type]||colors.ok} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg max-w-xs`;
  el.textContent = msg;
  const c = document.getElementById('toast-container');
  c.appendChild(el);
  setTimeout(() => { el.classList.remove('toast-enter'); el.classList.add('toast-leave'); }, 3400);
  setTimeout(() => el.remove(), 3800);
}

export function openModal(id)  { document.getElementById(id).classList.add('active'); }
export function closeModal(id) { document.getElementById(id).classList.remove('active'); }

export function renderPipelineBadge(stage) {
  const cls = STAGE_COLORS[stage] || STAGE_COLORS.new;
  const lbl = STAGE_LABELS[stage] || 'Новый';
  return `<span class="pipeline-badge ${cls}">${lbl}</span>`;
}

export function showView(name, loadDashboard, loadCandidates, loadVacancies, loadReminders) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.remove('hidden');

  // Desktop sidebar active state
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (btn) btn.classList.add('active');

  // Mobile bottom nav active state
  document.querySelectorAll('#mobile-nav .mob-btn').forEach(b => b.classList.remove('active'));
  const mobBtn = document.querySelector(`#mobile-nav .mob-btn[data-mob="${name}"]`);
  if (mobBtn) mobBtn.classList.add('active');

  if (name === 'dashboard' && loadDashboard) loadDashboard();
  else if (name === 'candidates' && loadCandidates) loadCandidates();
  else if (name === 'vacancies' && loadVacancies) loadVacancies();
  else if (name === 'reminders' && loadReminders) loadReminders();
}
