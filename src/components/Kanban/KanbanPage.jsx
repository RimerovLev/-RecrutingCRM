import { useEffect, useState, useRef, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useCanWrite } from '@/hooks/useCanWrite';
import { STAGES, STAGE_LABELS, STAGE_COLORS } from '@/lib/config';
import Modal from '@/components/common/Modal';

function money(n) {
  if (!n && n !== 0) return '';
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

export default function KanbanPage() {
  const currentVacId    = useStore(s => s.currentVacId);
  const currentVacTitle = useStore(s => s.currentVacTitle);
  const currentUser     = useStore(s => s.currentUser);
  const allCandidates   = useStore(s => s.allCandidates);
  const addToast        = useStore(s => s.addToast);
  const setActiveView   = useStore(s => s.setActiveView);
  const canWrite        = useCanWrite();

  const [items, setItems] = useState([]);
  const [linkModal, setLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkAvailable, setLinkAvailable] = useState([]);

  const dragRef = useRef({ id: null, fromStage: null });

  const load = useCallback(async () => {
    if (!currentVacId) return;
    const { data, error } = await sb.from('candidacies')
      .select('id, current_stage, created_at, candidates(id, full_name, email, phone, salary_expectation)')
      .eq('vacancy_id', currentVacId);
    if (error) { addToast('Ошибка загрузки канбана', 'err'); return; }
    setItems(data || []);
  }, [currentVacId]);

  useEffect(() => { load(); }, [load]);

  const moveStage = async (candidacyId, fromStage, toStage) => {
    if (!canWrite) { addToast('Недостаточно прав', 'err'); return; }
    const { error } = await sb.from('candidacies').update({ current_stage: toStage }).eq('id', candidacyId);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    await sb.from('stage_history').insert({
      candidacy_id: candidacyId, from_stage: fromStage,
      to_stage: toStage, changed_by: currentUser.id,
    });
    addToast(`${STAGE_LABELS[fromStage]||fromStage} → ${STAGE_LABELS[toStage]||toStage}`);
    load();
  };

  const openLinkModal = async () => {
    const { data: linked } = await sb.from('candidacies').select('candidate_id').eq('vacancy_id', currentVacId);
    const linkedIds = (linked || []).map(x => x.candidate_id);
    setLinkAvailable(allCandidates.filter(c => !linkedIds.includes(c.id)));
    setLinkSearch('');
    setLinkModal(true);
  };

  const linkCandidate = async (candidateId) => {
    const { error } = await sb.from('candidacies').insert({
      candidate_id: candidateId, vacancy_id: currentVacId, current_stage: 'new',
    });
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast('Кандидат привязан ✓');
    setLinkModal(false);
    load();
  };

  const exportCSV = () => {
    const rows = items.map(x => ({
      name:  x.candidates?.full_name || '',
      email: x.candidates?.email || '',
      phone: x.candidates?.phone || '',
      stage: x.current_stage,
    }));
    const header = 'Имя,Email,Телефон,Этап\n';
    const csv = header + rows.map(r => `"${r.name}","${r.email}","${r.phone}","${r.stage}"`).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${currentVacTitle}_candidates.csv` });
    a.click(); URL.revokeObjectURL(url);
    addToast('CSV скачан ✓');
  };

  // Drag & drop
  const onDragStart = (e, candidacyId, stage) => {
    dragRef.current = { id: candidacyId, fromStage: stage };
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  };

  const onDragEnd = (e) => { e.currentTarget.style.opacity = ''; };

  const onDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDragEnter = (e, stage) => {
    e.preventDefault();
    if (stage !== dragRef.current.fromStage) e.currentTarget.classList.add('drag-over');
  };
  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over');
  };
  const onDrop = (e, toStage) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const { id, fromStage } = dragRef.current;
    if (!id || toStage === fromStage) return;
    moveStage(id, fromStage, toStage);
    dragRef.current = { id: null, fromStage: null };
  };

  const filteredLinks = linkSearch
    ? linkAvailable.filter(c =>
        c.full_name.toLowerCase().includes(linkSearch.toLowerCase()) ||
        (c.position || '').toLowerCase().includes(linkSearch.toLowerCase()) ||
        (c.phone || '').includes(linkSearch)
      )
    : linkAvailable;

  if (!currentVacId) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="text-center">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-semibold">Выберите вакансию для канбана</p>
          <button onClick={() => setActiveView('vacancies')} className="btn-primary mt-4">
            Перейти к вакансиям
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={() => setActiveView('vacancies')} className="btn-secondary btn-sm">← Вакансии</button>
        <h2 className="page-title mb-0 flex-1">{currentVacTitle}</h2>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={openLinkModal} className="btn-secondary btn-sm">+ Привязать кандидата</button>
          )}
          <button onClick={exportCSV} className="btn-secondary btn-sm">📥 CSV</button>
        </div>
      </div>

      {/* Board */}
      <div className="overflow-x-auto flex-1">
        <div className="flex gap-3 min-w-max pb-4">
          {STAGES.map((stage, stageIdx) => {
            const cards = items.filter(x => x.current_stage === stage);
            const prevStage = STAGES[stageIdx - 1] || null;
            const nextStage = STAGES[stageIdx + 1] || null;

            return (
              <div key={stage} className="flex-shrink-0 w-52">
                {/* Column header */}
                <div className={`stage-${stage} text-white text-xs font-bold px-3 py-2 rounded-t-xl flex justify-between items-center`}>
                  <span>{STAGE_LABELS[stage]}</span>
                  <span className="bg-white/30 rounded-full px-1.5">{cards.length}</span>
                </div>

                {/* Drop zone */}
                <div
                  className={`kanban-drop-zone bg-slate-50 border border-t-0 border-slate-200 rounded-b-xl p-2 min-h-24 space-y-2`}
                  data-stage={stage}
                  onDragOver={onDragOver}
                  onDragEnter={e => onDragEnter(e, stage)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, stage)}
                >
                  {cards.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Пусто</p>
                  )}
                  {cards.map(item => {
                    const c = item.candidates || {};
                    return (
                      <div
                        key={item.id}
                        className={`kanban-card rounded-xl border p-3 stage-border-${stage}`}
                        draggable
                        onDragStart={e => onDragStart(e, item.id, stage)}
                        onDragEnd={onDragEnd}
                      >
                        <div className="font-semibold text-slate-800 leading-tight mb-1 text-sm">{c.full_name}</div>
                        {c.email && <div className="text-xs text-slate-500 truncate">{c.email}</div>}
                        {c.salary_expectation && <div className="text-xs text-slate-400">{money(c.salary_expectation)}</div>}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {prevStage && (
                            <button
                              onClick={() => moveStage(item.id, stage, prevStage)}
                              className="text-xs bg-white border border-slate-200 hover:bg-slate-50 px-2 py-0.5 rounded transition"
                            >
                              ← {STAGE_LABELS[prevStage]}
                            </button>
                          )}
                          {nextStage && (
                            <button
                              onClick={() => moveStage(item.id, stage, nextStage)}
                              className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded transition"
                            >
                              {STAGE_LABELS[nextStage]} →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Link modal */}
      <Modal open={linkModal} onClose={() => setLinkModal(false)} title="Привязать кандидата">
        <div className="mb-3">
          <input
            className="input-field"
            placeholder="Поиск кандидата…"
            value={linkSearch}
            onChange={e => setLinkSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filteredLinks.length === 0 ? (
            <p className="text-slate-400 text-center py-6 text-xs">Нет доступных кандидатов</p>
          ) : filteredLinks.map(c => {
            const status = c.status === 'in_work' ? '🔵' : c.status === 'archive' ? '⚪' : '🟢';
            return (
              <button key={c.id} onClick={() => linkCandidate(c.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition">
                <div className="flex items-center gap-2">
                  <span>{status}</span>
                  <span className="font-semibold text-slate-800">{c.full_name}</span>
                </div>
                {c.position && <div className="text-xs text-slate-500 mt-0.5 ml-5">{c.position}</div>}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
