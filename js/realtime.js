/**
 * realtime.js — Supabase Realtime subscriptions
 * Subscribes to candidates, vacancies, reminders, interviews tables.
 * On any change → debounce → reload the currently visible view.
 */

import { sb } from './config.js';
import { S } from './state.js';
import { toast } from './utils.js';

let _channel = null;
let _debounceTimer = null;

// Which view is active right now?
function _currentView() {
  const active = document.querySelector('.view:not(.hidden)');
  return active ? active.id.replace('view-', '') : null;
}

function _debounceReload(table) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    const view = _currentView();
    // show a subtle notification
    const icon = { candidates: '👥', vacancies: '💼', reminders: '⏰', interviews: '🗓' }[table] || '🔄';
    const dot = document.getElementById('realtime-dot');
    if (dot) { dot.classList.add('active'); setTimeout(() => dot.classList.remove('active'), 1500); }

    if (view === 'dashboard')   window._reloadDashboard?.();
    if (view === 'candidates')  window._loadCandidatesAfterSync?.();
    if (view === 'vacancies')   window._reloadVacancies?.();
    if (view === 'kanban')      window._reloadKanban?.();
    if (view === 'reminders')   window._loadRemindersAfterSync?.();
    // Also reload interview calendar if on dashboard
    if (view === 'dashboard')   window.loadDashInterviews?.();
  }, 800);
}

export function startRealtime() {
  if (_channel) return; // already started
  if (!S.currentUser) return;

  _channel = sb.channel('crm_realtime')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'candidates',
      filter: `recruiter_id=eq.${S.currentUser.id}`,
    }, () => _debounceReload('candidates'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'vacancies',
      filter: `recruiter_id=eq.${S.currentUser.id}`,
    }, () => _debounceReload('vacancies'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'reminders',
      filter: `recruiter_id=eq.${S.currentUser.id}`,
    }, () => _debounceReload('reminders'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'interviews',
      filter: `recruiter_id=eq.${S.currentUser.id}`,
    }, () => _debounceReload('interviews'))
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] connected ✓');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Realtime] channel error, retrying…');
      }
    });
}

export function stopRealtime() {
  if (_channel) {
    sb.removeChannel(_channel);
    _channel = null;
  }
}
