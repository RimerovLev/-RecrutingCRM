import { useEffect, useState, useCallback } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';
import { useI18n } from '@/hooks/useI18n';
import Modal from '@/components/common/Modal';
import OrgFieldsEditor from './OrgFieldsEditor';
import ReportsTab     from './ReportsTab';

// ── Helpers ──────────────────────────────────────────────────────
function fmt(n) { return n ?? 0; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const TAB_IDS = ['overview', 'team', 'hr', 'candidates', 'vacancies', 'activity', 'reports'];

// ── Mini stat card ───────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    slate:  'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

// ── Export helpers ───────────────────────────────────────────────
function downloadCSV(filename, rows, headers) {
  const BOM = '﻿';
  const hdr = headers.join(',');
  const body = rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([BOM + hdr + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

async function exportXLSX(filename, sheets) {
  // sheets: [{ name, headers, rows }]
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').catch(() => null);
  if (!XLSX) { alert('Не удалось загрузить xlsx библиотеку'); return; }
  const wb = XLSX.utils.book_new();
  for (const { name, headers, rows } of sheets) {
    const data = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

function generateDocxHtml(title, sections) {
  // sections: [{ heading, rows: [{label, value}] | table: {headers, rows} }]
  let html = `<html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:12pt;margin:40px}
    h1{color:#4338ca;font-size:18pt;margin-bottom:10px}
    h2{color:#374151;font-size:14pt;margin-top:20px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11pt}
    th{background:#4338ca;color:#fff;padding:6px 10px;text-align:left}
    td{border-bottom:1px solid #e5e7eb;padding:5px 10px}
    tr:nth-child(even) td{background:#f9fafb}
    .meta{color:#6b7280;font-size:10pt;margin-bottom:20px}
  </style></head><body>`;
  html += `<h1>${title}</h1>`;
  html += `<p class="meta">Сформировано: ${new Date().toLocaleString('ru-RU')}</p>`;
  for (const s of sections) {
    html += `<h2>${s.heading}</h2>`;
    if (s.table) {
      html += '<table><tr>' + s.table.headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
      for (const r of s.table.rows) {
        html += '<tr>' + s.table.headers.map(h => `<td>${r[h] ?? ''}</td>`).join('') + '</tr>';
      }
      html += '</table>';
    }
    if (s.rows) {
      html += '<table>' + s.rows.map(r => `<tr><td><b>${r.label}</b></td><td>${r.value}</td></tr>`).join('') + '</table>';
    }
  }
  html += '</body></html>';
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'report.doc' }).click();
  URL.revokeObjectURL(url);
}

function generatePDF(title, sections) {
  const win = window.open('', '_blank');
  if (!win) { alert('Разрешите всплывающие окна для экспорта PDF'); return; }
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;font-size:11pt;margin:30px;color:#111}
    h1{color:#4338ca;font-size:16pt}h2{font-size:13pt;margin-top:18px;border-bottom:1px solid #ddd;padding-bottom:3px}
    table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:6px}
    th{background:#4338ca;color:#fff;padding:5px 8px;text-align:left}
    td{border-bottom:1px solid #e5e7eb;padding:4px 8px}
    tr:nth-child(even) td{background:#f9fafb}
    .meta{color:#888;font-size:9pt}
    @media print{button{display:none}}
  </style></head><body>`;
  html += `<h1>${title}</h1><p class="meta">Сформировано: ${new Date().toLocaleString('ru-RU')}</p>`;
  html += `<button onclick="window.print()" style="margin-bottom:16px;padding:8px 20px;background:#4338ca;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Печать / Сохранить PDF</button>`;
  for (const s of sections) {
    html += `<h2>${s.heading}</h2>`;
    if (s.table) {
      html += '<table><tr>' + s.table.headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
      for (const r of s.table.rows) {
        html += '<tr>' + s.table.headers.map(h => `<td>${r[h] ?? ''}</td>`).join('') + '</tr>';
      }
      html += '</table>';
    }
    if (s.rows) {
      html += '<table>' + s.rows.map(r => `<tr><td><b>${r.label}</b></td><td>${r.value}</td></tr>`).join('') + '</table>';
    }
  }
  html += '</body></html>';
  win.document.write(html);
  win.document.close();
}

// ── Main component ───────────────────────────────────────────────
export default function AdminPage() {
  const currentProfileRole = useStore(s => s.currentProfileRole);
  const currentOrgId       = useStore(s => s.currentOrgId);
  const currentOrgName     = useStore(s => s.currentOrgName);
  const addToast           = useStore(s => s.addToast);
  const openDrawer         = useStore(s => s.openDrawer);

  const [tab, setTab] = useState('overview');

  // Team state
  const [members,      setMembers]      = useState([]);
  const [invites,      setInvites]      = useState([]);
  const [teamLoading,  setTeamLoading]  = useState(false);
  const [newInvite,    setNewInvite]    = useState(null); // { token, role, expires_at }
  const [inviteRole,   setInviteRole]   = useState('recruiter');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [editMember,   setEditMember]   = useState(null);
  const [editMemberRole, setEditMemberRole] = useState('recruiter');
  const [hrStats, setHrStats]         = useState([]);
  const [allCandidates, setAllCandidates] = useState([]);
  const [allVacancies, setAllVacancies]   = useState([]);
  const [activity, setActivity]           = useState([]);
  const [loading, setLoading]             = useState(true);

  // HR edit modal
  const [editHr, setEditHr]   = useState(null);
  const [editRole, setEditRole] = useState('recruiter');

  // Candidate search/filter
  const [candSearch, setCandSearch] = useState('');
  const [candHrFilter, setCandHrFilter] = useState('');

  const { t }              = useI18n();
  const isAdmin = currentProfileRole === 'admin';

  const TABS = [
    { id: 'overview',    label: t('admin.tabOverview') },
    { id: 'team',        label: t('admin.tabTeam') },
    { id: 'hr',          label: t('admin.tabCandidates') },
    { id: 'candidates',  label: '👤 ' + t('nav.candidates') },
    { id: 'vacancies',   label: '💼 ' + t('nav.vacancies') },
    { id: 'activity',    label: t('admin.tabActivity') },
    { id: 'reports',     label: t('admin.tabReports') },
    { id: 'fields',      label: '🗂 Поля' },
  ];

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [hrRes, candRes, vacRes, actRes] = await Promise.all([
      sb.from('admin_hr_stats').select('*').order('total_candidates', { ascending: false }),
      sb.from('admin_all_candidates').select('*').order('created_at', { ascending: false }),
      sb.from('vacancies').select('*, profiles(full_name), candidacies(count)').order('created_at', { ascending: false }),
      sb.from('admin_activity_log').select('*').limit(200),
    ]);
    setHrStats(hrRes.data || []);
    setAllCandidates(candRes.data || []);
    setAllVacancies(vacRes.data || []);
    setActivity(actRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    const [{ data: mems }, { data: invs }] = await Promise.all([
      sb.rpc('get_org_members'),
      sb.from('org_invites').select('*').order('created_at', { ascending: false }),
    ]);
    setMembers(mems || []);
    setInvites(invs || []);
    setTeamLoading(false);
  }, []);

  useEffect(() => { if (tab === 'team' && isAdmin) loadTeam(); }, [tab, isAdmin]);

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    const { data, error } = await sb.rpc('create_invite', { p_role: inviteRole });
    setCreatingInvite(false);
    if (error || data?.error) { addToast(data?.error || error.message, 'err'); return; }
    setNewInvite(data);
    loadTeam();
  };

  const handleRevokeInvite = async (id) => {
    await sb.from('org_invites').delete().eq('id', id);
    loadTeam();
  };

  const handleUpdateMemberRole = async () => {
    const { data, error } = await sb.rpc('update_member_role', {
      p_user_id: editMember.id,
      p_role: editMemberRole,
    });
    if (error || data?.error) { addToast(data?.error || error.message, 'err'); return; }
    addToast(t('admin.changeRole') + ' ✓');
    setEditMember(null);
    loadTeam();
  };

  const updateRole = async () => {
    const { error } = await sb.from('profiles').update({ role: editRole }).eq('id', editHr.recruiter_id);
    if (error) { addToast('Ошибка: ' + error.message, 'err'); return; }
    addToast(t('admin.changeRole') + ' ✓');
    setEditHr(null);
    loadAll();
  };

  // ── Overview stats ────────────────────────────────────────────
  const totalCands = allCandidates.length;
  const totalHRs   = hrStats.length;
  const totalVacs  = allVacancies.length;
  const openVacs   = allVacancies.filter(v => v.status === 'open').length;
  const activeCands = allCandidates.filter(c => c.status === 'active').length;

  // ── Filtered candidates ───────────────────────────────────────
  const filteredCands = allCandidates.filter(c => {
    const q = candSearch.toLowerCase();
    const matchQ = !q || (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) || (c.position || '').toLowerCase().includes(q);
    const matchHr = !candHrFilter || c.recruiter_id === candHrFilter;
    return matchQ && matchHr;
  });

  // ── Export functions ──────────────────────────────────────────
  const exportHrXLSX = async () => {
    const headers = ['Рекрутер', 'Email', 'Роль', 'Кандидатов всего', 'Активных', 'В работе', 'Вакансий', 'Интервью', 'Напоминаний'];
    const rows = hrStats.map(h => ({
      'Рекрутер': h.full_name || '',
      'Email': h.email || '',
      'Роль': h.role || '',
      'Кандидатов всего': h.total_candidates,
      'Активных': h.active_candidates,
      'В работе': h.in_work_candidates,
      'Вакансий': h.total_vacancies,
      'Интервью': h.total_interviews,
      'Напоминаний': h.pending_reminders,
    }));
    try {
      const XLSX = (await import('xlsx')).default;
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Рекрутеры');
      XLSX.writeFile(wb, 'отчёт_рекрутеры.xlsx');
    } catch {
      downloadCSV('отчёт_рекрутеры.csv', rows, headers);
      addToast('Сохранено как CSV (xlsx недоступен)');
      return;
    }
    addToast('Excel скачан ✓');
  };

  const exportAllCandsXLSX = async () => {
    const headers = ['ФИО', 'Email', 'Телефон', 'Должность', 'Статус', 'Рекрутер', 'Добавлен'];
    const rows = allCandidates.map(c => ({
      'ФИО': c.full_name || '',
      'Email': c.email || '',
      'Телефон': c.phone || '',
      'Должность': c.position || '',
      'Статус': c.status || '',
      'Рекрутер': c.recruiter_name || '',
      'Добавлен': fmtDate(c.created_at),
    }));
    try {
      const XLSX = (await import('xlsx')).default;
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Кандидаты');
      XLSX.writeFile(wb, 'отчёт_все_кандидаты.xlsx');
    } catch {
      downloadCSV('отчёт_все_кандидаты.csv', rows, headers);
      addToast('Сохранено как CSV');
      return;
    }
    addToast('Excel скачан ✓');
  };

  const exportHrDoc = () => {
    generateDocxHtml('Отчёт по рекрутерам', [{
      heading: 'Статистика рекрутеров',
      table: {
        headers: ['Рекрутер', 'Роль', 'Кандидатов', 'Активных', 'Вакансий', 'Интервью'],
        rows: hrStats.map(h => ({
          'Рекрутер': h.full_name || '',
          'Роль': h.role || '',
          'Кандидатов': h.total_candidates,
          'Активных': h.active_candidates,
          'Вакансий': h.total_vacancies,
          'Интервью': h.total_interviews,
        })),
      },
    }]);
    addToast('Word-файл скачан ✓');
  };

  const exportHrPDF = () => {
    generatePDF('Отчёт по рекрутерам', [{
      heading: 'Статистика рекрутеров',
      table: {
        headers: ['Рекрутер', 'Роль', 'Кандидатов', 'Активных', 'Вакансий', 'Интервью'],
        rows: hrStats.map(h => ({
          'Рекрутер': h.full_name || '',
          'Роль': h.role || '',
          'Кандидатов': h.total_candidates,
          'Активных': h.active_candidates,
          'Вакансий': h.total_vacancies,
          'Интервью': h.total_interviews,
        })),
      },
    }]);
  };

  const exportVacanciesDoc = () => {
    generateDocxHtml('Отчёт по вакансиям', [{
      heading: 'Все вакансии',
      table: {
        headers: ['Вакансия', 'Рекрутер', 'Статус', 'Отдел', 'Кандидатов', 'Дедлайн'],
        rows: allVacancies.map(v => ({
          'Вакансия': v.title || '',
          'Рекрутер': v.profiles?.full_name || '',
          'Статус': v.status || '',
          'Отдел': v.department || '',
          'Кандидатов': v.candidacies?.[0]?.count ?? 0,
          'Дедлайн': fmtDate(v.deadline),
        })),
      },
    }]);
    addToast('Word-файл скачан ✓');
  };

  const exportVacanciesPDF = () => {
    generatePDF('Отчёт по вакансиям', [{
      heading: 'Все вакансии',
      table: {
        headers: ['Вакансия', 'Рекрутер', 'Статус', 'Отдел', 'Кандидатов', 'Дедлайн'],
        rows: allVacancies.map(v => ({
          'Вакансия': v.title || '',
          'Рекрутер': v.profiles?.full_name || '',
          'Статус': v.status || '',
          'Отдел': v.department || '',
          'Кандидатов': v.candidacies?.[0]?.count ?? 0,
          'Дедлайн': fmtDate(v.deadline),
        })),
      },
    }]);
  };

  const exportActivityPDF = () => {
    generatePDF('Отчёт по активности (30 дней)', [{
      heading: 'Лог активности',
      table: {
        headers: ['Событие', 'Рекрутер', 'Кандидат', 'Дата'],
        rows: activity.map(a => ({
          'Событие': a.event_type === 'candidate_added' ? 'Добавлен кандидат' : a.event_type === 'stage_changed' ? 'Смена этапа' : 'Интервью',
          'Рекрутер': a.recruiter_name || '',
          'Кандидат': a.object_name || '',
          'Дата': fmtDateTime(a.event_at),
        })),
      },
    }]);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="text-center">
          <p className="text-5xl mb-3">🔐</p>
          <p className="font-semibold">{t('admin.title')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="page-title mb-0">⚡ {t('admin.title')}</h2>
        </div>
        <button onClick={loadAll} className="btn-secondary btn-sm">🔄</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`whitespace-nowrap text-sm px-4 py-2 rounded-xl font-semibold transition ${
              tab === tb.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card p-10 text-center text-slate-400">{t('common.loading')}</div>
      )}

      {!loading && (
        <>
          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <StatCard label={t('admin.colRecruiter')} value={totalHRs} color="indigo" />
                <StatCard label={t('admin.colCandidates')} value={totalCands} sub={`${activeCands} ${t('admin.colActive').toLowerCase()}`} color="emerald" />
                <StatCard label={t('nav.vacancies')} value={totalVacs} sub={`${openVacs} ${t('vacStatus.open').toLowerCase()}`} color="amber" />
                <StatCard label={t('admin.colInterviews')} value={hrStats.reduce((s,h)=>s+fmt(h.total_interviews),0)} color="purple" />
                <StatCard label={t('nav.reminders')} value={hrStats.reduce((s,h)=>s+fmt(h.pending_reminders),0)} color="slate" />
              </div>

              {/* Top HR table */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-700">
                  {t('admin.hrStats')}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">{t('admin.colRecruiter')}</th>
                        <th className="px-4 py-3 text-right">{t('admin.colCandidates')}</th>
                        <th className="px-4 py-3 text-right">{t('admin.colActive')}</th>
                        <th className="px-4 py-3 text-right">{t('nav.vacancies')}</th>
                        <th className="px-4 py-3 text-right">{t('admin.colInterviews')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {hrStats.slice(0, 10).map(h => (
                        <tr key={h.recruiter_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold">{h.full_name || h.email}</td>
                          <td className="px-4 py-3 text-right">{h.total_candidates}</td>
                          <td className="px-4 py-3 text-right text-emerald-600">{h.active_candidates}</td>
                          <td className="px-4 py-3 text-right">{h.total_vacancies}</td>
                          <td className="px-4 py-3 text-right text-purple-600">{h.total_interviews}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TEAM ─────────────────────────────────────────────── */}
          {tab === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Org header */}
              <div className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Организация</p>
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{currentOrgName || '—'}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{members.length} участников</p>
                </div>
              </div>

              {/* Invite generator */}
              <div className="card" style={{ padding: '20px 24px' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>{t('admin.inviteTitle')}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="input-field"
                    style={{ width: 180, padding: '8px 12px' }}
                  >
                    <option value="recruiter">Рекрутер</option>
                    <option value="viewer">Просмотр</option>
                    <option value="admin">Администратор</option>
                  </select>
                  <button
                    onClick={handleCreateInvite}
                    disabled={creatingInvite}
                    className="btn-primary"
                  >
                    {creatingInvite ? t('common.loading') : '🔗 ' + t('admin.genInvite')}
                  </button>
                </div>

                {newInvite && (
                  <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
                      Ссылка действительна 7 дней · Роль: <strong>{newInvite.role}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{
                        flex: 1, padding: '8px 12px', background: 'var(--white)', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 12, wordBreak: 'break-all',
                        fontFamily: 'monospace', color: 'var(--ink)',
                      }}>
                        {newInvite.token}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(newInvite.token); addToast(t('common.copied')); }}
                        className="btn-secondary"
                        style={{ padding: '8px 12px', flexShrink: 0 }}
                      >📋</button>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', marginTop: 8 }}>
                      Коллега вставит этот код на экране приветствия → «Присоединиться по приглашению»
                    </p>
                  </div>
                )}
              </div>

              {/* Members list */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  Участники
                </div>
                {teamLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>Загрузка…</div>
                ) : (
                  members.map(m => {
                    const initials = (m.full_name || 'U').slice(0, 2).toUpperCase();
                    const roleColors = { admin: 'var(--accent)', recruiter: 'var(--accent2)', viewer: 'var(--muted)' };
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, var(--accent), #b83410)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: '#fff',
                        }}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.full_name || '—'}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
                            {new Date(m.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: 'var(--bg)', color: roleColors[m.role] || 'var(--muted)',
                          fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: 1,
                        }}>{m.role}</span>
                        <button
                          onClick={() => { setEditMember(m); setEditMemberRole(m.role); }}
                          style={{ fontSize: 11, color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}
                        >Изменить</button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Active invites */}
              {invites.filter(i => !i.used && new Date(i.expires_at) > new Date()).length > 0 && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    Активные приглашения
                  </div>
                  {invites.filter(i => !i.used && new Date(i.expires_at) > new Date()).map(inv => (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                      <code style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.token}
                      </code>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>{inv.role}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                        до {new Date(inv.expires_at).toLocaleDateString('ru-RU')}
                      </span>
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, flexShrink: 0 }}
                      >Отозвать</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Edit member role modal */}
              {editMember && (
                <Modal open={!!editMember} onClose={() => setEditMember(null)} title={`Изменить роль — ${editMember.full_name}`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label className="form-label">Роль</label>
                      <select
                        value={editMemberRole}
                        onChange={e => setEditMemberRole(e.target.value)}
                        className="input-field"
                      >
                        <option value="recruiter">Рекрутер — может создавать и редактировать</option>
                        <option value="viewer">Просмотр — только чтение</option>
                        <option value="admin">Администратор — полный доступ</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={handleUpdateMemberRole} className="btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }}>
                        Сохранить
                      </button>
                      <button onClick={() => setEditMember(null)} className="btn-secondary" style={{ padding: '10px 20px' }}>
                        Отмена
                      </button>
                    </div>
                  </div>
                </Modal>
              )}

            </div>
          )}

          {/* ── HR LIST ──────────────────────────────────────────── */}
          {tab === 'hr' && (
            <div className="space-y-3">
              {hrStats.map(h => (
                <div key={h.recruiter_id} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-black text-indigo-700 text-lg shrink-0">
                      {(h.full_name || h.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">{h.full_name || h.email}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          h.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          h.role === 'viewer' ? 'bg-slate-100 text-slate-500' :
                          'bg-blue-100 text-blue-700'
                        }`}>{h.role}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{h.email}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                        <span>👤 {h.total_candidates} канд.</span>
                        <span className="text-emerald-600">✓ {h.active_candidates} активных</span>
                        <span>💼 {h.total_vacancies} вакансий</span>
                        <span className="text-purple-600">🤝 {h.total_interviews} интервью</span>
                        <span className="text-amber-600">🔔 {h.pending_reminders} напоминаний</span>
                      </div>
                      {h.last_candidate_added && (
                        <p className="text-xs text-slate-300 mt-1">Последний кандидат: {fmtDate(h.last_candidate_added)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setEditHr(h); setEditRole(h.role); }}
                      className="btn-secondary btn-sm shrink-0">
                      ✏️ Роль
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ALL CANDIDATES ───────────────────────────────────── */}
          {tab === 'candidates' && (
            <div>
              <div className="flex gap-3 mb-4 flex-wrap">
                <input className="input-field flex-1 min-w-48" placeholder="Поиск по имени, email, должности…"
                  value={candSearch} onChange={e => setCandSearch(e.target.value)} />
                <select className="input-field w-48" value={candHrFilter} onChange={e => setCandHrFilter(e.target.value)}>
                  <option value="">Все рекрутеры</option>
                  {hrStats.map(h => <option key={h.recruiter_id} value={h.recruiter_id}>{h.full_name || h.email}</option>)}
                </select>
                <button onClick={exportAllCandsXLSX} className="btn-secondary btn-sm">📥 Excel</button>
              </div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Кандидат</th>
                        <th className="px-4 py-3 text-left">Должность</th>
                        <th className="px-4 py-3 text-left">Рекрутер</th>
                        <th className="px-4 py-3 text-left">Статус</th>
                        <th className="px-4 py-3 text-left">Добавлен</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCands.slice(0, 100).map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button onClick={() => openDrawer(c.id)}
                              className="font-semibold text-slate-800 hover:text-indigo-600 transition text-left">
                              {c.full_name}
                            </button>
                            {c.email && <div className="text-xs text-slate-400">{c.email}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{c.position || '—'}</td>
                          <td className="px-4 py-3 text-slate-500">{c.recruiter_name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                              c.status === 'in_work' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>{c.status || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(c.created_at)}</td>
                        </tr>
                      ))}
                      {filteredCands.length > 100 && (
                        <tr><td colSpan={5} className="px-4 py-3 text-center text-slate-400 text-xs">
                          Показано 100 из {filteredCands.length}. Используйте поиск для уточнения.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ALL VACANCIES ────────────────────────────────────── */}
          {tab === 'vacancies' && (
            <div>
              <div className="flex justify-end mb-4 gap-2">
                <button onClick={exportVacanciesDoc} className="btn-secondary btn-sm">📄 Word</button>
                <button onClick={exportVacanciesPDF} className="btn-secondary btn-sm">🖨 PDF</button>
              </div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Вакансия</th>
                        <th className="px-4 py-3 text-left">Рекрутер</th>
                        <th className="px-4 py-3 text-left">Отдел</th>
                        <th className="px-4 py-3 text-left">Статус</th>
                        <th className="px-4 py-3 text-right">Кандидатов</th>
                        <th className="px-4 py-3 text-left">Дедлайн</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allVacancies.map(v => {
                        const candCnt = v.candidacies?.[0]?.count ?? 0;
                        return (
                          <tr key={v.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-semibold text-slate-800">{v.title}</td>
                            <td className="px-4 py-3 text-slate-500">{v.profiles?.full_name || '—'}</td>
                            <td className="px-4 py-3 text-slate-400">{v.department || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                v.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                                v.status === 'in_work' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{v.status}</span>
                            </td>
                            <td className="px-4 py-3 text-right">{candCnt}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(v.deadline)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ACTIVITY ─────────────────────────────────────────── */}
          {tab === 'activity' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={exportActivityPDF} className="btn-secondary btn-sm">🖨 PDF</button>
              </div>
              <div className="space-y-2">
                {activity.slice(0, 100).map((a, i) => {
                  const icon = a.event_type === 'candidate_added' ? '👤' :
                               a.event_type === 'stage_changed' ? '🔄' : '🤝';
                  const label = a.event_type === 'candidate_added' ? 'добавил кандидата' :
                                a.event_type === 'stage_changed' ? 'сменил этап' : 'создал интервью';
                  return (
                    <div key={i} className="card p-3 flex items-center gap-3 text-sm">
                      <span className="text-xl shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-700">{a.recruiter_name}</span>
                        <span className="text-slate-400 mx-1">{label}</span>
                        <span className="text-slate-600">«{a.object_name}»</span>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{fmtDateTime(a.event_at)}</span>
                    </div>
                  );
                })}
                {activity.length === 0 && (
                  <div className="card p-10 text-center text-slate-400">Нет активности за 30 дней</div>
                )}
              </div>
            </div>
          )}

          {/* ── REPORTS ──────────────────────────────────────────── */}
          {tab === 'reports' && (
            <ReportsTab
              candidates={allCandidates}
              vacancies={allVacancies}
              activity={activity}
              hrStats={hrStats}
              exportFns={{
                hrXLSX:  exportHrXLSX,
                hrDoc:   exportHrDoc,
                hrPDF:   exportHrPDF,
                vacXLSX: async () => {
                  const headers = ['Вакансия', 'Рекрутер', 'Статус', 'Отдел', 'Кандидатов', 'Дедлайн'];
                  const rows = allVacancies.map(v => ({
                    'Вакансия': v.title, 'Рекрутер': v.profiles?.full_name || '',
                    'Статус': v.status, 'Отдел': v.department || '',
                    'Кандидатов': v.candidacies?.[0]?.count ?? 0, 'Дедлайн': fmtDate(v.deadline),
                  }));
                  try {
                    const XLSX = (await import('xlsx')).default;
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Вакансии');
                    XLSX.writeFile(wb, 'отчёт_вакансии.xlsx');
                    addToast('Excel скачан ✓');
                  } catch { downloadCSV('отчёт_вакансии.csv', rows, headers); addToast('CSV скачан ✓'); }
                },
                vacDoc:  exportVacanciesDoc,
                vacPDF:  exportVacanciesPDF,
                actCSV:  () => {
                  const EVENT = { candidate_added: 'Добавлен кандидат', stage_changed: 'Смена этапа', interview_created: 'Интервью' };
                  const headers = ['Событие', 'Рекрутер', 'Кандидат', 'Дата'];
                  const rows = activity.map(a => ({
                    'Событие': EVENT[a.event_type] || a.event_type,
                    'Рекрутер': a.recruiter_name || '',
                    'Кандидат': a.object_name || '',
                    'Дата': fmtDateTime(a.event_at),
                  }));
                  downloadCSV('отчёт_активность.csv', rows, headers);
                  addToast('CSV скачан ✓');
                },
                actPDF:  exportActivityPDF,
              }}
            />
          )}

          {/* ── FIELDS EDITOR ───────────────────────────────────── */}
          {tab === 'fields' && (
            <OrgFieldsEditor />
          )}
        </>
      )}

      {/* ── Edit role modal ──────────────────────────────────────── */}
      <Modal open={!!editHr} onClose={() => setEditHr(null)} title="Изменить роль">
        {editHr && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg px-4 py-3">
              <p className="font-semibold text-slate-800">{editHr.full_name || editHr.email}</p>
              <p className="text-xs text-slate-400">{editHr.email}</p>
            </div>
            <div>
              <label className="form-label">Роль</label>
              <div className="flex gap-2">
                {[['recruiter', '👤 Рекрутер'], ['admin', '⚡ Администратор'], ['viewer', '👁 Viewer']].map(([r, l]) => (
                  <button type="button" key={r} onClick={() => setEditRole(r)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition ${
                      editRole === r ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400">
              {editRole === 'admin' && '⚠️ Администратор видит данные всех рекрутеров'}
              {editRole === 'viewer' && '👁 Viewer может только просматривать данные'}
              {editRole === 'recruiter' && '👤 Рекрутер управляет своей базой кандидатов'}
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={updateRole} className="btn-primary flex-1 justify-center py-2.5">💾 Сохранить</button>
              <button onClick={() => setEditHr(null)} className="btn-secondary px-6">Отмена</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
