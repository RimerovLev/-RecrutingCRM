import { sb } from './config.js';
import { S } from './state.js';
import { canWrite } from './auth.js';
import { esc, fmtDay, toast, openModal, closeModal } from './utils.js';
import { isOnline, LS, cacheSet, cacheGet, queueOp } from './offline.js';

export async function loadReminders() {
  let data, error;
  if (!isOnline) {
    data = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
  } else {
    ({ data, error } = await sb.from('reminders')
      .select('*, candidates(full_name)')
      .eq('recruiter_id', S.currentUser.id)
      .order('created_at', { ascending: true }));
    if (error) {
      data = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
    } else {
      cacheSet(LS.reminders + '_' + S.currentUser.id, data || []);
    }
  }
  S.allRemindersCache = data || [];
  reRenderReminders();
  updateReminderBadge(S.allRemindersCache);
}

export function setReminderSort(dir) {
  S.reminderSortDir = dir;
  document.querySelectorAll('.rem-sort-btn').forEach(b => b.classList.remove('active'));
  const map = { asc: 'rem-sort-asc', desc: 'rem-sort-desc', none: 'rem-sort-none' };
  document.getElementById(map[dir])?.classList.add('active');
  reRenderReminders();
}

export function reRenderReminders() {
  const hideDone = document.getElementById('rem-hide-done')?.checked;
  let list = hideDone ? S.allRemindersCache.filter(r => !r.is_done) : [...S.allRemindersCache];

  if (S.reminderSortDir !== 'none') {
    const asc = S.reminderSortDir === 'asc';
    list.sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date) : (asc ? new Date('9999-12-31') : new Date(0));
      const db = b.due_date ? new Date(b.due_date) : (asc ? new Date('9999-12-31') : new Date(0));
      return asc ? da - db : db - da;
    });
  }
  renderReminders(list);
}

export function updateReminderBadge(data) {
  const active = data.filter(r => !r.is_done).length;
  const badge = document.getElementById('badge-reminders');
  if (badge) {
    badge.textContent = active;
    badge.classList.toggle('hidden', active === 0);
  }
  const mobBadge = document.getElementById('mob-badge-reminders');
  if (mobBadge) {
    mobBadge.textContent = active > 9 ? '9+' : active;
    mobBadge.classList.toggle('visible', active > 0);
  }
}

export function renderReminders(list) {
  const el = document.getElementById('reminders-list');
  if (!list.length) {
    el.innerHTML = '<div class="card p-10 text-center text-slate-400">Нет напоминаний</div>';
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);

  const renderItem = r => {
    const overdue = !r.is_done && r.due_date && new Date(r.due_date) < today;
    const timeStr = r.due_date ? fmtDay(r.due_date) : '—';
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
        ${timeStr} ${overdue ? '⚠️' : ''}
      </div>
      <button onclick="deleteReminder('${r.id}')" class="text-slate-300 hover:text-red-400 transition text-lg leading-none">×</button>
    </div>`;
  };

  if (S.reminderSortDir !== 'none') {
    el.innerHTML = list.map(renderItem).join('');
  } else {
    const active = list.filter(r => !r.is_done);
    const done   = list.filter(r =>  r.is_done);
    el.innerHTML = '';
    if (active.length) el.innerHTML += `<h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Активные</h4>` + active.map(renderItem).join('');
    if (done.length)   el.innerHTML += `<h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">Выполненные</h4>` + done.map(renderItem).join('');
  }
}

export function openReminderModal(candidateId = null) {
  document.getElementById('rem-cand-id').value = candidateId || '';
  document.getElementById('rem-note').value = '';
  document.getElementById('rem-date').value = '';
  openModal('modal-reminder');
}

export async function saveReminder(e) {
  e.preventDefault();
  if (!canWrite()) { toast('Недостаточно прав (роль viewer)', 'err'); return; }
  const payload = {
    recruiter_id: S.currentUser.id,
    candidate_id: document.getElementById('rem-cand-id').value || null,
    note:     document.getElementById('rem-note').value.trim(),
    due_date: document.getElementById('rem-date').value || null,
    is_done:  false,
  };
  if (!isOnline) {
    const offlineId = crypto.randomUUID();
    payload.id = offlineId;
    queueOp({ type: 'insert', table: 'reminders', data: payload });
    S.allRemindersCache.unshift({ ...payload, created_at: new Date().toISOString() });
    const globalCached = cacheGet(LS.reminders + '_' + S.currentUser.id) || [];
    globalCached.unshift({ ...payload, created_at: new Date().toISOString() });
    cacheSet(LS.reminders + '_' + S.currentUser.id, globalCached);
    reRenderReminders();
    closeModal('modal-reminder');
    return;
  }
  const { error } = await sb.from('reminders').insert(payload);
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Напоминание создано ✓');
  closeModal('modal-reminder');
  loadReminders();
}

export async function toggleReminder(id, isDone) {
  const { error } = await sb.from('reminders').update({ is_done: !isDone }).eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadReminders();
}

export async function deleteReminder(id) {
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) { toast('Ошибка', 'err'); return; }
  loadReminders();
}
