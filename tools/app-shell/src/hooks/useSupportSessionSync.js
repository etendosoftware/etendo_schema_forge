import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import {
  SUPPORT_ACCESS_PATH,
  applySupportSessionFromServer,
  fetchSupportSession,
} from '@/lib/supportSession.js';

/**
 * ETP-5351 — keeps the support-session store (lib/supportSession.js) in step with `GET /sws/go/me`: once per authenticated session and again when the
 * session moves to another client. Mounted once, in App.jsx, inside the AuthProvider.
 *
 * Skipped on the handoff page: the session there is the one being replaced, and a `/me` answering
 * "no support session" for it would reopen the telemetry the page keeps closed.
 */
export function useSupportSessionSync() {
  const auth = useAuthOptional();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const clientId = auth?.clientId ?? null;
  const { pathname } = useLocation();
  const onHandoffPage = pathname === SUPPORT_ACCESS_PATH;

  useEffect(() => {
    if (!isAuthenticated || onHandoffPage) return undefined;
    let cancelled = false;
    fetchSupportSession()
      .then((session) => {
        if (!cancelled) applySupportSessionFromServer(session);
      })
      .catch(() => {
        // An unreadable /me says nothing about the mode; keep the one the tab has.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, clientId, onHandoffPage]);
}
