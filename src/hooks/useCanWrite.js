import { useStore } from '@/store';

export function useCanWrite() {
  const role = useStore(s => s.currentProfile?.role ?? 'recruiter');
  return role === 'recruiter' || role === 'admin';
}
