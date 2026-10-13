import { useUI } from '@/i18n';
import { ToggleRow, AccountBadgeSelect } from '@/components/contract-ui';
import SectionShell from './SectionShell.jsx';
import { ACCOUNT_OPTIONS } from './mockCatalogs.js';

/**
 * Cuentas generales tab — the C_AcctSchema_GL row (AD window 125, tab 200
 * "General Accounts"). Three sections following the same section-shell
 * pattern as the other tabs:
 *  - Cuentas de suspenso: suspenseBalancingUse/suspenseBalancing and
 *    suspenseErrorUse/suspenseError toggle+account pairs.
 *  - Balanceo de moneda: currencyBalancingUse toggle + currencyBalancingAcct.
 *  - Cierre de ejercicio: retainedEarning, incomeSummary, cFSOrderAccount
 *    accounts plus the createClosing ("reverse permanent balances") toggle.
 * Each account selector is shown only while its toggle is on (the AD display
 * logic `@UseSuspenseBalancing@='Y'` etc., ETP-5682). Turning a toggle off only
 * hides the selector: the stored account is kept, as in Classic, and posting
 * reads it only while the flag is on.
 * `active` is not surfaced here (system-managed, mirrors the window-level
 * Active flag) — see decisions.json `generalAccounts.active` (visibility:
 * "system").
 */
export default function GeneralAccountsTab({
  generalAccounts,
  accountOptions = ACCOUNT_OPTIONS,
  setGeneralAccountsField,
  errors = {},
}) {
  const ui = useUI();
  const showSuspenseBalancing = Boolean(generalAccounts.suspenseBalancingUse);
  const showSuspenseError = Boolean(generalAccounts.suspenseErrorUse);
  const showCurrencyBalancing = Boolean(generalAccounts.currencyBalancingUse);

  return (
    <div className="px-1">
      <SectionShell
        first
        title={ui('glc.section.suspense.title')}
        subtitle={ui('glc.section.suspense.subtitle')}
        data-testid="glc-section-suspense"
      >
        <div className="max-w-2xl">
          <ToggleRow
            label={ui('glc.toggle.suspenseBalancingUse')}
            checked={showSuspenseBalancing}
            onCheckedChange={(checked) => setGeneralAccountsField('suspenseBalancingUse', checked)}
            data-testid="glc-toggle-suspense-balancing-use"
          />
          <ToggleRow
            label={ui('glc.toggle.suspenseErrorUse')}
            checked={showSuspenseError}
            onCheckedChange={(checked) => setGeneralAccountsField('suspenseErrorUse', checked)}
            data-testid="glc-toggle-suspense-error-use"
          />
        </div>
        {(showSuspenseBalancing || showSuspenseError) && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            {showSuspenseBalancing && (
              <AccountBadgeSelect
                label={ui('glc.acct.suspenseBalancing')}
                value={generalAccounts.suspenseBalancing}
                options={accountOptions}
                onChange={(id) => setGeneralAccountsField('suspenseBalancing', id)}
                error={errors.suspenseBalancing}
                data-testid="glc-acct-suspenseBalancing"
              />
            )}
            {showSuspenseError && (
              <AccountBadgeSelect
                label={ui('glc.acct.suspenseError')}
                value={generalAccounts.suspenseError}
                options={accountOptions}
                onChange={(id) => setGeneralAccountsField('suspenseError', id)}
                error={errors.suspenseError}
                data-testid="glc-acct-suspenseError"
              />
            )}
          </div>
        )}
      </SectionShell>
      <SectionShell
        title={ui('glc.section.currencyBalancing.title')}
        subtitle={ui('glc.section.currencyBalancing.subtitle')}
        data-testid="glc-section-currency-balancing"
      >
        <div className="max-w-2xl">
          <ToggleRow
            label={ui('glc.toggle.currencyBalancingUse')}
            checked={showCurrencyBalancing}
            onCheckedChange={(checked) => setGeneralAccountsField('currencyBalancingUse', checked)}
            data-testid="glc-toggle-currency-balancing-use"
          />
        </div>
        {showCurrencyBalancing && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            <AccountBadgeSelect
              label={ui('glc.acct.currencyBalancingAccount')}
              value={generalAccounts.currencyBalancingAcct}
              options={accountOptions}
              onChange={(id) => setGeneralAccountsField('currencyBalancingAcct', id)}
              error={errors.currencyBalancingAcct}
              data-testid="glc-acct-currencyBalancingAcct"
            />
          </div>
        )}
      </SectionShell>
      <SectionShell
        title={ui('glc.section.closing.title')}
        subtitle={ui('glc.section.closing.subtitle')}
        data-testid="glc-section-closing"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AccountBadgeSelect
            label={ui('glc.acct.retainedEarning')}
            value={generalAccounts.retainedEarning}
            options={accountOptions}
            onChange={(id) => setGeneralAccountsField('retainedEarning', id)}
            error={errors.retainedEarning}
            data-testid="glc-acct-retainedEarning"
          />
          <AccountBadgeSelect
            label={ui('glc.acct.incomeSummary')}
            value={generalAccounts.incomeSummary}
            options={accountOptions}
            onChange={(id) => setGeneralAccountsField('incomeSummary', id)}
            error={errors.incomeSummary}
            data-testid="glc-acct-incomeSummary"
          />
          <AccountBadgeSelect
            label={ui('glc.acct.cfsOrderAccount')}
            value={generalAccounts.cFSOrderAccount}
            options={accountOptions}
            onChange={(id) => setGeneralAccountsField('cFSOrderAccount', id)}
            error={errors.cFSOrderAccount}
            data-testid="glc-acct-cFSOrderAccount"
          />
        </div>
        <div className="max-w-2xl mt-4">
          <ToggleRow
            label={ui('glc.toggle.reversePermanentBalances')}
            checked={Boolean(generalAccounts.createClosing)}
            onCheckedChange={(checked) => setGeneralAccountsField('createClosing', checked)}
            data-testid="glc-toggle-reverse-permanent-balances"
          />
        </div>
      </SectionShell>
    </div>
  );
}
