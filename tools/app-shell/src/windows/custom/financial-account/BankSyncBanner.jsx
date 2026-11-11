import { InfoBanner } from '@/components/InfoBanner.jsx';
import { BankSyncIcon } from '@/components/financial-accounts/BankSyncIcon.jsx';
import { useUI } from '@/i18n';

const MAX_NAMES = 3;
// Stands in for {name} while the sentence is translated, so the name can be rendered as its own
// (semibold) node wherever the locale puts it, instead of being concatenated after the fact.
const NAME_SLOT = '\u0000name\u0000';

/**
 * The translated sentence with `name` emphasized. Splitting on a sentinel keeps each locale's word
 * order; if the sentinel is missing (a dictionary without the key echoes it back), the text is
 * shown as is.
 */
function sentenceWithName(ui, key, name, testId) {
  const parts = ui(key, { name: NAME_SLOT }).split(NAME_SLOT);
  if (parts.length < 2) return ui(key, { name });
  return parts.flatMap((part, i) => (i === 0 ? [part] : [
    <strong key={`n${i}`} className="font-semibold" data-testid={`${testId}-name`}>{name}</strong>,
    part,
  ]));
}

/** The banner's icon: the "traer extractos" glyph, bobbing. */
function SyncingIcon({ className = '' }) {
  return (
    <BankSyncIcon
      spinning
      className={`h-5 w-5 ${className}`}
      data-testid="bank-sync-banner-icon" />
  );
}

/**
 * ETP-6154 — "a bank sync is running" banner, shown above the accounts table and above the tabs of
 * an account's detail while at least one of the given accounts syncs. It goes away on its own when
 * the sync ends; the outcome is still announced by the one result toast (bankSyncNotify.js).
 *
 * Built on the shared `InfoBanner` (info tone, not dismissible — it is a live status, not a
 * notice to acknowledge), with `role="status"` + `aria-live="polite"` so assistive technology
 * announces it without interrupting.
 *
 * Titles:
 * - one account → "Sincronizando movimientos de **{name}**" (or the generic in-progress sentence
 *   when no host declared its name);
 * - several → "Sincronizando movimientos de {count} cuentas", followed by the names, semibold, on
 *   one line (at most three, the full list is in its `title`).
 * No trailing "…" in either: names often end in an IBAN, and an ellipsis right after one reads as
 * a cut-off name. The spinning icon already says "in progress".
 *
 * @param {{
 *   accounts: Array<{id: string, name: string|null}>,
 *   className?: string,
 *   'data-testid'?: string,
 * }} props `accounts` = the running syncs to describe (`bankSync.syncingAccounts`, filtered by
 *   the host when it shows a single account)
 */
export function BankSyncBanner({ accounts, className = '', 'data-testid': testId = 'bank-sync-banner' }) {
  const ui = useUI();
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  const names = accounts.map((a) => a.name).filter(Boolean);
  const single = accounts.length === 1;
  let title;
  if (single) {
    title = names[0]
      ? sentenceWithName(ui, 'financeAccountsBankSyncBannerOne', names[0], testId)
      : ui('financeAccountsBankSyncInProgress');
  } else {
    title = ui('financeAccountsBankSyncBannerMany', { count: accounts.length });
  }
  // At most three names, so the line stays short; the full list is in the `title` tooltip.
  // (InfoBanner's text block is a flex item without `min-w-0`, so CSS truncation cannot be relied on.)
  const fullNameList = !single && names.length > 0 ? names.join(', ') : '';
  const nameList = names.length > MAX_NAMES ? `${names.slice(0, MAX_NAMES).join(', ')}, …` : fullNameList;

  return (
    <InfoBanner
      tone="info"
      icon={SyncingIcon}
      dismissible={false}
      role="status"
      aria-live="polite"
      className={className}
      data-testid={testId}
    >
      <span className="block" data-testid={`${testId}-title`}>{title}</span>
      {nameList ? (
        <span
          className="block text-xs font-semibold"
          title={fullNameList}
          data-testid={`${testId}-names`}
        >
          {nameList}
        </span>
      ) : null}
      <span className="block text-xs font-normal" data-testid={`${testId}-hint`}>
        {ui('financeAccountsBankSyncBannerHint')}
      </span>
    </InfoBanner>
  );
}
