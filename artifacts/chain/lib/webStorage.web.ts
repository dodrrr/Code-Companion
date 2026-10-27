import { recoverInterruptedRestore } from '@/domain/backup';
export function prepareWebStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    recoverInterruptedRestore(window.localStorage);
    return null;
  } catch {
    return 'Chain could not recover a previous restore. Free some device space and reload. Your recovery copy is still saved.';
  }
}
