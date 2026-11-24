import { useCallback, useEffect, useRef, useState } from 'react';
import { WarningIcon, LockIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FIELD_HEIGHT, ROW_GAP_Y } from '@/components/ui/formDensity';
import { chunkIban, normalizeIban } from '@/lib/validateIban.js';
import { validateIbanForCountry } from '@/lib/countryIban.js';
import { joinWithConjunction } from '@/lib/backendErrors.js';
import { creditorIdErrorKey, normalizeCreditorId } from '@/lib/sepaCreditorId.js';
import { CreditorIdField, CreditorIdLabel } from '@/components/financial-accounts/CreditorIdControls.jsx';
import { dueItemsErrorMessage } from './remittanceDueItemsApi.js';
import { fetchRemittanceTypeDirection, fetchSepaFileData } from './sepaFileDataApi.js';
import RemittanceFileCard from './RemittanceFileCard.jsx';
import RemittanceAdvancedOptions from './RemittanceAdvancedOptions.jsx';

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

/**
 * The creditor identifier of a collection remittance, a plain input like the IBAN: opened on the effective value
 * (the remittance's own, else the account's, else the one computed from the organization); only a computed value
 * not saved yet carries a note («Propuesto…»). A valid value is handed to the header form as `creditorIdentifier` and saved with the header's
 * «Guardar»; the account's default is edited only in «Editar cuenta». Read-only once processed.
 */
function CreditorIdRow({ info, ui, editable, processed, draft, onDraft, alignToInput = false }) {
  const missingParts = missingCreditorParts(info.missing, ui);
  const shown = draft ?? info.creditorId ?? '';
  const errorKey = draft === null ? null : creditorIdErrorKey(draft);
  const proposed = draft === null && info.creditorIdSource === 'suggested' && shown !== '';
  return (
    <div className={`${INLINE_ROW}${alignToInput ? ' md:min-h-9 md:self-start' : ''}`} data-testid="remittance-sepa-creditor">
      <CreditorIdLabel ui={ui} htmlFor="remittance-sepa-creditor-input" className={FIELD_LABEL} testId="remittance-sepa-creditor" data-testid="CreditorIdLabel__sepa" />
      {editable ? (
        <div className="min-w-0 flex-1">
          <CreditorIdField
            ui={ui}
            value={shown}
            onChange={onDraft}
            errorKey={errorKey}
            testId="remittance-sepa-creditor"
            data-testid="CreditorIdField__sepa" />
          {!errorKey && proposed && (
            <div className="pt-1 text-xs text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-creditor-source" data-source="suggested">
              {ui('sepaCreditorIdSourceSuggested')}
            </div>
          )}
        </div>
      ) : (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {info.creditorIdAvailable
            ? <span className={`${VALUE} tabular-nums`} data-testid="remittance-sepa-creditor-value">{info.creditorId}</span>
            : <span className={VALUE} data-testid="remittance-sepa-creditor-value">—</span>}
          {processed && info.remittanceCreditorId && (
            <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-creditor-locked">
              <LockIcon className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="Lock__sepa-creditor" />
              {ui('sepaCreditorIdLocked')}
            </span>
          )}
        </span>
      )}
      {editable && !info.creditorIdAvailable && missingParts && (
        <span
          role="alert"
          className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[hsl(var(--status-warning-fg))]"
          data-testid="remittance-sepa-creditor-missing"
        >
          <WarningIcon className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="AlertTriangle__sepa-creditor" />
          <span>{ui('remittanceSepaCreditorIdUnavailable', { missing: missingParts })}</span>
        </span>
      )}
    </div>
  );
}

/**
 * The IBAN OF THIS REMITTANCE (never written to the account): an input opened on the effective value
 * (the remittance's own, else the account's copy), validated inline with the Edit-account rules, with
 * its origin in a few words. It has no button of its own: a valid value goes to the header form
 * (`onChange('iBAN', …)`) and is saved by the header's «Guardar»; an invalid or empty one leaves the
 * form field empty, which blocks that save (see SepaDataForRecord).
 */
