import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────────────
  currentUser:    null,
  currentProfile: null,
  setCurrentUser:    (u) => set({ currentUser: u }),
  setCurrentProfile: (p) => set({ currentProfile: p }),

  // NOTE: use useCanWrite() hook instead of calling this directly in render
  canWrite: () => {
    const role = get().currentProfile?.role || 'recruiter';
    return role === 'recruiter' || role === 'admin';
  },

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

  setAllCandidates:    (list, total, offset) =>
    set({ allCandidates: list, candidatesTotal: total, candidatesOffset: offset }),
  appendCandidates:    (list, total, offset) =>
    set(s => ({ allCandidates: [...s.allCandidates, ...list], candidatesTotal: total, candidatesOffset: offset })),
  setSearchQ:          (q) => set({ searchQ: q, candidatesSearchMode: q.length > 0 }),
  setSortField:        (f) => set(s => ({
    sortField: f,
    sortDir: s.sortField === f ? -s.sortDir : 1,
  })),
  setCurrentTags:      (tags) => set({ currentTags: tags }),
  toggleSelectedId:    (id) => set(s => {
    const next = new Set(s.selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selectedIds: next };
  }),
  setSelectedIds:      (ids) => set({ selectedIds: new Set(ids) }),
  clearSelectedIds:    () => set({ selectedIds: new Set() }),

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
  setReminderSort:   (dir) => set({ reminderSortDir: dir }),

  // ── Drawer ───────────────────────────────────────────────────────
  drawerCandidateId: null,
  drawerOpen:        false,
  openDrawer:  (id) => set({ drawerCandidateId: id, drawerOpen: true }),
  closeDrawer: ()   => set({ drawerCandidateId: null, drawerOpen: false }),

  // ── Email ────────────────────────────────────────────────────────
  pendingEmailCandidate:     null,
  pendingEmailTemplate:      null,
  emailModalOpen:            false,
  emailTemplatesCache:       [],
  openEmailModal:   (candidate) => set({ pendingEmailCandidate: candidate, emailModalOpen: true }),
  closeEmailModal:  ()          => set({ emailModalOpen: false, pendingEmailCandidate: null }),
  setEmailTemplates: (list) => set({ emailTemplatesCache: list }),
  setPendingEmailTemplate: (t) => set({ pendingEmailTemplate: t }),

  // ── Templates (message) ──────────────────────────────────────────
  templatesCache: [],
  setTemplatesCache: (list) => set({ templatesCache: list }),

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
