// ── System default candidate fields ──────────────────────────────
// All organisations start with these. Admins can hide, rename, reorder,
// or add custom fields — but cannot delete system fields (system: true).
//
// type: 'text' | 'boolean' | 'number' | 'select'
// For custom fields, values go into candidates.custom_data[key].
// For system fields, values live in the candidates table column of the same key.

export const DEFAULT_FIELDS = [
  { key: 'full_name',          label: 'ФИО',                 type: 'text',    required: true,  visible: true,  system: true,  order: 0  },
  { key: 'phone',              label: 'Телефон',             type: 'text',    required: false, visible: true,  system: true,  order: 1  },
  { key: 'email',              label: 'Email',               type: 'text',    required: false, visible: true,  system: true,  order: 2  },
  { key: 'position',           label: 'Должность',           type: 'text',    required: false, visible: true,  system: true,  order: 3  },
  { key: 'experience',         label: 'Опыт работы',         type: 'text',    required: false, visible: true,  system: true,  order: 4  },
  { key: 'salary_wish',        label: 'Зарплатные ожидания', type: 'number',  required: false, visible: true,  system: true,  order: 5  },
  { key: 'district_residence', label: 'Район проживания',    type: 'text',    required: false, visible: true,  system: true,  order: 6  },
  { key: 'district_work',      label: 'Район работы',        type: 'text',    required: false, visible: true,  system: true,  order: 7  },
  { key: 'has_car',            label: 'Автомобиль',          type: 'boolean', required: false, visible: true,  system: true,  order: 8  },
  { key: 'resume_source',      label: 'Источник резюме',     type: 'text',    required: false, visible: true,  system: true,  order: 9  },
  { key: 'contact_status',     label: 'Статус контакта',     type: 'text',    required: false, visible: true,  system: true,  order: 10 },
  { key: 'candidate_link',     label: 'Ссылка на профиль',   type: 'text',    required: false, visible: true,  system: true,  order: 11 },
  { key: 'resume_url',         label: 'Ссылка на резюме',    type: 'text',    required: false, visible: true,  system: true,  order: 12 },
  { key: 'notes',              label: 'Заметки',             type: 'text',    required: false, visible: true,  system: true,  order: 13 },
];

// Returns a stable sorted copy
export function sortedFields(fields) {
  return [...fields].sort((a, b) => a.order - b.order);
}

// Merge saved config with system defaults:
// - preserved: label, visible, order overrides from saved
// - system fields always present (can't be deleted)
// - custom fields (system: false) included as-is from saved
export function mergeWithDefaults(saved) {
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return DEFAULT_FIELDS.map(f => ({ ...f }));
  }

  const savedMap = Object.fromEntries(saved.map(f => [f.key, f]));

  // Start with system fields, applying any saved overrides
  const merged = DEFAULT_FIELDS.map(def => ({
    ...def,
    ...(savedMap[def.key]
      ? { label: savedMap[def.key].label, visible: savedMap[def.key].visible, order: savedMap[def.key].order }
      : {}),
  }));

  // Append custom fields (non-system) from saved config
  for (const f of saved) {
    if (!f.system && !merged.find(m => m.key === f.key)) {
      merged.push({ ...f });
    }
  }

  return sortedFields(merged);
}