function IbanEditor({ info, ui, draft, onDraft, requiredError }) {
  const shown = draft ?? info.iban ?? '';
  const errorKey = draft === null ? null : typedIbanError(draft);
  const hasValue = shown !== '';
  const accountHasNoIban = info.accountIbanValid !== true && info.ibanSource !== 'account';
  return (
    <div className="col-span-2 min-w-0" data-testid="remittance-sepa-iban-editor">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Label htmlFor="remittance-sepa-iban-input" className={FIELD_LABEL} data-testid="Label__sepa-iban">
          {ui('remittanceSepaIban')}
          <span className="text-destructive ml-0.5">*</span>
        </Label>
        <Input
          id="remittance-sepa-iban-input"
          value={shown}
          onChange={(e) => onDraft(e.target.value)}
          placeholder={ui('remittanceSepaIbanPlaceholder')}
          aria-invalid={errorKey || requiredError ? 'true' : undefined}
          aria-describedby="remittance-sepa-iban-help"
          className={`${INPUT_CLASS} min-w-[14rem] min-w-0 flex-1${errorKey || requiredError ? ' border-destructive' : ''}`}
          data-testid="remittance-sepa-iban-input" />
      </div>
      <div id="remittance-sepa-iban-help" className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-xs">
        {errorKey ? (
          <span className="text-destructive" data-testid="remittance-sepa-iban-error">{ui(errorKey)}</span>
        ) : requiredError ? (
          <span className="text-destructive" data-testid="remittance-sepa-iban-required">{ui('fieldRequired')}</span>
        ) : !hasValue && accountHasNoIban && (
          <span className="text-[hsl(var(--muted-foreground))]" data-testid="remittance-sepa-iban-no-account-iban">
            {ui('remittanceSepaNoAccountIbanHint')}
          </span>
        )}
      </div>
    </div>
  );
}

function IbanReadOnly({ info, ui }) {
  return (
    <div className={INLINE_ROW} data-testid="remittance-sepa-iban">
      <Label className={FIELD_LABEL} data-testid="Label__sepa-iban-ro">{ui('remittanceSepaIban')}</Label>
      <span className={`${VALUE} tabular-nums`} data-testid="remittance-sepa-iban-value">{info.iban ? chunkIban(info.iban) : '—'}</span>
    </div>
  );
}

/**
 * ETP-6148 — «Datos para el fichero SEPA», below the remittance header form (decisions.json
 * `window.headerExtra.customForm`, rendered by DetailView as its `formFooter`). For the chosen
 * account (also on a new, unsaved remittance) it shows:
 * a compact card aligned to the header form grid (same Label / Input / grid tokens as EntityForm),
 * titled in a light header strip, with IBAN in columns 1–2 and the creditor identifier in columns
 * 3–4, each label inline left of its value:
 * - the IBAN OF THE REMITTANCE (never written to the account): an input opened on the effective value (its
 *   own, else the account's copy) with its origin in a few words, validated inline with the Edit-account
 *   rules (validateIbanForCountry). It has no button: a valid value is handed to the header form
 *   (`onChange('iBAN', …)`) and saved by the header's «Guardar», on create too; while the effective IBAN is not
 *   valid the form's `iBAN` field is registered as required and empty, which keeps «Guardar» disabled, and
 *   the block says so. Read-only once processed;
 * - the creditor identifier of a collection, a plain input like the IBAN: opened on the effective value (the
 *   remittance's own, else the account's, else the one computed from the organization) with its origin in a few
 *   words, validated inline (lib/sepaCreditorId.js) and handed to the header form as `creditorIdentifier`, saved
 *   by the header's «Guardar». Read-only once processed; not shown on payment remittances.
 * Above this card, a collection type also shows «Esquema de adeudo» and «Remesa financiada» (RemittanceAdvancedOptions).
 * There is no BIC (user decision). The contract lives in sepaFileDataApi.js.
 */
