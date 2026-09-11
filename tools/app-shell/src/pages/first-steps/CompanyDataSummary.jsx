import { useEffect, useState } from 'react';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';

/**
 * ETP-5190 — what the tenant entered when it created its account, shown read-only.
 *
 *   GET /sws/go/onboarding/company-data
 *     -> { status, companyData: { name, tradeName, taxId, address } | null }
 *
 * Read-only by design: this row is a confirmation, not a second edit surface. Seeing the four
 * values here is what tells the user whether they need to press Configure at all, and keeping
 * the Organization window as the only place they change means the two can never disagree.
 *
 * The values come from the ORGANISATION rather than the signup draft, which provisioning
 * clears — so the panel also stays right after the user edits them.
 */
const ENDPOINT = '/sws/go/onboarding/company-data';

const FIELDS = [
  { key: 'name', labelKey: 'firstStepsCompanyName' },
  { key: 'tradeName', labelKey: 'firstStepsCompanyTradeName' },
  { key: 'taxId', labelKey: 'firstStepsCompanyTaxId' },
  { key: 'address', labelKey: 'firstStepsCompanyAddress' },
];

export default function CompanyDataSummary({ ui }) {
  const token = useAuthOptional()?.token ?? null;
  const apiFetch = useApiFetch(getApiBase());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setLoading(true);
    apiFetch(ENDPOINT)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => { if (!cancelled) setData(body?.companyData ?? null); })
      // A failed read renders nothing rather than an error: the Configure button below still
      // works, so the row stays usable even when the summary cannot be shown.
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, apiFetch]);

  if (loading || !data) return null;

  const present = FIELDS.filter((field) => Boolean(data[field.key]));
  if (present.length === 0) return null;

  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs"
      data-testid="first-steps-company-data"
    >
      {present.map((field) => (
        <div key={field.key} className="contents">
          <dt className="text-muted-foreground">{ui(field.labelKey)}</dt>
          <dd
            className="text-text-primary break-words"
            data-testid={`first-steps-company-${field.key}`}
          >
            {data[field.key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
