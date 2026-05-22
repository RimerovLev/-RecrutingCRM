import { useEffect } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/store';

// Layout
import Sidebar from '@/components/Layout/Sidebar';
import MobileNav from '@/components/Layout/MobileNav';
import OfflineBanner from '@/components/Layout/OfflineBanner';
import { useOffline } from '@/hooks/useOffline';

// Auth
import AuthPage from '@/components/Auth/AuthPage';

// Pages
import DashboardPage  from '@/components/Dashboard/DashboardPage';
import CandidatesPage from '@/components/Candidates/CandidatesPage';
import VacanciesPage  from '@/components/Vacancies/VacanciesPage';
import KanbanPage     from '@/components/Kanban/KanbanPage';
import RemindersPage  from '@/components/Reminders/RemindersPage';

// Common
import ToastContainer from '@/components/common/Toast';

// Telegram link modal (inline for simplicity)
import TelegramLinkModal from '@/components/Auth/TelegramLinkModal';

async function loadProfile(userId, addToast) {
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
  const currentUser      = useStore(s => s.currentUser);
  const setCurrentUser   = useStore(s => s.setCurrentUser);
  const setCurrentProfile = useStore(s => s.setCurrentProfile);
  const activeView       = useStore(s => s.activeView);
  const addToast         = useStore(s => s.addToast);
  const isOnline         = useOffline();

  useEffect(() => {
    // Init session
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        const profile = await loadProfile(session.user.id, addToast);
        setCurrentProfile(profile);
        // Apply role to body
        if (profile?.role) {
          document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
          document.body.classList.add(`role-${profile.role}`);
        }
      }
    });

    // Auth state changes
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setCurrentUser(session.user);
        const profile = await loadProfile(session.user.id, addToast);
        setCurrentProfile(profile);
        if (profile?.role) {
          document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
          document.body.classList.add(`role-${profile.role}`);
        }
      }
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setCurrentProfile(null);
        document.body.classList.remove('role-viewer', 'role-admin', 'role-recruiter');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (!currentUser) {
    return (
      <>
        <AuthPage />
        <ToastContainer />
      </>
    );
  }

  const PAGE = {
    dashboard:  <DashboardPage />,
    candidates: <CandidatesPage />,
    vacancies:  <VacanciesPage />,
    kanban:     <KanbanPage />,
    reminders:  <RemindersPage />,
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-slate-50 ${!isOnline ? 'pt-10' : ''}`}>
      <OfflineBanner />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {PAGE[activeView] || <DashboardPage />}
      </main>
      <MobileNav />
      <TelegramLinkModal />
      <ToastContainer />
    </div>
  );
}
