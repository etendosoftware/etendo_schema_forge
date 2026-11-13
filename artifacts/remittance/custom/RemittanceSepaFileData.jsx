import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FIELD_HEIGHT, ROW_GAP_Y } from '@/components/ui/formDensity';
import { chunkIban, normalizeIban } from '@/lib/validateIban.js';
import { validateIbanForCountry } from '@/lib/countryIban.js';
import {
  extractBackendMessageKeys,
  extractBackendMessageParams,
  joinWithConjunction,
  translateBackendError,
} from '@/lib/backendErrors.js';
import { dueItemsErrorMessage } from './remittanceDueItemsApi.js';
import { fetchSepaFileData, saveAccountIban } from './sepaFileDataApi.js';

// Same keys as the Edit-account form's IBAN check (validateIbanForCountry codes).
const IBAN_ERROR_KEYS = {
  invalid: 'financeAccountsNewIbanInvalid',
  countryMismatch: 'financeAccountsNewIbanCountryMismatch',
  lengthMismatch: 'financeAccountsNewIbanLengthMismatch',
};

const MISSING_KEYS = {
  orgTaxId: 'remittanceSepaMissingOrgTaxId',
  country: 'remittanceSepaMissingCountry',
  iban: 'remittanceSepaMissingIban',
  // The CORE remittance type's Creditor_Business_Code parameter is not 3 letters or digits.
  // Provisioning stores 000, so a normal tenant never sees it.
  creditorBusinessCode: 'remittanceSepaMissingCreditorBusinessCode',
};

// The header form's own tokens (EntityForm, horizontal layout): same Label / Input / grid gaps, so
// the block reads as part of the header. Compact: each label sits INLINE, left of its value (it
// wraps above it on a narrow screen). The card frame reuses the app's subtle card classes
// (rounded-xl + border-subtle, as FundsTransferModal / NewAccountWizard).
const FIELD_LABEL = 'shrink-0 text-sm leading-5 font-medium text-[hsl(var(--muted-foreground))]';
const INPUT_CLASS = `${FIELD_HEIGHT} bg-card focus:ring-2 focus:ring-focus-ring focus:outline-none`;
// Both cells share one row and one alignment: centred (read-only rows are one text line; with the
// IBAN input, the creditor cell is as tall as the input row so it centres on it).
const GRID = `grid grid-cols-2 items-center gap-x-5 ${ROW_GAP_Y} md:grid-cols-4`;
const INLINE_ROW = 'col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1';
const VALUE = 'min-w-0 text-sm leading-5 text-foreground';

function isProcessed(data) {
  return data?.processed === true || data?.processed === 'Y';
}

/** The typed IBAN's inline error key, or null (empty counts as «not yet typed»). */
export function typedIbanError(value) {
  const normalized = normalizeIban(value);
  if (!normalized) return null;
  const { ok, code } = validateIbanForCountry(normalized, null);
  return ok ? null : (IBAN_ERROR_KEYS[code] ?? IBAN_ERROR_KEYS.invalid);
}

/** «la organización no tiene NIF y la organización no tiene país» from the backend's `missing`. */
export function missingCreditorParts(missing, ui) {
  return joinWithConjunction(missing.filter((m) => MISSING_KEYS[m]).map((m) => ui(MISSING_KEYS[m])), ui);
}

const IBAN_REQUIRES_COUNTRY_KEY = 'ETGO_FinAccIbanRequiresCountry';

function saveErrorMessage(err, ui) {
  const messageKeys = extractBackendMessageKeys(err.body);
  const translated = translateBackendError(err.message, ui, {
    code: err.code,
    messageKeys,
    messageParams: extractBackendMessageParams(err.body),
  });
  // An account with no country cannot take an IBAN (FinancialAccountHandler, 400). The shared text
  // («Se necesita el País…») fits the Edit-account form, which has the country field; here there is
  // none, so say where to set it. The second test covers a backend that predates the key and answers
  // only the English literal, which backendErrors.js maps to the same shared key.
  if (messageKeys?.includes(IBAN_REQUIRES_COUNTRY_KEY) || (translated && translated === ui('backendError.countryIban'))) {
    return ui('remittanceSepaIbanNeedsAccountCountry');
  }
  return translated || ui('remittanceSepaIbanSaveError');
}

