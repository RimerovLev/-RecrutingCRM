export const S = {
  currentUser:           null,
  currentProfile:        null,
  allCandidates:         [],
  allVacancies:          [],
  currentVacId:          null,
  currentVacTitle:       '',
  pendingEmail:          null,   // { candidate, type }
  drawerCandidateId:     null,
  allRemindersCache:     [],
  selectedIds:           new Set(),
  candidatesOffset:      0,
  candidatesTotal:       0,
  candidatesSearchMode:  false,
  searchQ:               '',
  sortField:             null,
  sortDir:               1,      // 1 = asc, -1 = desc
  reminderSortDir:       'asc',  // 'asc' | 'desc' | 'none'
  currentTags:           [],
  templatesCache:        [],
};
