import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import TabBar from './TabBar.jsx';
import GeneralTab from './GeneralTab.jsx';
import DefaultsTab from './DefaultsTab.jsx';
import DimensionsTab from './DimensionsTab.jsx';
import GeneralAccountsTab from './GeneralAccountsTab.jsx';
import { useGeneralLedgerConfig } from './useGeneralLedgerConfig.js';
import {
  translateBackendError,
  extractBackendMessageKeys,
  extractBackendMessageParams,
} from '@/lib/backendErrors.js';
import { DEFAULTS_GROUPS } from './mockCatalogs.js';

const REQUIRED_GENERAL = ['name', 'currency'];
const REQUIRED_DEFAULTS = DEFAULTS_GROUPS.flatMap((g) => g.fields.filter((f) => f.required).map((f) => f.key));
// [switch, account]: the account is required while its switch is on (ETP-5724, enforced by the backend too).
const BALANCING_PAIRS = [['suspenseBalancingUse', 'suspenseBalancing'], ['currencyBalancingUse', 'currencyBalancingAcct']];
const GENERAL_ACCOUNTS_TAB = 3;

/**
 * General Ledger Configuration (AD window 125, "Esquema contable").
 * layoutType: custom — fiscal-config pattern. 4 tabs: General · Valores por
 * defecto · Dimensiones · Cuentas generales.
 *
 * Loads and saves one org-scoped aggregate through the `General` entity
 * (GeneralLedgerConfigurationHandler in com.etendoerp.go, see useGeneralLedgerConfig).
 */
export default function GeneralLedgerConfigPage({ apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const {
    general, defaults, dimensions, orgInfo,
    catalogs, generalAccounts,
    setGeneralField, setDefaultField, setDimensionField, setGeneralAccountsField,
    isDirty, save, loading,
  } = useGeneralLedgerConfig(apiBaseUrl);

  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [generalErrors, setGeneralErrors] = useState({});
  const [defaultsErrors, setDefaultsErrors] = useState({});
  const [generalAccountsErrors, setGeneralAccountsErrors] = useState({});

  useSetPageMeta({
    title: ui('glc.title'),
    breadcrumb: `${ui('finance')} / ${ui('glc.title')}`,
  });

  function validate() {
    const gErr = {};
    for (const k of REQUIRED_GENERAL) {
      if (!general[k]) gErr[k] = ui('glc.validation.required');
    }
    const dErr = {};
    for (const k of REQUIRED_DEFAULTS) {
      if (!defaults[k]) dErr[k] = ui('glc.validation.required');
    }
    const gaErr = {};
    for (const [use, acct] of BALANCING_PAIRS) {
      if (generalAccounts[use] && !generalAccounts[acct]) gaErr[acct] = ui('glc.validation.required');
    }
    setGeneralErrors(gErr);
    setDefaultsErrors(dErr);
    setGeneralAccountsErrors(gaErr);
    const ok = [gErr, dErr, gaErr].every((e) => Object.keys(e).length === 0);
    return { ok, gErr, dErr };
  }

  async function handleSave() {
    const { ok, gErr, dErr } = validate();
    if (!ok) {
      // Jump to the first tab that has an error so the user sees it.
      if (Object.keys(gErr).length > 0) setActiveTab(0);
      else if (Object.keys(dErr).length > 0) setActiveTab(1);
      else setActiveTab(GENERAL_ACCOUNTS_TAB);
      return;
    }
    setSaving(true);
    try {
      await save();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      // The backend refused a balancing account the page could not see missing (e.g. cleared over
      // the API meanwhile): mark it like the local check does; its English message is for API callers.
      const error = err.body?.error;
      const missing = error?.code === 'MISSING_REQUIRED_FIELDS'
        ? BALANCING_PAIRS.map(([, acct]) => acct).filter((acct) => error.fields?.includes(acct))
        : [];
      if (missing.length > 0) {
        setGeneralAccountsErrors(Object.fromEntries(missing.map((acct) => [acct, ui('glc.validation.required')])));
        setActiveTab(GENERAL_ACCOUNTS_TAB);
        toast.error(ui('requiredFieldsMissing'));
        return;
      }
      toast.error(translateBackendError(err.message, ui, {
        messageKeys: extractBackendMessageKeys(err.body),
        messageParams: extractBackendMessageParams(err.body),
      }) || err.message);
    } finally {
      setSaving(false);
    }
  }

  const tabs = useMemo(() => ([
    { label: ui('glc.tab.general') },
    { label: ui('glc.tab.defaults') },
    { label: ui('glc.tab.dimensions') },
    { label: ui('glc.tab.generalAccounts') },
  ]), [ui]);

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Tab row: tabs left, dirty-state save button right */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[hsl(var(--border-subtle))] pr-6">
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
          data-testid="TabBar__79cd86" />
        <Button
          onClick={handleSave}
          disabled={!selectedOrg?.id || !isDirty || saving || loading}
          // ETP-5601 — same size as the record toolbar's Save (getSaveBtnCls): 40px, 8px radius,
          // text-sm/leading-6, 20px icon with an 8px gap.
          className={`h-10 gap-2 rounded-lg leading-6 [&_svg]:size-5 ${savedOk ? 'bg-status-success hover:bg-status-success border-status-success-border' : ''}`}
          data-testid="glc-save"
        >
          <Check data-testid="Check__79cd86" />
          {ui('saveChanges')}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-6 py-2">
          {!selectedOrg?.id && (
            <div className="rounded-xl border border-dashed border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] mb-4" data-testid="glc-org-required-note">
              {ui('glc.validation.organizationRequired')}
            </div>
          )}
          {activeTab === 0 && (
            <GeneralTab
              general={general}
              orgInfo={orgInfo}
              currencyOptions={catalogs.currencies}
              setGeneralField={setGeneralField}
              errors={generalErrors}
              data-testid="GeneralTab__79cd86" />
          )}
          {activeTab === 1 && (
            <DefaultsTab
              defaults={defaults}
              accountOptions={catalogs.accounts}
              setDefaultField={setDefaultField}
              errors={defaultsErrors}
              data-testid="DefaultsTab__79cd86" />
          )}
          {activeTab === 2 && (
            <DimensionsTab
              dimensions={dimensions}
              setDimensionField={setDimensionField}
              data-testid="DimensionsTab__79cd86" />
          )}
          {activeTab === 3 && (
            <GeneralAccountsTab
              generalAccounts={generalAccounts}
              accountOptions={catalogs.accounts}
              setGeneralAccountsField={setGeneralAccountsField}
              errors={generalAccountsErrors}
              data-testid="GeneralAccountsTab__79cd86" />
          )}
        </div>
      </div>
    </div>
  );
}
