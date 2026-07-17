import { Navigate } from 'react-router-dom';

/**
 * Fiscal Calendar was merged into the unified Calendar window (ETP-4478).
 * Keeps old bookmarks/deep-links working by redirecting to /calendar.
 */
export default function FiscalCalendarRedirect() {
  return <Navigate to="/calendar" replace data-testid="Navigate__fiscalCalendarRedirect" />;
}