function CreditorIdRow({ info, ui, alignToInput = false }) {
  const tip = ui('remittanceSepaCreditorIdInfo');
  return (
    <div className={`${INLINE_ROW}${alignToInput ? ' md:min-h-9 md:self-start' : ''}`} data-testid="remittance-sepa-creditor">
      <Label className={`${FIELD_LABEL} inline-flex items-center gap-1`} data-testid="Label__sepa-creditor">
        {ui('remittanceSepaCreditorId')}
        <Info
          className="h-3.5 w-3.5 shrink-0 cursor-help align-middle text-[hsl(var(--muted-foreground))]"
          role="img"
          aria-label={tip}
          data-testid="remittance-sepa-creditor-info">
          <title>{tip}</title>
        </Info>
      </Label>
      {info.creditorIdAvailable ? (
        <span className={`${VALUE} tabular-nums`} data-testid="remittance-sepa-creditor-value">{info.creditorId}</span>
      ) : (
        <span
          role="alert"
          className="inline-flex min-w-0 items-center gap-1.5 text-sm text-[hsl(var(--status-warning-fg))]"
          data-testid="remittance-sepa-creditor-missing"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="AlertTriangle__sepa-creditor" />
          <span>{ui('remittanceSepaCreditorIdUnavailable', { missing: missingCreditorParts(info.missing, ui) })}</span>
        </span>
      )}
    </div>
  );
}

function IbanEditor({ info, ui, saving, onSave }) {
  const [draft, setDraft] = useState('');
  const errorKey = typedIbanError(draft);
  const canSave = !saving && normalizeIban(draft) !== '' && !errorKey;
  return (
    <div className="col-span-2 min-w-0" data-testid="remittance-sepa-iban-editor">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Label htmlFor="remittance-sepa-iban-input" className={FIELD_LABEL} data-testid="Label__sepa-iban">
          {ui('remittanceSepaIban')}
          <span className="text-destructive ml-0.5">*</span>
        </Label>
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
        <Input
          id="remittance-sepa-iban-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={ui('remittanceSepaIbanPlaceholder')}
          aria-invalid={errorKey ? 'true' : undefined}
          aria-describedby="remittance-sepa-iban-help"
          className={`${INPUT_CLASS} min-w-0 flex-1${errorKey ? ' border-destructive' : ''}`}
          data-testid="remittance-sepa-iban-input" />
        <Button
          type="button"
          variant="outline"
          onClick={() => onSave(normalizeIban(draft))}
          disabled={!canSave}
          className={`${FIELD_HEIGHT} shrink-0`}
          data-testid="remittance-sepa-iban-save"
        >
          {ui('remittanceSepaSaveIban')}
        </Button>
        </div>
      </div>
      <div id="remittance-sepa-iban-help" className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-xs">
        {errorKey ? (
          <span className="text-destructive" data-testid="remittance-sepa-iban-error">{ui(errorKey)}</span>
        ) : (
          <span className="text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-iban-note">
            {ui('remittanceSepaNoIbanNote', { account: info.accountName })}
          </span>
        )}
        <span
          role="alert"
          className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
          data-testid="remittance-sepa-save-blocked"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-testid="AlertTriangle__sepa-blocked" />
          {ui('remittanceSepaIbanRequiredToSave')}
        </span>
      </div>
    </div>
  );
}

function IbanReadOnly({ info, ui }) {
  return (
    <div className={INLINE_ROW} data-testid="remittance-sepa-iban">
      <Label className={FIELD_LABEL} data-testid="Label__sepa-iban-ro">{ui('remittanceSepaIban')}</Label>
      <span className={`${VALUE} tabular-nums`} data-testid="remittance-sepa-iban-value">{chunkIban(info.iban)}</span>
    </div>
  );
}

