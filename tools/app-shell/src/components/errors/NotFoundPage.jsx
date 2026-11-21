import { Link } from 'react-router-dom';
import { useUI } from '@/i18n';

/** ETP-5792 — the view for an unknown route (it replaced a hardcoded English "Loading..."). */
export function NotFoundPage() {
  const ui = useUI();
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center" data-testid="NotFoundPage__5792">
      <h1 className="text-base font-medium text-foreground">{ui('pageNotFoundTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{ui('pageNotFoundBody')}</p>
      <Link to="/" className="mt-4 text-sm text-primary underline" data-testid="NotFoundHome__5792">{ui('pageNotFoundHome')}</Link>
    </div>
  );
}
