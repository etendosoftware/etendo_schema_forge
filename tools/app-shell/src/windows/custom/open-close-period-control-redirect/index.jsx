import { Navigate } from 'react-router-dom';

/**
 * Open/Close Period Control was merged into the unified Calendar window
 * (ETP-4478). Keeps old bookmarks/deep-links working by redirecting to /calendar.
 */
export default function OpenClosePeriodControlRedirect() {
  return <Navigate to="/calendar" replace data-testid="Navigate__openClosePeriodControlRedirect" />;
}