function LockHint({ info, ui }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-iban-lock">
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-testid="Lock__sepa-iban" />
      <span className="truncate">{ui('remittanceSepaFromAccount', { account: info.accountName })}</span>
    </span>
  );
}

/**
 * ETP-6148 — «Datos para el fichero SEPA», below the remittance header form (decisions.json
 * `window.headerExtra.customForm`, rendered by DetailView as its `formFooter`). For the chosen
 * account (also on a new, unsaved remittance) it shows:
 * a compact card aligned to the header form grid (same Label / Input / grid tokens as EntityForm),
 * titled in a light header strip, with IBAN in columns 1–2 and the creditor identifier in columns
 * 3–4, each label inline left of its value:
 * - the account's IBAN, read-only with a «De la cuenta <nombre>» lock hint in the card header when it is valid; when it
 *   is missing or invalid, an IBAN input validated inline with the Edit-account rules
 *   (validateIbanForCountry) whose save stores it ON THE ACCOUNT, then re-reads the block. Until the
 *   account has a valid IBAN the remittance cannot be saved (the header answers 422
 *   ETGO_RemittanceAccountIbanRequired), and the block says so;
 * - the SEPA creditor identifier, computed by the backend (organization country + tax ID + the
 *   type's business code), with an info tooltip; when it cannot be computed, a warning naming
 *   what is missing.
 * There is no BIC (user decision). The contract lives in sepaFileDataApi.js.
 */
export default function RemittanceSepaFileData({ data, apiBaseUrl }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const accountsApiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  const accountId = data?.financialAccount || null;
  const remittanceId = data?.id || null;
  // The header's organization picks the creditor id's organization (the backend falls back to the
  // saved remittance's, then the account's).
  const organizationId = data?.organization || null;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!accountId) {
      setInfo(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchSepaFileData(apiFetch, remittanceId, accountId, organizationId);
      if (requestId === requestRef.current) setInfo(next);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setInfo(null);
      toast.error(dueItemsErrorMessage(err.body, ui, 'remittanceSepaLoadError'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [apiFetch, remittanceId, accountId, organizationId, ui]);

  useEffect(() => { load(); }, [load]);

  const handleSaveIban = async (iban) => {
    setSaving(true);
    try {
      await saveAccountIban(accountsApiFetch, accountId, iban);
      toast.success(ui('remittanceSepaIbanSaved', { account: info?.accountName ?? '' }));
      await load();
    } catch (err) {
      toast.error(saveErrorMessage(err, ui));
    } finally {
      setSaving(false);
    }
  };

  const editable = Boolean(info) && !info.ibanValid && !isProcessed(data);
  let body;
  if (!accountId) {
    body = <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-no-account">{ui('remittanceSepaSelectAccount')}</p>;
  } else if (!info) {
    body = loading
      ? <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-loading">{ui('loading')}</p>
      : null;
  } else {
    body = (
      <div className={GRID}>
        {editable
          ? <IbanEditor info={info} ui={ui} saving={saving} onSave={handleSaveIban} data-testid="IbanEditor__sepa" />
          : <IbanReadOnly info={info} ui={ui} data-testid="IbanReadOnly__sepa" />}
        <CreditorIdRow info={info} ui={ui} alignToInput={editable} data-testid="CreditorIdRow__sepa" />
      </div>
    );
  }

  // `mx-2`: the header form sits in DetailView's `p-2` card body (inline-editable lines layout),
  // so the card shares the form grid's left and right edges; `mt-3 mb-3` ≈ the form's own row gap.
  return (
    <section
      className="mx-2 mt-3 mb-3 overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-card"
      aria-labelledby="remittance-sepa-title"
      data-testid="remittance-sepa-file-data"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-4 py-1.5">
        <h3 id="remittance-sepa-title" className="text-sm font-semibold text-foreground">{ui('remittanceSepaTitle')}</h3>
        {info && !editable && info.iban && <LockHint info={info} ui={ui} data-testid="LockHint__sepa" />}
      </header>
      <div className="px-4 py-2.5">{body}</div>
    </section>
  );
}
