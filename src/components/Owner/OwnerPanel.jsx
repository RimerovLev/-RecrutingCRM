import { useState, useEffect, useCallback } from 'react';
import { sb } from '@/lib/supabase';

const PLANS = ['trial', 'monthly', 'semi_annual', 'annual', 'lifetime', 'free'];
const PLAN_MONTHS = { monthly: 1, semi_annual: 6, annual: 12, lifetime: null, free: null, trial: 1 };

export default function OwnerPanel() {
  const [token, setToken]   = useState('');
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState('');

  const [orgs, setOrgs]       = useState([]);
  const [errors, setErrors]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('orgs'); // 'orgs' | 'errors'

  // Grant form state
  const [grantOrgId, setGrantOrgId]   = useState('');
  const [grantPlan, setGrantPlan]     = useState('monthly');
  const [grantMonths, setGrantMonths] = useState('1');
  const [grantMsg, setGrantMsg]       = useState('');

  const load = useCallback(async (tok) => {
    setLoading(true);
    const { data: orgData, error: orgErr } = await sb.rpc('list_orgs_admin', { p_admin_token: tok });
    if (orgErr) { setAuthErr('Неверный токен'); setAuthed(false); setLoading(false); return; }
    setOrgs(orgData || []);

    const { data: errData } = await sb.rpc('list_errors_admin', { p_admin_token: tok, p_limit: 200 });
    setErrors(errData || []);
    setLoading(false);
    setAuthed(true);
  }, []);

  const handleAuth = (e) => {
    e.preventDefault();
    setAuthErr('');
    load(token);
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    setGrantMsg('');
    const months = PLAN_MONTHS[grantPlan] !== undefined
      ? (PLAN_MONTHS[grantPlan] === null ? null : parseInt(grantMonths, 10))
      : parseInt(grantMonths, 10);
    const { data, error } = await sb.rpc('grant_subscription', {
      p_admin_token: token,
      p_org_id:      grantOrgId,
      p_plan:        grantPlan,
      p_months:      months,
    });
    if (error || !data?.success) {
      setGrantMsg('❌ ' + (data?.error || error?.message || 'Ошибка'));
    } else {
      setGrantMsg('✅ Подписка выдана' + (data.expires_at ? ' до ' + new Date(data.expires_at).toLocaleDateString('ru-RU') : ' (бессрочно)'));
      load(token); // refresh table
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full space-y-4">
          <h1 className="text-xl font-bold text-slate-800 text-center">👑 Owner Panel</h1>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="password"
              placeholder="Секретный токен"
              value={token}
              onChange={e => setToken(e.target.value)}
              className="input-field w-full"
              autoFocus
            />
            {authErr && <p className="text-sm text-red-500">{authErr}</p>}
            <button type="submit" className="btn-primary w-full">Войти</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">👑 Owner Panel</h1>
          <button onClick={() => { setAuthed(false); setToken(''); }} className="text-sm text-slate-400 hover:text-slate-600 underline">
            Выйти
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {['orgs', 'errors'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'orgs' ? `Организации (${orgs.length})` : `Ошибки (${errors.length})`}
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-400 text-sm animate-pulse">Загрузка…</div>}

        {/* ── Orgs tab ─────────────────────────────────────────────── */}
        {tab === 'orgs' && !loading && (
          <div className="space-y-6">
            {/* Grant form */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <h2 className="font-semibold text-slate-700">Выдать / обновить подписку</h2>
              <form onSubmit={handleGrant} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-slate-500 mb-1">Org ID</label>
                  <input
                    value={grantOrgId}
                    onChange={e => setGrantOrgId(e.target.value)}
                    placeholder="uuid организации"
                    className="input-field w-full text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">План</label>
                  <select
                    value={grantPlan}
                    onChange={e => {
                      setGrantPlan(e.target.value);
                      const m = PLAN_MONTHS[e.target.value];
                      if (m !== undefined && m !== null) setGrantMonths(String(m));
                    }}
                    className="input-field text-sm"
                  >
                    {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {(grantPlan !== 'lifetime' && grantPlan !== 'free') && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Месяцев</label>
                    <input
                      type="number"
                      min="1"
                      value={grantMonths}
                      onChange={e => setGrantMonths(e.target.value)}
                      className="input-field w-20 text-sm"
                    />
                  </div>
                )}
                <button type="submit" className="btn-primary text-sm h-10">Выдать</button>
              </form>
              {grantMsg && <p className="text-sm text-slate-600">{grantMsg}</p>}
            </div>

            {/* Orgs table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="th">Организация</th>
                    <th className="th">Plan</th>
                    <th className="th">Статус</th>
                    <th className="th">Истекает</th>
                    <th className="th">Дней</th>
                    <th className="th">Org ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(o => (
                    <tr
                      key={o.org_id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setGrantOrgId(o.org_id)}
                      title="Нажми чтобы выбрать org_id"
                    >
                      <td className="px-4 py-2 font-medium text-slate-800">{o.org_name}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          o.plan === 'lifetime' ? 'bg-violet-100 text-violet-700'
                          : o.plan === 'trial'   ? 'bg-amber-100 text-amber-700'
                          : o.plan === 'free'    ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {o.plan}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          o.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {o.sub_status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {o.expires_at ? new Date(o.expires_at).toLocaleDateString('ru-RU') : '∞'}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {o.days_remaining !== null ? o.days_remaining : '∞'}
                      </td>
                      <td className="px-4 py-2 text-slate-300 text-xs font-mono">{o.org_id}</td>
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Нет организаций</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Errors tab ───────────────────────────────────────────── */}
        {tab === 'errors' && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="th">Время</th>
                  <th className="th">Severity</th>
                  <th className="th">Сообщение</th>
                  <th className="th">URL</th>
                </tr>
              </thead>
              <tbody>
                {errors.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                      {new Date(e.created_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        e.severity === 'fatal'   ? 'bg-red-100 text-red-700'
                        : e.severity === 'error' ? 'bg-orange-100 text-orange-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700 max-w-xs">
                      <div className="truncate">{e.message}</div>
                      {e.stack && (
                        <details>
                          <summary className="text-slate-400 cursor-pointer">stack</summary>
                          <pre className="text-slate-500 whitespace-pre-wrap text-xs mt-1 max-h-24 overflow-auto">{e.stack}</pre>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-400 max-w-[180px] truncate">
                      {e.url || '—'}
                    </td>
                  </tr>
                ))}
                {errors.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Нет ошибок 🎉</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
