import { useEffect, useState } from 'react';
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

// Common
import ToastContainer from '@/components/common/Toast';
import TelegramLinkModal from '@/components/Auth/TelegramLinkModal';

async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) {
    const { data: session } = await sb.auth.getUser();
    const name = session?.user?.user_metadata?.full_name || session?.user?.email || '';
    const { data: np } = await sb.from('profiles').upsert({
      id: userId, full_name: name, role: 'recruiter',
    }, { onConflict: 'id' }).select().single();
    return np;
  }
  return data;
}

export default function App() {
  const currentUserId     = useStore(s => s.currentUserId);
  const currentOrgId      = useStore(s => s.currentOrgId);
  const setCurrentUser    = useStore(s => s.setCurrentUser);
  const setCurrentProfile = useStore(s => s.setCurrentProfile);
  const setCurrentOrgName = useStore(s => s.setCurrentOrgName);
  const setActiveView     = useStore(s => s.setActiveView);
  const clearAuth         = useStore(s => s.clearAuth);
  const language          = useStore(s => s.language);
  const isOnline          = useOffline();
  const location          = useLocation();

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

  // true после первого срабатывания onAuthStateChange (убирает мигание экрана)
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let done = false;
    const markReady = () => { if (!done) { done = true; setAuthReady(true); } };

    const applySession = async (session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        markReady();              // ← сразу показываем приложение, не ждём профиль
        try {
          const profile = await loadProfile(session.user.id);
          setCurrentProfile(profile);
          if (profile?.org_id) {
            const { data: org } = await sb.from('organizations').select('name').eq('id', profile.org_id).single();
            if (org) setCurrentOrgName(org.name);
          }
          if (profile?.role) {
            document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
            document.body.classList.add(`role-${profile.role}`);
          }
        } catch (e) {
          console.warn('loadProfile:', e);
        }
      } else {
        clearAuth();
        document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
        markReady();
      }
    };

    // Primary: getSession читает из localStorage — всегда быстро и надёжно
    sb.auth.getSession().then(({ data: { session } }) => applySession(session));

    // Secondary: слушаем только реальные входы/выходы (не INITIAL_SESSION)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN')  applySession(session);
      if (event === 'SIGNED_OUT') { clearAuth(); document.body.classList.remove('role-viewer','role-admin','role-recruiter'); markReady(); }
    });

    // Safety: если всё зависло — через 5с всё равно показываем страницу
    const timer = setTimeout(markReady, 5000);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  // Service Worker — только в production (в dev кэш ломает hot-reload)
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator && import.meta.env.DEV) {
      // В dev-режиме удаляем все старые SW чтобы не мешали
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      });
    }
  }, []);

  // Пока Supabase не определил состояние — показываем лоадер, не AuthPage
  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-400 text-sm animate-pulse">Загрузка…</div>
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <>
        <AuthPage />
        <ToastContainer />
      </>
    );
  }

  // User logged in but hasn't created/joined an org yet
  if (!currentOrgId) {
    return (
      <>
        <OnboardingPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <OfflineBanner />
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
      <ToastContainer />
    </div>
  );
}
