import { useState, useCallback } from 'react';
import { useOrgFields } from '@/hooks/useOrgFields';
import { useStore } from '@/store';

const TYPE_LABELS = { text: 'Текст', number: 'Число', boolean: 'Да/Нет', select: 'Список' };
const TYPE_ICONS  = { text: '✏️', number: '🔢', boolean: '☑️', select: '📋' };

function uid() {
  return 'custom_' + Math.random().toString(36).slice(2, 9);
}

export default function OrgFieldsEditor() {
  const currentProfileRole = useStore(s => s.currentProfileRole);
  const isAdmin = currentProfileRole === 'admin';

  const { fields, saveFields, ready } = useOrgFields();
  const addToast = useStore(s => s.addToast);

  // Local working copy so edits are batched before save
  const [local, setLocal] = useState(null);          // null = not editing
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState(null);       // null | { label, type }
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [editingKey, setEditingKey] = useState(null); // key of field being renamed

  // Open editor: clone store fields into local state
  const startEdit = () => setLocal(fields.map(f => ({ ...f })));
  const cancelEdit = () => { setLocal(null); setEditingKey(null); setAddForm(null); };

  const save = async () => {
    if (!local) return;
    setSaving(true);
    await saveFields(local);
    setSaving(false);
    setLocal(null);
    setEditingKey(null);
    setAddForm(null);
    addToast('Настройки полей сохранены ✓');
  };

  // ── Field mutations on local copy ────────────────────────────────
  const toggleVisible = (key) => {
    setLocal(prev => prev.map(f =>
      f.key === key ? { ...f, visible: !f.visible } : f
    ));
  };

  const renameField = (key, label) => {
    setLocal(prev => prev.map(f =>
      f.key === key ? { ...f, label } : f
    ));
  };

  const deleteField = (key) => {
    setLocal(prev => prev.filter(f => f.key !== key));
  };

  const addCustomField = () => {
    if (!addForm?.label?.trim()) return;
    const newField = {
      key:      uid(),
      label:    addForm.label.trim(),
      type:     addForm.type || 'text',
      required: false,
      visible:  true,
      system:   false,
      order:    (local.length > 0 ? Math.max(...local.map(f => f.order)) + 1 : 0),
    };
    setLocal(prev => [...prev, newField]);
    setAddForm(null);
  };

  // ── Drag-and-drop reorder ─────────────────────────────────────────
  const onDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    setOverIdx(idx);
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...local];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    // Re-assign order values
    setLocal(next.map((f, i) => ({ ...f, order: i })));
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const working = local ?? fields;

  if (!ready) {
    return <div className="card p-8 text-center text-slate-400 text-sm">Загрузка настроек…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-700">Поля карточки кандидата</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Управляй видимостью полей, переименовывай и добавляй кастомные
          </p>
        </div>
        {isAdmin && !local && (
          <button onClick={startEdit} className="btn-secondary btn-sm">✏️ Редактировать</button>
        )}
        {isAdmin && local && (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Сохранение…' : '💾 Сохранить'}
            </button>
            <button onClick={cancelEdit} className="btn-secondary btn-sm">Отмена</button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span>⠿ перетащи для сортировки</span>
        <span>👁 показать / скрыть</span>
        <span>⚙️ системное поле</span>
      </div>

      {/* Field list */}
      <div className="card overflow-hidden">
        {working.map((field, idx) => {
          const isDragging = dragIdx === idx;
          const isOver     = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          const isEditing  = editingKey === field.key;

          return (
            <div
              key={field.key}
              draggable={!!local}
              onDragStart={e => onDragStart(e, idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDrop={e => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 transition-colors
                ${isDragging ? 'opacity-40' : ''}
                ${isOver ? 'bg-indigo-50' : 'bg-white'}
                ${local ? 'cursor-grab' : ''}
              `}
            >
              {/* Drag handle */}
              <span className={`text-slate-300 select-none text-lg leading-none ${local ? '' : 'invisible'}`}>⠿</span>

              {/* Type icon */}
              <span className="text-base w-5 text-center flex-shrink-0">{TYPE_ICONS[field.type] ?? '✏️'}</span>

              {/* Label (editable or static) */}
              <div className="flex-1 min-w-0">
                {isEditing && local ? (
                  <input
                    autoFocus
                    className="input-field py-1 text-sm"
                    value={field.label}
                    onChange={e => renameField(field.key, e.target.value)}
                    onBlur={() => setEditingKey(null)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingKey(null); }}
                  />
                ) : (
                  <span
                    className={`text-sm font-medium text-slate-700 truncate block ${local && !field.required ? 'cursor-text hover:text-indigo-600' : ''}`}
                    onClick={() => local && setEditingKey(field.key)}
                    title={local && !field.required ? 'Нажми чтобы переименовать' : ''}
                  >
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                  </span>
                )}
                <span className="text-xs text-slate-400">{TYPE_LABELS[field.type] ?? field.type}{field.system ? ' · ⚙️ системное' : ' · кастомное'}</span>
              </div>

              {/* Visibility toggle */}
              {local ? (
                <button
                  onClick={() => !field.required && toggleVisible(field.key)}
                  disabled={field.required}
                  title={field.required ? 'Обязательное поле' : (field.visible ? 'Скрыть' : 'Показать')}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                    field.visible ? 'bg-indigo-500' : 'bg-slate-200'
                  } ${field.required ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    field.visible ? 'left-4' : 'left-0.5'
                  }`} />
                </button>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  field.visible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  {field.visible ? 'Видимое' : 'Скрыто'}
                </span>
              )}

              {/* Delete (custom fields only, edit mode only) */}
              {local && !field.system && (
                <button
                  onClick={() => deleteField(field.key)}
                  className="text-slate-300 hover:text-red-400 transition-colors text-sm flex-shrink-0"
                  title="Удалить поле"
                >✕</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add custom field */}
      {local && (
        <div className="card p-4">
          {addForm ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="form-label">Название поля</label>
                <input
                  autoFocus
                  className="input-field"
                  placeholder="Например: Уровень английского"
                  value={addForm.label}
                  onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomField(); if (e.key === 'Escape') setAddForm(null); }}
                />
              </div>
              <div>
                <label className="form-label">Тип</label>
                <select
                  className="input-field"
                  value={addForm.type}
                  onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="text">Текст</option>
                  <option value="number">Число</option>
                  <option value="boolean">Да/Нет</option>
                </select>
              </div>
              <button onClick={addCustomField} className="btn-primary btn-sm mb-0.5">+ Добавить</button>
              <button onClick={() => setAddForm(null)} className="btn-secondary btn-sm mb-0.5">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddForm({ label: '', type: 'text' })}
              className="btn-secondary btn-sm w-full justify-center"
            >
              + Новое кастомное поле
            </button>
          )}
        </div>
      )}

      {/* Read-only note */}
      {!local && !isAdmin && (
        <p className="text-xs text-slate-400 text-center">Только администратор может изменять поля</p>
      )}
    </div>
  );
}