export default function RemittanceSepaFileData({ data, apiBaseUrl, onChange, registerFields, fieldErrors }) {
  const contextKey = JSON.stringify([apiBaseUrl, data?.id, data?.financialAccount, data?.organization, data?.remittanceType]);
  // Whether the user typed an IBAN into the form field `iBAN`: it must not survive a change of account
  // (the server copies the new account's IBAN over it, and a new remittance would still send the typed one).
  const typedRef = useRef(false);
  const accountRef = useRef(data?.financialAccount || null);
  useEffect(() => {
    const account = data?.financialAccount || null;
    if (account === accountRef.current) return;
    accountRef.current = account;
    if (typedRef.current) {
      typedRef.current = false;
      onChange?.('iBAN', '');
      onChange?.('creditorIdentifier', '');
    }
  }, [data?.financialAccount, onChange]);
  // The collection-only fields (scheme, financed, creditor identifier) are refused by the server on a payment
  // remittance (422 ETGO_RemittanceOptionsCollectionOnly), so choosing a payment type afterwards must leave them OUT
  // of the payload: each goes back to the value the record had when the user first touched any of them.
  const collectionOnlyRef = useRef(null);
  const markCollectionOnly = useCallback(() => {
    if (!collectionOnlyRef.current) {
      collectionOnlyRef.current = Object.fromEntries(COLLECTION_ONLY_FIELDS.map((key) => [key, data?.[key]]));
    }
  }, [data]);
  const typeRef = useRef(data?.remittanceType || null);
  useEffect(() => {
    const type = data?.remittanceType || null;
    if (type === typeRef.current) return;
    typeRef.current = type;
    const originals = collectionOnlyRef.current;
    if (originals) {
      collectionOnlyRef.current = null;
      for (const key of COLLECTION_ONLY_FIELDS) onChange?.(key, originals[key]);
    }
  }, [data?.remittanceType, onChange]);
  return (
    <SepaDataForRecord
      key={contextKey}
      data={data}
      apiBaseUrl={apiBaseUrl}
      onChange={onChange}
      registerFields={registerFields}
      fieldErrors={fieldErrors}
      typedRef={typedRef}
      markCollectionOnly={markCollectionOnly}
      data-testid="SepaDataForRecord__header" />
  );
}

const IBAN_FIELD_ID = 'remittance-sepa-iban';
const CREDITOR_FIELD_ID = 'remittance-sepa-creditor';
const COLLECTION_ONLY_FIELDS = ['directDebitScheme', 'financed', 'creditorIdentifier'];

