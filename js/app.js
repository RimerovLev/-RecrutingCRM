'use strict';

import { sb } from './config.js';
import { S } from './state.js';
import { showView as _showViewImpl, closeModal } from './utils.js';
import { setOnlineState, updateSyncBadge, syncPendingOps } from './offline.js';
import {
  switchAuthTab, handleLogin, handleRegister, handleLogout,
  loadProfile, showApp,
  openTelegramLink, closeTelegramLink, generateLinkCode, copyLinkCode,
} from './auth.js';
import {
  loadCandidates, loadMoreCandidates, renderCandidates, filterCandidates,
  openCandidateModal, saveCandidate, deleteCandidate,
  setPipelineStage, onVacancyChange, toggleTag, removeTag,
  sortBy, toggleFilters, resetFilters, debouncedSearch,
  toggleSelect, toggleSelectAll, clearSelection, bulkDelete,
  openBulkVacancyModal, bulkAssignVacancy,
  togglePin, setStatus, importFile, exportAllCandidatesCSV, seedCandidates,
} from './candidates.js';
import { loadVacancies, openVacancyModal, saveVacancy, toggleVacStatus, deleteVacancy } from './vacancies.js';
import {
  openKanban, loadKanban, moveStage, openLinkModal, filterLinkList, linkCandidate,
  kanbanDragStart, kanbanDragOver, kanbanDragEnter, kanbanDragLeave, kanbanDrop,
  exportKanbanCSV,
} from './kanban.js';
import { loadDashboard } from './dashboard.js';
import {
  openDrawer, closeDrawer, loadDrawerVacancies, updateDrawerCandidacyStage,
  loadDrawerTimeline, loadDrawerReminders, drawerAddReminder, drawerDoneReminder,
  loadDrawerComments, drawerAddComment, drawerEdit, drawerOpenComments,
  drawerTogglePin, drawerSetStatus, drawerDelete,
} from './drawer.js';
import {
  loadReminders, setReminderSort, reRenderReminders, openReminderModal,
  saveReminder, toggleReminder, deleteReminder,
} from './reminders.js';
import { openEmailModal, confirmSendEmail } from './email.js';
import { openCommentsModal, loadComments, addComment, openHistoryModal } from './comments.js';
import { openMergeModal, renderMergeList, selectMergeCandidate, confirmMerge } from './merge.js';
import { openTemplatesModal, saveTemplate, deleteTemplate, copyTemplate } from './templates.js';

// ── Service Worker ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── showView (needs loaders injected) ──────────────────────────────
function showView(name) {
  _showViewImpl(name, loadDashboard, loadCandidates, loadVacancies, loadReminders);
}

// ── Expose showView globally for drawer.js and other modules ──────
window._showView = showView;

// ── After sync: reload candidates and reminders ────────────────────
window._loadCandidatesAfterSync = loadCandidates;
window._loadRemindersAfterSync  = loadReminders;

// ── Assign all functions to window for onclick= handlers ──────────
Object.assign(window, {
  // Auth
  switchAuthTab, handleLogin, handleRegister: (e) => handleRegister(e), handleLogout,
  openTelegramLink, closeTelegramLink, generateLinkCode, copyLinkCode,

  // Navigation
  showView,

  // Candidates
  loadCandidates, loadMoreCandidates, filterCandidates,
  openCandidateModal, saveCandidate, deleteCandidate,
  setPipelineStage, onVacancyChange, toggleTag, removeTag,
  sortBy, toggleFilters, resetFilters, debouncedSearch,
  toggleSelect, toggleSelectAll, clearSelection, bulkDelete,
  openBulkVacancyModal, bulkAssignVacancy,
  togglePin, setStatus, importFile, exportAllCandidatesCSV, seedCandidates,

  // Vacancies
  loadVacancies, openVacancyModal, saveVacancy, toggleVacStatus, deleteVacancy,

  // Kanban
  openKanban, loadKanban, moveStage, openLinkModal, filterLinkList, linkCandidate,
  kanbanDragStart, kanbanDragOver, kanbanDragEnter, kanbanDragLeave, kanbanDrop,
  exportKanbanCSV,

  // Dashboard
  loadDashboard,

  // Drawer
  openDrawer, closeDrawer, loadDrawerVacancies, updateDrawerCandidacyStage,
  loadDrawerTimeline, loadDrawerReminders, drawerAddReminder, drawerDoneReminder,
  loadDrawerComments, drawerAddComment, drawerEdit, drawerOpenComments,
  drawerTogglePin, drawerSetStatus, drawerDelete,

  // Reminders
  loadReminders, setReminderSort, reRenderReminders, openReminderModal,
  saveReminder, toggleReminder, deleteReminder,

  // Email
  openEmailModal, confirmSendEmail,

  // Comments
  openCommentsModal, loadComments, addComment, openHistoryModal,

  // Merge
  openMergeModal, renderMergeList, selectMergeCandidate, confirmMerge,

  // Templates
  openTemplatesModal, saveTemplate, deleteTemplate, copyTemplate,

  // Offline sync
  syncPendingOps,

  // Modal
  closeModal,
});

// ── Keyboard shortcut ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
});

// ── Init ───────────────────────────────────────────────────────────
async function init() {
  setOnlineState(navigator.onLine);
  updateSyncBadge();

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    S.currentUser = session.user;
    await loadProfile();
    showApp();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !S.currentUser) {
      S.currentUser = session.user;
      await loadProfile();
      showApp();
    }
    if (event === 'SIGNED_OUT') {
      S.currentUser = S.currentProfile = null;
    }
  });
}

init();
