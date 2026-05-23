import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // ── Auth (primitives only — no objects!) ──────────────────────
  currentUserId:      null,
  currentUserEmail:   null,
  currentProfileRole: 'recruiter',
  currentProfileName: null,

  setCurrentUser: (u) => set({
    currentUserId:    u?.id    ?? null,
    currentUserEmail: u?.email ?? null,
  }),
  setCurrentProfile: (p) => set({
    currentProfileRole: p?.role      ?? 'recruiter',
    currentProfileName: p?.full_name ?? null,
  }),
  clearAuth: () => set({
    currentUserId: null, currentUserEmail: null,
    currentProfileRole: 'recruiter', currentProfileName: null,
  }),

  // ── Candidates ───────────────────────────────────────────────────
  allCandidates:        [],
  candidatesTotal:      0,
  candidatesOffset:     0,
  candidatesSearchMode: false,
  searchQ:              '',
  sortField:            null,
  sortDir:              1,
  currentTags:          [],
  selectedIds:          new Set(),

  setAllCandidates:  (list, total, offset) =>
    set({ allCandidates: list, candidatesTotal: total ?? list.length, candidatesOffset: offset ?? list.length }),
  appendCandidates:  (list, total, offset) =>
    set(s => ({ allCandidates: [...s.allCandidates, ...list], candidatesTotal: total, candidatesOffset: offset })),
  setSearchQ:        (q) => set({ searchQ: q, candidatesSearchMode: q.length > 0 }),
  setSortField:      (f) => set(s => ({
    sortField: f,
    sortDir: s.sortField === f ? -s.sortDir : 1,
  })),
  setCurrentTags:    (tags) => set({ currentTags: tags }),
  toggleSelectedId:  (id) => set(s => {
    const next = new Set(s.selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selectedIds: next };
  }),
  setSelectedIds:    (ids) => set({ selectedIds: new Set(ids) }),
  clearSelectedIds:  () => set({ selectedIds: new Set() }),

  // ── Vacancies ────────────────────────────────────────────────────
  allVacancies: [],
  setAllVacancies: (list) => set({ allVacancies: list }),

  // ── Kanban ───────────────────────────────────────────────────────
  currentVacId:    null,
  currentVacTitle: '',
  setKanbanVacancy: (id, title) => set({ currentVacId: id, currentVacTitle: title }),

  // ── Reminders ────────────────────────────────────────────────────
  allRemindersCache: [],
  reminderSortDir:   'asc',
  setReminders:      (list) => set({ allRemindersCache: list }),
  setReminderSort:   (dir)  => set({ reminderSortDir: dir }),

  // ── Drawer ───────────────────────────────────────────────────────
  drawerCandidateId: null,
  drawerOpen:        false,
  openDrawer:  (id) => set({ drawerCandidateId: id, drawerOpen: true }),
  closeDrawer: ()   => set({ drawerCandidateId: null, drawerOpen: false }),

  // ── Email ────────────────────────────────────────────────────────
  pendingEmailCandidateId:   null,
  emailModalOpen:            false,
  emailTemplatesCache:       [],
  openEmailModal:    (candidateId) => set({ pendingEmailCandidateId: candidateId, emailModalOpen: true }),
  closeEmailModal:   ()            => set({ emailModalOpen: false, pendingEmailCandidateId: null }),
  setEmailTemplates: (list)        => set({ emailTemplatesCache: list }),

  // ── UI ───────────────────────────────────────────────────────────
  activeView: 'dashboard',
  setActiveView: (v) => set({ activeView: v }),

  // ── Toasts ───────────────────────────────────────────────────────
  toasts: [],
  addToast: (msg, type = 'ok') => {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
