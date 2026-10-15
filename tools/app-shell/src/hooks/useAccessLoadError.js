import { useSyncExternalStore } from 'react';
import { getAccessLoadError, subscribeAccessLoadError } from '@/lib/accessLoadError.js';

/** React binding for the access-load error store (ETP-5489). */
export function useAccessLoadError() {
  return useSyncExternalStore(subscribeAccessLoadError, getAccessLoadError, getAccessLoadError);
}

export default useAccessLoadError;
