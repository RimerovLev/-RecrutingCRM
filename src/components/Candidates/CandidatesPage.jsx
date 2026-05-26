import { useEffect, useState, useCallback, useRef } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { useI18n } from '@/hooks/useI18n';
import { useOrgFields } from '@/hooks/useOrgFields';
import {
  STAGES, STAGE_LABELS, STAGE_COLORS, STATUS_LABELS, STATUS_BADGE, PAGE_SIZE,
} from '@/lib/config';
import { cacheSet, cacheGet, LS, queueOp, useOffline } from '@/hooks/useOffline';
import Modal from '@/components/common/Modal';
import CandidateDrawer from '@/components/Drawer/CandidateDrawer';
import ImportModal from '@/components/Candidates/ImportModal';

function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}
function escapeIlike(q) {
  return String(q).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const EMPTY_CAND = {
  full_name: '', phone: '', email: '', position: '', experience: '',
  district_residence: '', district_work: '', has_car: '',
  resume_source: '', contact_status: '', candidate_link: '', resume_url: '',
  salary_wish: '', notes: '', status: 'active', pipeline_stage: 'new',
  vacancy_id: '',
};

export default function CandidatesPage() {
  const allCandidates    = useStore(s => s.allCandidates);
  const candidatesTotal  = useStore(s => s.candidatesTotal);
  const candidatesOffset = useStore(s => s.candidatesOffset); // for UI only — NOT in load deps
  const setAllCandidates = useStore(s => s.setAllCandidates);
  const appendCandidates = useStore(s => s.appendCandidates);
  const searchQ          = useStore(s => s.searchQ);
  const setSearchQ       = useStore(s => s.setSearchQ);
  const sortField        = useStore(s => s.sortField);
  const sortDir          = useStore(s => s.sortDir);
  const setSortField     = useStore(s => s.setSortField);
  const selectedIds      = useStore(s => s.selectedIds);
  const toggleSelectedId = useStore(s => s.toggleSelectedId);
  const setSelectedIds   = useStore(s => s.setSelectedIds);
  const clearSelectedIds = useStore(s => s.clearSelectedIds);
  const allVacancies     = useStore(s => s.allVacancies);
  const setAllVacancies  = useStore(s => s.setAllVacancies);
  const currentUserId    = useStore(s => s.currentUserId);
  const currentOrgId     = useStore(s => s.currentOrgId);
  const drawerOpen       = useStore(s => s.drawerOpen);
  const openDrawer       = useStore(s => s.openDrawer);
  const addToast         = useStore(s => s.addToast);
  const canWrite         = useCanWrite();
  const { t }            = useI18n();
  const { visibleFields } = useOrgFields();

  // Helpers for conditional columns
  const isVisible  = (key) => visibleFields.some(f => f.key === key);
  const customCols = visibleFields.filter(f => !f.system);

  // Filters state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCar, setFilterCar]       = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterDate, setFilterDate]     = useState('');
  const [filterVacancy, setFilterVacancy] = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [searchInput, setSearchInput]   = useState('');

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_CAND);
  const [currentTags, setCurrentTags] = useState([]);
  const [tagInput, setTagInput]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [vacancyOptions, setVacancyOptions] = useState([]);

  // Offline status
  const isOnline = useOffline();

  // Resume upload
  const [resumeUploading, setResumeUploading] = useState(false);

  // Bulk vacancy modal
  const [bulkVacModal, setBulkVacModal] = useState(false);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  const searchTimer = useRef(null);

  const loadVacancyOptions = useCallback(async () => {
    const { data } = await sb.from('vacancies')
      .select('id, title').order('title');
    setVacancyOptions(data || []);
    if (!allVacancies.length) setAllVacancies(data || []);
  }, []);

  const load = useCallback(async (append = false, overrideQ = null) => {
    const q = overrideQ ?? searchQ;
    const isSearch = q.length > 0;

    let query = sb.from('candidates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (isSearch) {
      const escaped = escapeIlike(q);
      query = query.or(
        `full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,` +
        `position.ilike.%${escaped}%,resume_source.ilike.%${escaped}%,` +
        `district_residence.ilike.%${escaped}%,district_work.ilike.%${escaped}%,` +
        `experience.ilike.%${escaped}%,contact_status.ilike.%${escaped}%`
      ).limit(500);
    } else {
      const candidatesOffset = useStore.getState().candidatesOffset;
      const offset = append ? candidatesOffset : 0;
      query = query.range(offset, offset + PAGE_SIZE - 1);
    }

    const { data, error, count } = await query;
    if (error) {
      const cached = cacheGet(LS.candidates + '_' + currentUserId);
      if (cached) { setAllCandidates(cached, cached.length, cached.length); addToast('📴 Кэшированные данные', 'warn'); }
      else { addToast('Ошибка загрузки кандидатов', 'err'); return; }
    } else {
      const list = data || [];
      if (!isSearch) cacheSet(LS.candidates + '_' + currentUserId, list);
      if (append) {
        appendCandidates(list, count ?? 0, (useStore.getState().candidatesOffset + list.length));
      } else {
        setAllCandidates(list, count ?? list.length, list.length);
      }
      // Attach candidacies
      if (list.length) {
        const { data: ccies } = await sb.from('candidacies')
          .select('id, candidate_id, vacancy_id, current_stage, vacancies(id,title,status)')
          .in('candidate_id', list.map(c => c.id));
        const map = {};
        (ccies || []).forEach(cl => {
          if (!map[cl.candidate_id]) map[cl.candidate_id] = [];
          map[cl.candidate_id].push(cl);
        });
        const enriched = list.map(c => ({
          ...c,
          _candidacies: map[c.id] || [],
          _vacancyIds: (map[c.id] || []).map(cc => cc.vacancy_id),
        }));
        if (append) {
          appendCandidates(enriched, count ?? 0, useStore.getState().candidatesOffset + enriched.length);
        } else {
          setAllCandidates(enriched, count ?? enriched.length, enriched.length);
        }
      }
    }
    loadVacancyOptions();
  }, [currentUserId, searchQ]);

  useEffect(() => { if (currentUserId) load(); }, [currentUserId]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    setSearchQ(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { load(false, ''); return; }
    searchTimer.current = setTimeout(() => load(false, val), 350);
  };

  // Filtered + sorted list
  const displayList = (() => {
    let list = [...allCandidates];
    const q = searchInput.toLowerCase().trim();
    if (q && !searchQ) {
      list = list.filter(c => {
        const hay = [c.full_name, c.phone, c.position, c.resume_source,
          c.district_residence, c.district_work, c.contact_status, c.experience,
          ...(Array.isArray(c.tags) ? c.tags : [])].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterStatus) list = list.filter(c => (c.status || 'active') === filterStatus);
    if (filterCar)    list = list.filter(c => c.has_car === filterCar);
    if (filterDistrict) list = list.filter(c => (c.district_residence || '').toLowerCase().includes(filterDistrict.toLowerCase()));
    if (filterDate)   list = list.filter(c => !c.created_at || c.created_at.slice(0,10) >= filterDate);
    if (filterVacancy) list = list.filter(c => (c._vacancyIds || []).includes(filterVacancy));
    list.sort((a, b) => {
      if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
      if (!sortField) return 0;
      const av = (a[sortField] || '').toString().toLowerCase();
      const bv = (b[sortField] || '').toString().toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
    return list;
  })();

  const resetFilters = () => {
    setSearchInput(''); setSearchQ(''); setFilterStatus(''); setFilterCar('');
    setFilterDistrict(''); setFilterDate(''); setFilterVacancy('');
    load(false, '');
  };

  // Candidate modal open/save
  const openCreate = () => { setForm(EMPTY_CAND); setCurrentTags([]); setEditId(null); setModalOpen(true); };
  const openEdit = (c) => {
    setForm({
      full_name: c.full_name || '', phone: c.phone || '', email: c.email || '',
      position: c.position || '', experience: c.experience || '',
      district_residence: c.district_residence || '', district_work: c.district_work || '',
      has_car: c.has_car || '', resume_source: c.resume_source || '',
      contact_status: c.contact_status || '', candidate_link: c.candidate_link || '',
      resume_url: c.resume_url || '', salary_wish: c.salary_wish || '',
      notes: c.notes || '', status: c.status || 'active',
      pipeline_stage: c.pipeline_stage || 'new', vacancy_id: '',
    });
    setCurrentTags(Array.isArray(c.tags) ? c.tags : []);
    setEditId(c.id); setModalOpen(true);
  };

  // ── Resume file upload to Supabase Storage ──────────────────────
  const handleResumeUpload = async (file) => {
    if (!file) return;
    setResumeUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `${currentOrgId || 'shared'}/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
    const { error } = await sb.storage.from('resumes').upload(path, file, { upsert: true });
    if (error) {
      addToast('Ошибка загрузки файла: ' + error.message, 'err');
    } else {
      const { data: { publicUrl } } = sb.storage.from('resumes').getPublicUrl(path);
      setForm(f => ({ ...f, resume_url: publicUrl }));
      addToast('Резюме загружено ✓');
    }
    setResumeUploading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canWrite) { addToast(t('candidates.noPermission'), 'err'); return; }
    if (!form.full_name.trim()) { addToast(t('candidates.nameRequired'), 'err'); return; }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      position: form.position.trim() || null,
      experience: form.experience.trim() || null,
      district_residence: form.district_residence.trim() || null,
      district_work: form.district_work.trim() || null,
      has_car: form.has_car || null,
      resume_source: form.resume_source.trim() || null,
      contact_status: form.contact_status.trim() || null,
      candidate_link: form.candidate_link.trim() || null,
      resume_url: form.resume_url.trim() || null,
      salary_wish: parseInt(form.salary_wish) || null,
      notes: form.notes.trim() || null,
      status: form.status || 'active',
      pipeline_stage: form.pipeline_stage || 'new',
      tags: currentTags,
    };

    // ── Offline path ─────────────────────────────────────────────
    if (!navigator.onLine) {
      if (editId) {
        queueOp({ type: 'update', table: 'candidates', data: payload, matchField: 'id', matchValue: editId });
      } else {
        const offlineId = crypto.randomUUID();
        queueOp({ type: 'insert', table: 'candidates', data: {
          ...payload, id: offlineId,
          recruiter_id: currentUserId, org_id: currentOrgId,
          created_at: new Date().toISOString(),
        }});
      }
      setSaving(false);
      addToast('📴 Сохранено офлайн — синхронизируется при подключении');
      setModalOpen(false);
      return;
    }

    // ── Online path ──────────────────────────────────────────────
    let error, savedId;
    if (editId) {
      ({ error } = await sb.from('candidates').update(payload).eq('id', editId));
      savedId = editId;
    } else {
      payload.recruiter_id = currentUserId;
      payload.org_id = currentOrgId;
      const { data: newCand, error: ie } = await sb.from('candidates').insert(payload).select().single();
      error = ie; savedId = newCand?.id;
    }
    // Link vacancy if chosen
    if (!error && savedId && form.vacancy_id) {
      await sb.from('candidacies').upsert(
        { candidate_id: savedId, vacancy_id: form.vacancy_id, current_stage: 'new' },
        { onConflict: 'candidate_id,vacancy_id', ignoreDuplicates: true }
      );
    }
    setSaving(false);
    if (error) { addToast(t('common.error') + ': ' + error.message, 'err'); return; }
    addToast(editId ? t('candidates.toastSaved') + ' ✓' : t('candidates.toastAdded') + ' ✓');
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Удалить «${name}»?`)) return;
    const { error } = await sb.from('candidates').delete().eq('id', id);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Кандидат удалён');
    load();
  };

  const togglePin = async (id, pinned) => {
    await sb.from('candidates').update({ is_pinned: !pinned }).eq('id', id);
    load();
  };

  const setStatus = async (id, status) => {
    await sb.from('candidates').update({ status }).eq('id', id);
    load();
  };

  // Bulk
  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Удалить ${selectedIds.size} кандидатов?`)) return;
    const ids = [...selectedIds];
    const { error } = await sb.from('candidates').delete().in('id', ids);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast(`Удалено: ${ids.length}`);
    clearSelectedIds();
    load();
  };

  const bulkAssignVacancy = async (vacId) => {
    const ids = [...selectedIds];
    const rows = ids.map(cid => ({ candidate_id: cid, vacancy_id: vacId, current_stage: 'new' }));
    const { error } = await sb.from('candidacies').upsert(rows, { onConflict: 'candidate_id,vacancy_id', ignoreDuplicates: true });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); } else { addToast(`Привязано к вакансии: ${ids.length}`); }
    setBulkVacModal(false);
    clearSelectedIds();
    load();
  };

  const SortTh = ({ field, label }) => (
    <th
      className="th-sort"
      onClick={() => setSortField(field)}
    >
      <span className={`sort-icon ${sortField === field ? (sortDir === 1 ? 'asc' : 'desc') : ''}`}>
        {label}
      </span>
    </th>
  );

  const hasMore = !searchQ && candidatesOffset < candidatesTotal;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="page-title mb-0">{t('candidates.title')}</h2>
        <div className="flex gap-2 flex-wrap">
          {canWrite && (
            <>
              <button onClick={openCreate} className="btn-primary">{t('candidates.addBtn')}</button>
              <button onClick={() => setImportOpen(true)} className="btn-secondary">{t('candidates.importBtn')}</button>
            </>
          )}
          <button onClick={() => setShowFilters(v => !v)} className={showFilters ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
            {t('candidates.filtersBtn')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          className="input-field"
          placeholder={t('candidates.searchPlaceholder')}
          value={searchInput}
          onChange={handleSearchChange}
        />
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <select className="input-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">{t('candidates.allStatuses')}</option>
            <option value="active">{t('status.active')}</option>
            <option value="in_work">{t('status.in_work')}</option>
            <option value="archive">{t('status.archive')}</option>
          </select>
          <select className="input-field" value={filterCar} onChange={e => setFilterCar(e.target.value)}>
            <option value="">{t('candidates.allCar')}</option>
            <option value="Да">{t('candidates.hasCar')}</option>
            <option value="Нет">{t('candidates.noCar')}</option>
          </select>
          <input className="input-field" placeholder={t('candidates.districtPlaceholder')} value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)} />
          <input type="date" className="input-field" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          <select className="input-field" value={filterVacancy} onChange={e => setFilterVacancy(e.target.value)}>
            <option value="">{t('candidates.allVacancies')}</option>
            {vacancyOptions.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
          <button onClick={resetFilters} className="btn-secondary col-span-2 md:col-span-1">{t('common.resetFilters')}</button>
        </div>
      )}

      {/* Counter */}
      <p className="text-xs text-slate-400 mb-3">
        {searchQ ? `${t('candidates.found')} ${displayList.length}` : `${t('candidates.shown')} ${allCandidates.length} ${t('candidates.of')} ${candidatesTotal}`}
      </p>

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="card bg-indigo-50 border border-indigo-200 p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-indigo-700">{t('common.selected')}: {selectedIds.size}</span>
          <button onClick={bulkDelete} className="btn-sm btn-secondary text-red-500 hover:bg-red-50">{t('candidates.bulkDelete')}</button>
          <button onClick={() => setBulkVacModal(true)} className="btn-sm btn-secondary">{t('candidates.bulkVacancy')}</button>
          <button onClick={clearSelectedIds} className="btn-sm btn-secondary ml-auto">{t('candidates.clearSelection')}</button>
        </div>
      )}

      {/* Table (desktop) */}
      <div className="hidden md:block card overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-8">
                  <input type="checkbox"
                    onChange={e => {
                      if (e.target.checked) setSelectedIds(displayList.map(c => c.id));
                      else clearSelectedIds();
                    }}
                    checked={selectedIds.size > 0 && selectedIds.size >= displayList.length}
                  />
                </th>
                <th className="th w-8"></th>
                <SortTh field="full_name" label={t('candidates.colName')} />
                <th className="th">{t('candidates.colStatus')}</th>
                {isVisible('phone') && <SortTh field="phone" label={t('candidates.colPhone')} />}
                {isVisible('district_residence') && <SortTh field="district_residence" label={t('candidates.colDistRes')} />}
                {isVisible('district_work') && <SortTh field="district_work" label={t('candidates.colDistWork')} />}
                {isVisible('has_car') && <th className="th">{t('candidates.colCar')}</th>}
                {isVisible('position') && <SortTh field="position" label={t('candidates.colPosition')} />}
                {isVisible('resume_source') && <SortTh field="resume_source" label={t('candidates.colSource')} />}
                {isVisible('contact_status') && <th className="th">{t('candidates.colContact')}</th>}
                {isVisible('candidate_link') && <th className="th">{t('candidates.colProfile')}</th>}
                {isVisible('resume_url') && <th className="th">{t('candidates.colResume')}</th>}
                {customCols.map(f => (
                  <th key={f.key} className="th">{f.label}</th>
                ))}
                <th className="th">{t('candidates.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr><td colSpan={99} className="py-10 text-center text-slate-400">{t('candidates.noResults')}</td></tr>
              ) : displayList.map(c => {
                const status = c.status || 'active';
                const statusCls = STATUS_BADGE[status] || 'badge-active';
                const tags = Array.isArray(c.tags) ? c.tags : [];
                const stage = c._candidacies?.[0]?.current_stage || c.pipeline_stage;
                return (
                  <tr key={c.id} className={`border-b border-slate-100 hover:bg-slate-50 transition ${c.is_pinned ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" className="rounded" checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelectedId(c.id)} />
                    </td>
                    <td className="px-1 py-3 text-center">
                      <button onClick={() => togglePin(c.id, c.is_pinned)} className="text-lg hover:scale-110 transition-transform">
                        {c.is_pinned ? '⭐' : '☆'}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => openDrawer(c.id)} className="font-semibold text-slate-800 hover:text-indigo-600 block text-left">
                        {c.full_name}
                      </button>
                      {c.experience && <div className="text-xs text-slate-400 truncate max-w-[140px]">{c.experience}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={status}
                        onChange={e => setStatus(c.id, e.target.value)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${statusCls}`}
                      >
                        <option value="active">{t('status.active')}</option>
                        <option value="in_work">{t('status.in_work')}</option>
                        <option value="archive">{t('status.archive')}</option>
                      </select>
                    </td>
                    {isVisible('phone') && (
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{c.phone || '—'}</td>
                    )}
                    {isVisible('district_residence') && (
                      <td className="px-4 py-3 text-slate-500">{c.district_residence || '—'}</td>
                    )}
                    {isVisible('district_work') && (
                      <td className="px-4 py-3 text-slate-500">{c.district_work || '—'}</td>
                    )}
                    {isVisible('has_car') && (
                      <td className="px-4 py-3">
                        {c.has_car === 'Да'
                          ? <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">✅ {t('common.yes')}</span>
                          : c.has_car === 'Нет'
                            ? <span className="bg-red-50 text-red-400 text-xs px-2 py-0.5 rounded-full">✗ {t('common.no')}</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {isVisible('position') && (
                      <td className="px-4 py-3">
                        <span className="text-slate-700">{c.position || '—'}</span>
                        {stage && stage !== 'new' && (
                          <span className={`pipeline-badge ml-1 ${STAGE_COLORS[stage]}`}>{STAGE_LABELS[stage]}</span>
                        )}
                        {tags.map(tag => (
                          <span key={tag} className="tag-chip ml-1">{tag}</span>
                        ))}
                      </td>
                    )}
                    {isVisible('resume_source') && (
                      <td className="px-4 py-3 text-slate-500">{c.resume_source || '—'}</td>
                    )}
                    {isVisible('contact_status') && (
                      <td className="px-4 py-3 text-slate-500 max-w-[160px]">
                        <div className="truncate">{c.contact_status || '—'}</div>
                      </td>
                    )}
                    {isVisible('candidate_link') && (
                      <td className="px-4 py-3">
                        {c.candidate_link
                          ? <a href={c.candidate_link} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline text-xs">👤 {t('drawer.profileLink')}</a>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {isVisible('resume_url') && (
                      <td className="px-4 py-3">
                        {c.resume_url
                          ? <a href={c.resume_url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline text-xs">📎 {t('drawer.resumeLink')}</a>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {customCols.map(f => {
                      const val = c.custom_data?.[f.key];
                      let display = '—';
                      if (val != null && val !== '') {
                        if (f.type === 'boolean') display = val ? t('common.yes') : t('common.no');
                        else display = String(val);
                      }
                      return (
                        <td key={f.key} className="px-4 py-3 text-slate-500">{display}</td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {canWrite && <button onClick={() => openEdit(c)} title="Редактировать" className="text-blue-500 hover:scale-110 transition-transform">✏️</button>}
                        {canWrite && <button onClick={() => handleDelete(c.id, c.full_name)} title="Удалить" className="text-red-400 hover:scale-110 transition-transform">🗑️</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {displayList.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">Нет кандидатов</div>
        ) : displayList.map(c => {
          const status = c.status || 'active';
          const statusCls = STATUS_BADGE[status] || 'badge-active';
          const metaParts = [
            c.phone         ? `📞 ${c.phone}` : null,
            c.position      ? `💼 ${c.position}` : null,
            c.district_residence ? `🏠 ${c.district_residence}` : null,
            c.has_car === 'Да' ? '🚗 Есть авто' : null,
          ].filter(Boolean);
          return (
            <div key={c.id} className={`card p-4 ${c.is_pinned ? 'border-l-4 border-amber-400' : ''}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1">
                  <button onClick={() => openDrawer(c.id)} className="font-bold text-slate-800 hover:text-indigo-600 text-left">
                    {c.is_pinned && '⭐ '}{c.full_name}
                  </button>
                  {c.experience && <div className="text-xs text-slate-400 mt-0.5">{c.experience}</div>}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusCls}`}>
                  {STATUS_LABELS[status] || status}
                </span>
              </div>
              {metaParts.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500 mb-2">
                  {metaParts.map((p, i) => <span key={i}>{p}</span>)}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={() => openDrawer(c.id)} className="btn-primary btn-sm flex-1">Открыть →</button>
                {canWrite && <button onClick={() => openEdit(c)} className="btn-secondary btn-sm">✏️</button>}
                {canWrite && <button onClick={() => handleDelete(c.id, c.full_name)} className="btn-secondary btn-sm text-red-400">🗑️</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center mt-4">
          <button onClick={() => load(true)} className="btn-secondary px-8">
            Загрузить ещё ({candidatesTotal - candidatesOffset} осталось)
          </button>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && <CandidateDrawer onReload={load} />}

      {/* Import CSV modal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { load(); }} />

      {/* Candidate modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? t('candidates.formEditTitle') : t('candidates.formAddTitle')} wide>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="form-label">{t('candidates.fieldName')}</label>
              <input className="input-field" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} required />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldPhone')}</label>
              <input className="input-field" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldEmail')}</label>
              <input type="email" className="input-field" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldPosition')}</label>
              <input className="input-field" value={form.position} onChange={e => setForm(f => ({...f, position: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldExperience')}</label>
              <input className="input-field" value={form.experience} onChange={e => setForm(f => ({...f, experience: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldDistRes')}</label>
              <input className="input-field" value={form.district_residence} onChange={e => setForm(f => ({...f, district_residence: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldDistWork')}</label>
              <input className="input-field" value={form.district_work} onChange={e => setForm(f => ({...f, district_work: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldCar')}</label>
              <select className="input-field" value={form.has_car} onChange={e => setForm(f => ({...f, has_car: e.target.value}))}>
                <option value="">—</option>
                <option value="Да">{t('common.yes')}</option>
                <option value="Нет">{t('common.no')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldSource')}</label>
              <input className="input-field" value={form.resume_source} onChange={e => setForm(f => ({...f, resume_source: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldStatus')}</label>
              <select className="input-field" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="active">{t('status.active')}</option>
                <option value="in_work">{t('status.in_work')}</option>
                <option value="archive">{t('status.archive')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldSalary')}</label>
              <input type="number" className="input-field" value={form.salary_wish} onChange={e => setForm(f => ({...f, salary_wish: e.target.value}))} />
            </div>
          </div>

          <div>
            <label className="form-label">{t('candidates.fieldVacancy')}</label>
            <select className="input-field" value={form.vacancy_id} onChange={e => setForm(f => ({...f, vacancy_id: e.target.value}))}>
              <option value="">{t('candidates.noVacancy')}</option>
              {vacancyOptions.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">{t('candidates.fieldContact')}</label>
            <input className="input-field" value={form.contact_status} onChange={e => setForm(f => ({...f, contact_status: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('candidates.fieldLink')}</label>
              <input className="input-field" value={form.candidate_link} onChange={e => setForm(f => ({...f, candidate_link: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">{t('candidates.fieldResumeUrl')}</label>
              <input className="input-field" value={form.resume_url} onChange={e => setForm(f => ({...f, resume_url: e.target.value}))} placeholder="https://…" />
            </div>
          </div>
          {/* Resume file upload */}
          <div>
            <label className="form-label">{t('candidates.fieldResumeUpload')} <span className="text-slate-400 font-normal">— {t('candidates.fieldResumeUploadHint')}</span></label>
            <div className="flex gap-2 items-center">
              <label className={`btn-secondary btn-sm cursor-pointer ${resumeUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {resumeUploading ? '⏳ ' + t('common.loading') : '📎 ' + t('candidates.uploadFile')}
                <input type="file" accept=".pdf,.docx,.doc" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleResumeUpload(e.target.files[0]); }} />
              </label>
              {form.resume_url && (
                <a href={form.resume_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline truncate max-w-[200px]">
                  {t('candidates.openResume')}
                </a>
              )}
            </div>
          </div>
          <div>
            <label className="form-label">{t('candidates.fieldNotes')}</label>
            <textarea className="input-field" rows={3} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>

          {/* Tags */}
          <div>
            <label className="form-label">{t('candidates.fieldTags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {currentTags.map(tag => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button type="button" onClick={() => setCurrentTags(tags => tags.filter(x => x !== tag))}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input-field"
                placeholder="Добавить тег..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault();
                    const tag = tagInput.trim();
                    if (!currentTags.includes(tag)) setCurrentTags(prev => [...prev, tag]);
                    setTagInput('');
                  }
                }}
              />
              <button type="button" className="btn-secondary px-3" onClick={() => {
                const tag = tagInput.trim();
                if (tag && !currentTags.includes(tag)) setCurrentTags(prev => [...prev, tag]);
                setTagInput('');
              }}>+</button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2.5">
              {saving ? t('common.loading') : `💾 ${t('common.save')}`}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary px-6">{t('common.cancel')}</button>
          </div>
        </form>
      </Modal>

      {/* Bulk vacancy modal */}
      <Modal open={bulkVacModal} onClose={() => setBulkVacModal(false)} title={t('candidates.bulkVacancyTitle')}>
        <div className="space-y-2">
          {vacancyOptions.filter(v => v.status === 'open' || !v.status).map(v => (
            <button key={v.id} onClick={() => bulkAssignVacancy(v.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
              <div className="font-semibold text-slate-800">{v.title}</div>
            </button>
          ))}
          {!vacancyOptions.length && <p className="text-slate-400 text-center py-6">{t('common.noData')}</p>}
        </div>
      </Modal>
    </div>
  );
}
