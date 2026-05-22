import { sb } from './config.js';
import { S } from './state.js';
import { toast } from './utils.js';

export function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('auth-login').classList.toggle('hidden', !isLogin);
  document.getElementById('auth-register').classList.toggle('hidden', isLogin);
  const activeClass  = 'font-semibold text-indigo-600 border-b-2 border-indigo-600';
  const idleClass    = 'font-semibold text-slate-400 border-b-2 border-transparent';
  document.getElementById('auth-tab-login').className    = isLogin  ? activeClass : idleClass;
  document.getElementById('auth-tab-register').className = !isLogin ? activeClass : idleClass;
}

export async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { toast('Ошибка входа: ' + error.message, 'err'); return; }
  S.currentUser = data.user;
  await loadProfile();
  showApp();
}

export async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  });
  if (error) { toast('Ошибка: ' + error.message, 'err'); return; }
  toast('Аккаунт создан! Проверьте email для подтверждения.', 'info');
  switchAuthTab('login');
}

export async function handleLogout() {
  await sb.auth.signOut();
  S.currentUser = S.currentProfile = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-page').classList.remove('hidden');
}

export async function loadProfile() {
  if (!S.currentUser) return;
  const { data, error } = await sb.from('profiles').select('*').eq('id', S.currentUser.id).single();
  if (error || !data) {
    const name = S.currentUser.user_metadata?.full_name || S.currentUser.email;
    const { data: np } = await sb.from('profiles').upsert({
      id: S.currentUser.id, full_name: name, role: 'recruiter'
    }, { onConflict: 'id' }).select().single();
    S.currentProfile = np;
  } else {
    S.currentProfile = data;
  }
  document.getElementById('user-display').textContent =
    S.currentProfile?.full_name || S.currentUser.email;
  applyRoleRestrictions();
}

export function applyRoleRestrictions() {
  const role = S.currentProfile?.role || 'recruiter';
  const body = document.body;
  body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
  body.classList.add(`role-${role}`);
  const badge = document.getElementById('role-badge');
  if (badge) {
    badge.textContent = role === 'viewer' ? '👁 viewer' : role === 'admin' ? '⚡ admin' : '';
    badge.style.display = (role === 'viewer' || role === 'admin') ? 'inline-flex' : 'none';
  }
}

export function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  window._showView('dashboard');
}

// ── Telegram Link ──────────────────────────────────────────────────────────
let tgLinkTimerInterval = null;

export function openTelegramLink() {
  document.getElementById('tg-link-modal').classList.add('active');
  document.getElementById('tg-link-content').classList.remove('hidden');
  document.getElementById('tg-link-result').classList.add('hidden');
}

export function closeTelegramLink() {
  document.getElementById('tg-link-modal').classList.remove('active');
  if (tgLinkTimerInterval) clearInterval(tgLinkTimerInterval);
}

export async function generateLinkCode() {
  if (!S.currentUser) return;

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await sb.from('link_codes').insert({
    code,
    recruiter_id: S.currentUser.id,
    expires_at: expiresAt,
    used: false,
  });

  if (error) {
    alert('Ошибка генерации кода: ' + error.message);
    return;
  }

  document.getElementById('tg-link-content').classList.add('hidden');
  document.getElementById('tg-link-result').classList.remove('hidden');
  document.getElementById('tg-link-code').textContent = code;
  document.getElementById('tg-link-cmd').textContent = `/link ${code}`;

  const expiry = Date.now() + 15 * 60 * 1000;
  if (tgLinkTimerInterval) clearInterval(tgLinkTimerInterval);
  tgLinkTimerInterval = setInterval(() => {
    const left = Math.max(0, Math.round((expiry - Date.now()) / 1000));
    const m = Math.floor(left / 60);
    const s = left % 60;
    document.getElementById('tg-link-timer').textContent =
      `Код действует ещё ${m}:${String(s).padStart(2, '0')}`;
    if (left === 0) {
      clearInterval(tgLinkTimerInterval);
      document.getElementById('tg-link-timer').textContent = 'Код истёк. Сгенерируй новый.';
    }
  }, 1000);
}

export function copyLinkCode() {
  const cmd = document.getElementById('tg-link-cmd').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = event.target;
    btn.textContent = '✅ Скопировано!';
    setTimeout(() => btn.textContent = '📋 Скопировать команду', 2000);
  });
}
