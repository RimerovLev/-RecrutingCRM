import { useEffect, useState, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';

// Layout
import Sidebar from '@/components/Layout/Sidebar';
import Topbar from '@/components/Layout/Topbar';
import MobileNav from '@/components/Layout/MobileNav';
import OfflineBanner from '@/components/Layout/OfflineBanner';
import { useOffline } from '@/hooks/useOffline';

// Auth
import AuthPage from '@/components/Auth/AuthPage';

// Pages
import DashboardPage   from '@/components/Dashboard/DashboardPage';
import CandidatesPage  from '@/components/Candidates/CandidatesPage';
import VacanciesPage   from '@/components/Vacancies/VacanciesPage';
import KanbanPage      from '@/components/Kanban/KanbanPage';
import RemindersPage   from '@/components/Reminders/RemindersPage';
import InterviewsPage  from '@/components/Interviews/InterviewsPage';
import AdminPage       from '@/components/Admin/AdminPage';
import TemplatesPage   from '@/components/Templates/TemplatesPage';
import OnboardingPage  from '@/components/Onboarding/OnboardingPage';
import OwnerPanel      from '@/components/Owner/OwnerPanel';

// Common
import ToastContainer from '@/components/common/Toast';
import TelegramLinkModal from '@/components/Auth/TelegramLinkModal';
import EmailModal        from '@/components/Email/EmailModal';
import ErrorBoundary  from '@/components/ErrorBoundary';
import SubscriptionGate from '@/components/Subscription/SubscriptionGate';
import TrialBanner    from '@/components/Subscription/TrialBanner';

// ── Session-token helpers ─────────────────────────────────────────────────────
const TOKEN_KEY = 'crm_device_token';

function generateToken() {
  return crypto.randomUUID();
}

/** On fresh login: create a new device token and persist it to the DB. */
async function registerNewToken(deviceHint) {
  const token = generateToken();
  localStorage.setItem(TOKEN_KEY, token);
  await sb.rpc('set_session_token', { p_token: token, p_device_hint: deviceHint || null });
  return token;
}

/**
 * Validate the locally-stored token against the DB.
 * Returns 'ok'       — token matches DB (all good)
 * Returns 'no_token' — no token in localStorage (first load or cleared) → register new one
 * Returns 'invalid'  — token exists but doesn't match DB → another device logged in → sign out
 * THROWS on infrastructure errors (network/DB) — callers must NOT sign out on infra errors.
 */
async function validateToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return 'no_token';
  const { data, error } = await sb.rpc('validate_session_token', { p_token: token });
  if (error) throw error;
  return data ? 'ok' : 'invalid';
}