function SepaDataForRecord({ data, apiBaseUrl, onChange, registerFields, fieldErrors, typedRef, markCollectionOnly }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const accountId = data?.financialAccount || null;
  const remittanceId = data?.id || null;
  // The header's organization picks the creditor id's organization (the backend falls back to the
  // saved remittance's, then the account's).
  const organizationId = data?.organization || null;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  // null = untouched: the field shows the effective IBAN; a string = what the user typed.
  const [ibanDraft, setIbanDraft] = useState(null);
  const requestRef = useRef(0);
  const processed = isProcessed(data);

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

  useEffect(() => {
    load();
    return () => { requestRef.current++; };
  }, [load, data?.updated]);

  // The remittance's own IBAN is part of the header: a valid typed value goes to the form field `iBAN`
  // (the header's «Guardar» sends it, on create too); an invalid or empty one leaves the field empty.
  const handleIbanDraft = (value) => {
    setIbanDraft(value);
    typedRef.current = true;
    const normalized = normalizeIban(value);
    onChange?.('iBAN', normalized && !typedIbanError(value) ? normalized : '');
  };
  // Valid = what the user typed is a valid IBAN, or, untouched, the effective IBAN the server holds is.
  const ibanValid = ibanDraft !== null ? (normalizeIban(ibanDraft) !== '' && !typedIbanError(ibanDraft)) : Boolean(info?.ibanValid);
  // The header's save gate: while the effective IBAN is not valid, a required field that is never filled is
  // registered, so «Guardar» stays disabled (DetailView's missing-required check). Its key is NOT `iBAN`:
  // the gate gives the contract's descriptor of a key precedence over a registered one, and `iBAN` is
  // not required there. Nothing to gate on a processed remittance.
  useEffect(() => {
    if (!registerFields || !accountId || processed) return undefined;
    registerFields(ibanValid ? [] : [{ key: 'sepaFileIban', column: 'IBAN', type: 'text', label: ui('remittanceSepaIban'), required: true, section: 'principal' }], IBAN_FIELD_ID);
    return () => registerFields(null, IBAN_FIELD_ID);
  }, [registerFields, accountId, processed, ibanValid, ui]);

  // The creditor identifier works like the IBAN: a valid typed value goes to the form field `creditorIdentifier`;
  // an invalid one blocks the header's save (a required field that is never filled) instead of being dropped.
  const [creditorDraft, setCreditorDraft] = useState(null);
  const handleCreditorDraft = (value) => {
    setCreditorDraft(value);
    typedRef.current = true;
    markCollectionOnly();
    const normalized = normalizeCreditorId(value);
    onChange?.('creditorIdentifier', normalized && !creditorIdErrorKey(value) ? normalized : '');
  };
  const creditorInvalid = creditorDraft !== null && Boolean(creditorIdErrorKey(creditorDraft));
  useEffect(() => {
    if (!registerFields || !accountId || processed || !creditorInvalid) return undefined;
    registerFields([{ key: 'sepaFileCreditorId', column: 'Creditor_Identifier', type: 'text', label: ui('sepaCreditorId'), required: true, section: 'principal' }], CREDITOR_FIELD_ID);
    return () => registerFields(null, CREDITOR_FIELD_ID);
  }, [registerFields, accountId, processed, creditorInvalid, ui]);

  // Whether the selected remittance type is a collection: `direction` on the type selector's item (known before the
  // first save), else, for a saved remittance, what sepaFileData answers.
  const [direction, setDirection] = useState(null);
  const typeId = data?.remittanceType || null;
  useEffect(() => {
    setDirection(null);
    if (!accountId || !typeId) return undefined;
    let cancelled = false;
    fetchRemittanceTypeDirection(apiFetch, accountId, typeId).then((found) => { if (!cancelled) setDirection(found); });
    return () => { cancelled = true; };
  }, [apiFetch, accountId, typeId]);
  // The value the creditor field holds: typed, else the effective one (remittance's, account's or computed).
  const shownCreditor = creditorDraft ?? info?.creditorId ?? '';
  const creditorValid = normalizeCreditorId(shownCreditor) !== '' && !creditorIdErrorKey(shownCreditor);
  const isCollection = direction ? direction === 'collection' : (info?.collection ?? null);

  const editable = Boolean(info) && !processed;
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
          ? <IbanEditor info={info} ui={ui} draft={ibanDraft} onDraft={handleIbanDraft} requiredError={Boolean(fieldErrors?.sepaFileIban)} data-testid="IbanEditor__sepa" />
          : <IbanReadOnly info={info} ui={ui} data-testid="IbanReadOnly__sepa" />}
        {isCollection !== false && <CreditorIdRow info={info} ui={ui} processed={processed} editable={!processed} draft={creditorDraft} onDraft={handleCreditorDraft} alignToInput={editable || !processed} data-testid="CreditorIdRow__sepa" />}
      </div>
    );
  }

  // `inlineInHeaderCard`: this fragment is spliced INTO the header form's grid, so the cards span its full row
  // (`col-span-full`) and the grid's own gap separates them from the field rows.
  return (
    <>
    {/* ETP-6247 — the collection options (scheme, financed): header fields, visible before the first save. */}
    {accountId && isCollection === true && (
      <RemittanceAdvancedOptions info={info} processed={processed} onChange={onChange} onTouched={markCollectionOnly} data-testid="RemittanceAdvancedOptions__header" />
    )}
    <section
      className="col-span-full overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-card"
      aria-labelledby="remittance-sepa-title"
      data-testid="remittance-sepa-file-data"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-4 py-1.5">
        <h3 id="remittance-sepa-title" className="text-sm font-semibold text-foreground">{ui('remittanceSepaTitle')}</h3>
      </header>
      <div className="px-4 py-2.5">{body}</div>
    </section>
    {/* ETP-6247 — «Antes de confirmar» / «Fichero SEPA», the next card of the same block. */}
    <RemittanceFileCard data={data} apiBaseUrl={apiBaseUrl} creditorValid={creditorValid} data-testid="RemittanceFileCard__sepa" />
    </>
  );
}

// Spliced into the header form's grid (DetailView `inlineInHeaderCard`): the collection options take its free cells and
// the cards below span the full row, with the grid's own gap instead of margins.
RemittanceSepaFileData.inlineInHeaderCard = true;
