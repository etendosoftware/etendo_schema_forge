import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { AccountSelect, SectionShell, useAccountSelectorPages } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { rememberRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import { accountSelectorUrl, resolveAccountSections } from './bpCategoryContactTypes.js';
import { useAssociatedContactsNotice } from './useAssociatedContactsNotice.js';

const ACCOUNTING_ENTITY = 'accounting';

// The inline-editable detail column has no horizontal padding of its own; the header form card
// is `p-2` (decisions `formCardPadding`), so `px-2` lines the section titles up with the header
// fields on both sides.
const PANEL_PADDING_X = 'px-2';
// The tab wrapper already adds `pt-3` (getCustomLinesTabClassName); `pt-2` on the first section
// gives the same ~20px from the tab underline to the content as the header card has from the
// toolbar rule to its first label. Later sections keep SectionShell's `py-6`.
const FIRST_SECTION_PADDING_Y = 'pt-2 pb-6';

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

/**
 * One account of a section: the shared `AccountSelect` fed by the field's NEO selector (posting
 * accounts only) instead of a static catalog. The selected label is the row's `$_identifier`.
 */
function AccountField({ account, row, apiBaseUrl, label, onPick }) {
  const loadPage = useAccountSelectorPages(accountSelectorUrl(apiBaseUrl, ACCOUNTING_ENTITY, account));
  return (
    <AccountSelect
      label={label}
      required={!!account.required}
      value={row[account.key] ?? null}
      displayValue={row[`${account.key}$_identifier`] ?? ''}
      loadPage={loadPage}
      onChange={(id, name) => onPick(account.key, id ?? null, name ?? '')}
      data-testid={`bp-category-acct-${account.key}`}
    />
  );
}

/**
 * Contact category — Accounting tab (ETP-5791), declared as `window.customLinesComponent`.
 *
 * Lays the category's single `C_BP_Group_Acct` row out like the account tabs of the Esquema
 * contable window, with the same shared components: one `SectionShell` card per contact type —
 * Customers (receivables, prepayment, write-off) and Vendor/Creditor (liability, prepayment) —
 * each holding an `AccountSelect` grid. A section follows the header's type checkbox LIVE, from
 * the unsaved form state (`data` is DetailView's editing record): the section of an unchecked
 * type is hidden, and its values are never cleared.
 *
 * Each account selection is PATCHed on its own, so the mandatory accounts of a hidden section
 * never take part in a save: they keep the values the accounting schema pre-filled when the
 * category was created (c_bp_group_trg).
 */
export default function BpCategoryAccountingPanel({ recordId, data, apiBaseUrl, isNew }) {
  const ui = useUI();
  const t = useLabel();
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

  const handlePick = useCallback(async (key, value, label) => {
    if (!row) return;
    const previous = row;
    setRow((prev) => ({ ...prev, [key]: value, [`${key}$_identifier`]: value ? label : '' }));
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
    <div className={PANEL_PADDING_X} data-testid="bp-category-accounting-panel">
      {sections.map((section, idx) => (
        <SectionShell
          key={section.key}
          first={idx === 0}
          paddingY={idx === 0 ? FIRST_SECTION_PADDING_Y : undefined}
          title={ui(section.titleKey)}
          subtitle={ui(section.subtitleKey)}
          data-testid={`bp-category-accounts-${section.key}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {section.accounts.map((account) => (
              <AccountField
                key={account.key}
                account={account}
                row={row}
                apiBaseUrl={apiBaseUrl}
                label={t(account.column) ?? account.key}
                onPick={handlePick}
              />
            ))}
          </div>
        </SectionShell>
      ))}
    </div>
  );
}