// ── Profile loader ────────────────────────────────────────────────────────────
async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!error && data) return data;

  // Profile missing — create via SECURITY DEFINER RPC (bypasses RLS safely)
  const { data: userResp } = await sb.auth.getUser();
  const name = userResp?.user?.user_metadata?.full_name || userResp?.user?.email || '';
  const { data: created } = await sb.rpc('ensure_profile', { p_full_name: name });
  return created;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const currentUserId      = useStore(s => s.currentUserId);
  const currentOrgId       = useStore(s => s.currentOrgId);
  const orgSubscription    = useStore(s => s.orgSubscription);
  const subscriptionReady  = useStore(s => s.subscriptionReady);
  const setCurrentUser     = useStore(s => s.setCurrentUser);
  const setCurrentProfile  = useStore(s => s.setCurrentProfile);
  const setCurrentOrgName  = useStore(s => s.setCurrentOrgName);
  const setActiveView      = useStore(s => s.setActiveView);
  const clearAuth          = useStore(s => s.clearAuth);
  const setOrgSubscription = useStore(s => s.setOrgSubscription);
  const language           = useStore(s => s.language);
  const isOnline           = useOffline();
  const location           = useLocation();

  const [authReady, setAuthReady]           = useState(false);
  // true while we're kicking user out due to invalid session token
  const [kickingOut, setKickingOut]         = useState(false);

  const periodicTimerRef = useRef(null);

  // Apply RTL/LTR direction on mount and when language changes
  useEffect(() => {
    document.documentElement.dir  = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Sync activeView store with URL path (for components that still read it)
  useEffect(() => {
    const seg = location.pathname.replace('/', '') || 'dashboard';
    setActiveView(seg);
  }, [location.pathname]);

  // ── Force sign-out helper ────────────────────────────────────────────────
  const forceSignOut = async () => {
    setKickingOut(true);
    localStorage.removeItem(TOKEN_KEY);
    clearAuth();
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn('signOut error:', e);
      // signOut failed (network) — local state already cleared, so proceed
    }
    setKickingOut(false);
  };

  // ── Periodic session validation (every 5 min) ────────────────────────────
  const startPeriodicCheck = () => {
    stopPeriodicCheck();
    periodicTimerRef.current = setInterval(async () => {
      if (!navigator.onLine) return; // skip when offline
      try {
        const result = await validateToken();
        if (result === 'invalid') await forceSignOut();
        if (result === 'no_token') await registerNewToken(navigator.userAgent);
        // 'ok' → do nothing
      } catch (e) {
        // RPC infrastructure error (network blip, DB timeout) — skip this cycle
        console.warn('Session validation error (skipping cycle):', e);
      }
    }, 5 * 60 * 1000);
  };

  const stopPeriodicCheck = () => {
    if (periodicTimerRef.current) {
      clearInterval(periodicTimerRef.current);
      periodicTimerRef.current = null;
    }
  };

  // ── Auth lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    let done = false;
    const markReady = () => { if (!done) { done = true; setAuthReady(true); } };

    const applySession = async (session, isNewLogin = false) => {
      if (session?.user) {
        setCurrentUser(session.user);

        // ── Session token ────────────────────────────────────────────
        if (isNewLogin) {
          // New login: register a fresh token (invalidates other devices)
          try {
            await registerNewToken(navigator.userAgent);
          } catch (e) {
            // DB/network error — user just logged in, let them in;
            // periodic check will re-validate on the next cycle
            console.warn('registerNewToken error (continuing):', e);
          }
          startPeriodicCheck();
        } else {
          // Restored session (page refresh): do NOT validate token here —
          // getSession + onAuthStateChange both fire on refresh and race with
          // each other when registering tokens, causing false 'invalid' results.
          // The periodic check (every 5 min) handles single-device enforcement.
          // Just ensure a token exists so the periodic check has something to verify.
          try {
            const token = localStorage.getItem(TOKEN_KEY);
            if (!token) await registerNewToken(navigator.userAgent);
          } catch (e) {
            console.warn('registerNewToken on restore error (ignoring):', e);
          }
          startPeriodicCheck();
        }

        // ── Profile + org ───────────────────────────────────────────
        try {
          const profile = await loadProfile(session.user.id);
          setCurrentProfile(profile);

          if (profile?.org_id) {
            // Separate try/catch so an org/subscription RPC failure does NOT
            // prevent the subscription gate from activating — we set a safe
            // fallback explicitly so subscriptionReady always becomes true.
            try {
              const [{ data: org }, { data: sub }] = await Promise.all([
                sb.from('organizations').select('name').eq('id', profile.org_id).maybeSingle(),
                sb.rpc('get_org_subscription', { p_org_id: profile.org_id }),
              ]);
              if (org) setCurrentOrgName(org.name);
              setOrgSubscription(sub ?? { found: false, is_active: true, plan: 'trial', expires_at: null, days_remaining: null });
            } catch (orgErr) {
              console.warn('org/subscription load error (using fallback):', orgErr);
              // Graceful fallback: treat as active trial to avoid false positives
              setOrgSubscription({ found: false, is_active: true, plan: 'trial', expires_at: null, days_remaining: null });
            }
          }

          if (profile?.role) {
            document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
            document.body.classList.add(`role-${profile.role}`);
          }
        } catch (e) {
          console.warn('loadProfile:', e);
        }

        markReady();
      } else {
        stopPeriodicCheck();
        clearAuth();
        document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
        markReady();
      }
    };

    // Primary: getSession reads from localStorage — always fast and reliable
    sb.auth.getSession().then(({ data: { session } }) => applySession(session, false));

    // Secondary: listen for real logins/logouts only (not INITIAL_SESSION)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN')  applySession(session, true);
      if (event === 'SIGNED_OUT') {
        stopPeriodicCheck();
        clearAuth();
        document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
        markReady();
      }
    });

    // Safety: if everything hangs — show page after 5s anyway
    const timer = setTimeout(markReady, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      stopPeriodicCheck();
    };
  }, []);

  // Service Worker — only in production (cache breaks hot-reload in dev)
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator && import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      });
    }
  }, []);

  // ── Render states ─────────────────────────────────────────────────────────

  // Loading / kicking out
  if (!authReady || kickingOut) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-400 text-sm animate-pulse">
          {kickingOut ? 'Сессия завершена на другом устройстве…' : 'Загрузка…'}
        </div>
      </div>
    );
  }

  // /owner route is public (has its own token auth)
  if (location.pathname === '/owner') {
    return (
      <ErrorBoundary>
        <OwnerPanel />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  // Not logged in
  if (!currentUserId) {
    return (
      <>
        <AuthPage />
        <ToastContainer />
      </>
    );
  }

  // Logged in but no org yet
  if (!currentOrgId) {
    return (
      <>
        <OnboardingPage />
        <ToastContainer />
      </>
    );
  }

  // Subscription check — block if expired/cancelled/suspended
  // We only gate when subscription is loaded and known-bad.
  // While loading (subscriptionReady = false) we still show the app (graceful).
  const subBlocked = subscriptionReady && orgSubscription && !orgSubscription.is_active;

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <OfflineBanner />
        <TrialBanner />

        {subBlocked && <SubscriptionGate />}

        <Sidebar />
        {/* main-with-sidebar uses CSS class for RTL flipping (see index.css [dir=rtl]) */}
        <div className={`main-with-sidebar ${language === 'he' ? 'md:mr-[220px]' : 'md:ml-[220px]'}`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Topbar />
          <main style={{ flex: 1, paddingBottom: 64 }}>{/* paddingBottom for MobileNav */}
            <Routes>
              <Route path="/"           element={<DashboardPage />} />
              <Route path="/dashboard"  element={<DashboardPage />} />
              <Route path="/candidates" element={<CandidatesPage />} />
              <Route path="/vacancies"  element={<VacanciesPage />} />
              <Route path="/kanban"     element={<KanbanPage />} />
              <Route path="/reminders"  element={<RemindersPage />} />
              <Route path="/interviews" element={<InterviewsPage />} />
              <Route path="/templates"  element={<TemplatesPage />} />
              <Route path="/admin"      element={<AdminPage />} />
              <Route path="*"           element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        <MobileNav />
        <TelegramLinkModal />
        <EmailModal />
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}
