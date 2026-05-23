import { useStore } from '@/store';

export function useCanWrite() {
  const role = useStore(s => s.currentProfileRole);
  return role === 'recruiter' || role === 'admin';
}
