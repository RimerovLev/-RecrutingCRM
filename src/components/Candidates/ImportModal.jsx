import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import Modal from '@/components/common/Modal';

// Поля кандидата в нашей схеме
const CRM_FIELDS = [
  { key: 'full_name',          label: 'ФИО *',                required: true  },
  { key: 'phone',              label: 'Телефон',              required: false },
  { key: 'email',              label: 'Email',                required: false },
  { key: 'position',           label: 'Должность',            required: false },
  { key: 'experience',         label: 'Опыт',                 required: false },
  { key: 'salary_wish',        label: 'Желаемая зарплата',    required: false },
  { key: 'district_residence', label: 'Район проживания',     required: false },
  { key: 'district_work',      label: 'Район работы',         required: false },
  { key: 'has_car',            label: 'Есть авто',            required: false },
  { key: 'resume_source',      label: 'Источник резюме',      required: false },
  { key: 'contact_status',     label: 'Статус контакта',      required: false },
  { key: 'notes',              label: 'Заметки',              required: false },
  { key: 'candidate_link',     label: 'Ссылка на профиль',    required: false },
];

const SKIP = '__skip__';

// Parse CSV text → { headers, rows }
function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = String(cols[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// Parse XLSX/XLS ArrayBuffer → { headers, rows }
function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]]; // первый лист
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!raw.length) return { headers: [], rows: [] };

  // Найти первую непустую строку как заголовки
  const headerRowIdx = raw.findIndex(r => r.some(c => String(c).trim() !== ''));
  if (headerRowIdx === -1) return { headers: [], rows: [] };

  const headers = raw[headerRowIdx].map(h => String(h).trim()).filter(Boolean);
  const headerCount = raw[headerRowIdx].length;

  const rows = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const line = raw[i];
    if (line.every(c => String(c).trim() === '')) continue; // пустая строка
    const row = {};
    headers.forEach((h, idx) => {
      const val = line[idx];
      row[h] = val instanceof Date
        ? val.toLocaleDateString('ru-RU')
        : String(val ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

// Автоматический маппинг по похожим именам
function autoMap(csvHeaders) {
  const hints = {
    full_name:          ['имя', 'фио', 'name', 'full_name', 'кандидат', 'фамилия', 'ф.и.о'],
    phone:              ['телефон', 'phone', 'тел', 'моб', 'mobile'],
    email:              ['email', 'почта', 'e-mail', 'мейл'],
    position:           ['должность', 'position', 'вакансия', 'специальность', 'профессия'],
    experience:         ['опыт', 'experience', 'стаж'],
    salary_wish:        ['зарплата', 'salary', 'оклад', 'желаемая', 'зп'],
    district_residence: ['проживание', 'район проживания', 'адрес', 'город'],
    district_work:      ['район работы', 'место работы'],
    has_car:            ['авто', 'автомобиль', 'машина', 'car'],
    resume_source:      ['источник', 'source', 'откуда', 'hh', 'сайт'],
    contact_status:     ['статус', 'status', 'контакт'],
    notes:              ['заметки', 'notes', 'комментарий', 'примечание'],
    candidate_link:     ['ссылка', 'link', 'url', 'linkedin', 'профиль'],
  };

  const mapping = {};
  csvHeaders.forEach(h => { mapping[h] = SKIP; });

  csvHeaders.forEach(csvH => {
    const normalized = csvH.toLowerCase().trim();
    for (const [field, words] of Object.entries(hints)) {
      if (words.some(w => normalized.includes(w))) {
        // Only map if field not already taken
        if (!Object.values(mapping).includes(field)) {
          mapping[csvH] = field;
          break;
        }
      }
    }
  });

  return mapping;
}

export default function ImportModal({ open, onClose, onDone }) {
  const currentUserId = useStore(s => s.currentUserId);
  const currentOrgId  = useStore(s => s.currentOrgId);
  const addToast      = useStore(s => s.addToast);

  const fileRef = useRef();
  const [step,    setStep]    = useState(1); // 1=upload, 2=map, 3=preview, 4=done
  const [parsed,  setParsed]  = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState({});   // { csvCol -> crmField | SKIP }
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);  // { imported, skipped, errors }

  const reset = () => {
    setStep(1); setParsed(null); setMapping({});
    setLoading(false); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step 1: Load file ─────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isXLSX = file.name.match(/\.(xlsx|xls)$/i);
    const isCSV  = file.name.match(/\.(csv|txt)$/i);

    if (!isXLSX && !isCSV) {
      addToast('Поддерживаются .xlsx, .xls, .csv', 'err'); return;
    }

    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        let data;
        if (isXLSX) {
          data = parseXLSX(ev.target.result);
        } else {
          // Try UTF-8, fallback handled by browser
          data = parseCSV(ev.target.result);
        }
        if (!data.headers.length) { addToast('Не удалось прочитать заголовки', 'err'); return; }
        setParsed(data);
        setMapping(autoMap(data.headers));
        setStep(2);
      } catch (err) {
        addToast('Ошибка парсинга: ' + err.message, 'err');
      }
    };

    if (isXLSX) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // ── Step 2→3: confirm mapping ─────────────────────────────────────
  const handleMapping = () => {
    const hasFio = Object.values(mapping).includes('full_name');
    if (!hasFio) { addToast('Нужно сопоставить поле «ФИО»', 'err'); return; }
    setStep(3);
  };

  // Build preview rows (first 5)
  const previewRows = () => {
    if (!parsed) return [];
    return parsed.rows.slice(0, 5).map(row => {
      const rec = {};
      Object.entries(mapping).forEach(([csvCol, crmField]) => {
        if (crmField !== SKIP) rec[crmField] = row[csvCol] || '';
      });
      return rec;
    });
  };

  // ── Step 3→4: import ─────────────────────────────────────────────
  const handleImport = async () => {
    setLoading(true);
    let imported = 0, skipped = 0, errors = 0;
    const BATCH = 50;

    const allRows = parsed.rows.map(row => {
      const rec = { recruiter_id: currentUserId, org_id: currentOrgId, status: 'active', pipeline_stage: 'new' };
      Object.entries(mapping).forEach(([csvCol, crmField]) => {
        if (crmField !== SKIP && row[csvCol]?.trim()) {
          // salary_wish → number
          if (crmField === 'salary_wish') {
            const n = parseInt(String(row[csvCol]).replace(/\D/g, ''));
            if (!isNaN(n)) rec[crmField] = n;
          } else {
            rec[crmField] = row[csvCol].trim();
          }
        }
      });
      return rec;
    }).filter(r => r.full_name?.trim()); // skip rows without name

    skipped = parsed.rows.length - allRows.length;

    // Insert in batches
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      const { error } = await sb.from('candidates').insert(batch);
      if (error) {
        errors += batch.length;
        console.error('Import batch error:', error.message);
      } else {
        imported += batch.length;
      }
    }

    setResult({ imported, skipped, errors, total: parsed.rows.length });
    setLoading(false);
    setStep(4);
    if (imported > 0) onDone?.();
  };

  const mappedCount = Object.values(mapping).filter(v => v !== SKIP).length;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        step === 1 ? 'Импорт кандидатов из CSV' :
        step === 2 ? `Сопоставление колонок (${parsed?.headers.length})` :
        step === 3 ? `Предпросмотр — ${parsed?.rows.length} строк` :
        'Импорт завершён'
      }
    >
      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            border: '2px dashed var(--border)', borderRadius: 12,
            padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
            background: 'var(--bg)',
          }}
            onClick={() => fileRef.current?.click()}
          >
            <p style={{ fontSize: 32, marginBottom: 10 }}>📂</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>
              Перетащи CSV или нажми для выбора
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
              Поддерживаются файлы .csv с разделителем ; или ,
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />

          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
              Как подготовить файл
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)', lineHeight: 1.7 }}>
              Первая строка — названия колонок. Остальные строки — данные.
              Имена колонок могут быть любыми — ты сам сопоставишь их с полями CRM.
              Кодировка UTF-8 или Windows-1251.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Mapping ── */}
      {step === 2 && parsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
            Система автоматически распознала {mappedCount} из {parsed.headers.length} колонок.
            Проверь и скорректируй если нужно.
          </p>

          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {parsed.headers.map(csvCol => (
              <div key={csvCol} style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10,
                background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
                border: mapping[csvCol] !== SKIP ? '1px solid var(--accent2)' : '1px solid var(--border)',
                opacity: mapping[csvCol] === SKIP ? 0.6 : 1,
              }}>
                {/* CSV column name + sample */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>{csvCol}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parsed.rows[0]?.[csvCol] || '—'}
                  </p>
                </div>

                <span style={{ fontSize: 16, color: 'var(--muted)' }}>→</span>

                {/* CRM field selector */}
                <select
                  value={mapping[csvCol]}
                  onChange={e => setMapping(m => ({ ...m, [csvCol]: e.target.value }))}
                  className="input-field"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  <option value={SKIP}>— пропустить —</option>
                  {CRM_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleMapping} className="btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}>
              Далее → Предпросмотр
            </button>
            <button onClick={() => setStep(1)} className="btn-secondary" style={{ padding: '10px 16px' }}>
              Назад
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Preview ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
            Первые 5 записей из {parsed?.rows.length}. Строки без ФИО будут пропущены.
          </p>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {CRM_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                    <th key={f.key} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows().map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {CRM_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                      <td key={f.key} style={{ padding: '8px 12px', color: 'var(--ink2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[f.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
              Будет импортировано: <strong>{parsed?.rows.filter(r => {
                const nameCol = Object.entries(mapping).find(([, v]) => v === 'full_name')?.[0];
                return nameCol && r[nameCol]?.trim();
              }).length}</strong> из {parsed?.rows.length} строк
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleImport}
              disabled={loading}
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}
            >
              {loading ? 'Импортируем…' : `⬆️ Импортировать ${parsed?.rows.length} кандидатов`}
            </button>
            <button onClick={() => setStep(2)} className="btn-secondary" style={{ padding: '10px 16px' }} disabled={loading}>
              Назад
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 4 && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '8px 0' }}>
          <p style={{ fontSize: 48 }}>{result.errors === 0 ? '✅' : '⚠️'}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 700, color: 'var(--green)' }}>{result.imported}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>Импортировано</p>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 700, color: 'var(--amber)' }}>{result.skipped}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>Пропущено</p>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 700, color: result.errors > 0 ? 'var(--accent)' : 'var(--muted)' }}>{result.errors}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>Ошибок</p>
            </div>
          </div>

          {result.skipped > 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
              Строки без ФИО были пропущены автоматически
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleClose} className="btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}>
              Закрыть
            </button>
            <button onClick={reset} className="btn-secondary" style={{ padding: '10px 16px' }}>
              Ещё импорт
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
