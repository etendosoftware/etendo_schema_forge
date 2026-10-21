import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { rememberRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import { resolveAccountSections, toAccountFields } from './bpCategoryContactTypes.js';
import { useAssociatedContactsNotice } from './useAssociatedContactsNotice.js';

const ACCOUNTING_ENTITY = 'accounting';

function Notice({ children, testId }) {
  return (
    <div
      className="flex min-h-[120px] items-center justify-center gap-2 rounded-lg border border-dashed border-[hsl(var(--border-control))] px-4 text-center text-sm text-[hsl(var(--muted-foreground))]"
      data-testid={testId}>
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-subtle pb-2 text-foreground">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
    </div>
  );
}

/**
 * Contact category — Accounting tab (ETP-5791), declared as `window.customLinesComponent`.
 *
 * Replaces the one-row inline grid with the category's single `C_BP_Group_Acct` row laid out in
 * two sections: Customers (receivables, prepayment, write-off) and Vendor/Creditor (liability,
 * prepayment). A section follows the header's type checkbox LIVE, from the unsaved form state
 * (`data` is DetailView's editing record): the section of an unchecked type is hidden, and its
 * values are never cleared.
 *
 * Each account selection is PATCHed on its own, so the mandatory accounts of a hidden section
 * never take part in a save: they keep the values the accounting schema pre-filled when the
 * category was created (c_bp_group_trg).
 */
export default function BpCategoryAccountingPanel({ recordId, data, apiBaseUrl, api, token, isNew }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const notifyContacts = useAssociatedContactsNotice();
  const [row, setRow] = useState(null);
  const [status, setStatus] = useState('idle');

  const load = useCallback(async (isStale = () => false) => {
    if (!recordId || isNew) return;
    setStatus('loading');
    try {
      const res = await apiFetch(`/${ACCOUNTING_ENTITY}?parentId=${encodeURIComponent(recordId)}&_startRow=0&_endRow=1`);
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      const first = (body?.response?.data ?? body?.data ?? [])[0] ?? null;
      if (isStale()) return;
      if (first) rememberRecordVersion(first, ACCOUNTING_ENTITY);
      setRow(first);
      setStatus('ready');
    } catch {
      if (!isStale()) setStatus('error');
    }
  }, [apiFetch, recordId, isNew]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  const handleChange = useCallback(async (key, value) => {
    if (!row) return;
    setRow((prev) => ({ ...prev, [key]: value }));
    if (key.includes('$_identifier')) return;
    const previous = row;
    try {
      const res = await apiFetch(`/${ACCOUNTING_ENTITY}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        toast.error(await extractErrorMessage(res, ui));
        setRow(previous);
        return;
      }
      const body = await res.json().catch(() => null);
      const saved = body?.response?.data?.[0] ?? null;
      if (saved) {
        rememberRecordVersion(saved, ACCOUNTING_ENTITY);
        setRow((prev) => ({ ...prev, ...saved }));
      }
      notifyContacts(recordId);
    } catch (err) {
      toast.error(err?.message || ui('error'));
      setRow(previous);
    }
  }, [apiFetch, row, ui, notifyContacts, recordId]);

  const { noType, sections } = resolveAccountSections(data);

  if (noType) return <Notice testId="bp-category-accounts-no-type">{ui('bpCategoryNoTypeAccounts')}</Notice>;
  if (isNew || !recordId) return <Notice testId="bp-category-accounts-save-first">{ui('bpCategoryAccountsSaveFirst')}</Notice>;
  if (status === 'error') return <Notice testId="bp-category-accounts-load-error">{ui('bpCategoryAccountsLoadError')}</Notice>;
  if (status === 'ready' && !row) return <Notice testId="bp-category-accounts-no-row">{ui('bpCategoryNoAccountingRow')}</Notice>;
  if (status !== 'ready') return null;

  return (
    <div className="flex flex-col gap-5 px-2 pb-5 pt-4" data-testid="bp-category-accounting-panel">
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3" data-testid={`bp-category-accounts-${section.key}`}>
          <SectionHeader title={ui(section.titleKey)} />
          <EntityForm
            entity={ACCOUNTING_ENTITY}
            fields={toAccountFields(section)}
            data={row}
            onChange={handleChange}
            cols={3}
            api={api}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="EntityForm__bpCategoryAccounts" />
        </section>
      ))}
    </div>
  );
}
