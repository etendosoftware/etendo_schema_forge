import { useEffect, useRef, useState } from 'react';
import { Landmark } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { normalizeIban } from '@/lib/validateIban.js';
import { validateIbanForCountry } from '@/lib/countryIban.js';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { getApiBase } from '@/hooks/useNeoResource.js';

const CURRENCY_FIELD = { key: 'account-form-currency', id: 'account-form-currency' };
const COUNTRY_FIELD = { key: 'account-form-country', id: 'account-form-country' };

const COUNTRY_SELECTOR_URL = `${getApiBase()}/sws/neo/financial-account/account/selectors/C_Country_ID`;

const EMPTY = { name: '', iban: '', swiftCode: '', currencyId: '', countryId: '' };

// Form mode → persisted FIN_FinancialAccount.type value. Unmapped modes
// (e.g. 'cash') fall back to 'C'.
const TYPE_BY_MODE = { bank: 'B', card: 'CA' };

const FIELD_LABEL = 'text-sm font-medium leading-6 text-[hsl(var(--foreground))]';
const FIELD_INPUT = 'bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]';

/** Maps a validateIbanForCountry() error code to its i18n key. */
const IBAN_ERROR_KEYS = {
  invalid: 'financeAccountsNewIbanInvalid',
  countryMismatch: 'financeAccountsNewIbanCountryMismatch',
  lengthMismatch: 'financeAccountsNewIbanLengthMismatch',
};

/**
 * Reusable account form for the offline flow (ETP-4096). Used both by the New
 * Account wizard (bank/cash creation) and the Edit Account modal.
 *
 * - `mode='bank'` shows IBAN + BIC/SWIFT; `mode='cash'` and `mode='card'` show
 *   only Name + Country + Currency.
 * - Name, Country and Currency are required in every mode (ETP-4896: Country is always
 *   editable and never locks, unlike Currency/Type elsewhere in this window). IBAN is optional
 *   but, when present, must pass mod-97 AND — when the selected country carries IBAN metadata —
 *   match its prefix and length (see `@/lib/countryIban.js`).
 * - `onSubmit` receives `{ name, type, currencyId, countryId, iban, swiftCode }` — type is
 *   'B' (bank) / 'C' (cash) / 'CA' (card); iban/swift are normalised and only
 *   included for bank accounts.
 */
export function AccountFormStep({
  mode = 'bank',
  bankName,
  currencies = [],
  defaultCurrencyId,
  countryIbanRules = [],
  defaultCountryId,
  token,
  initialValues,
  submitLabel,
  submitting = false,
  error = null,
  showBic = true,
  onSubmit,
}) {
  const ui = useUI();
  const seed = { ...EMPTY, ...(initialValues || {}) };
  const [name, setName] = useState(seed.name);
  const [iban, setIban] = useState(seed.iban);
  const [swiftCode, setSwiftCode] = useState(seed.swiftCode);
  const [currencyId, setCurrencyId] = useState(seed.currencyId || defaultCurrencyId || '');
  const [countryId, setCountryId] = useState(seed.countryId || defaultCountryId || '');
  const [ibanTouched, setIbanTouched] = useState(false);

  // Auto-applies defaultCurrencyId only once (mount, or once it arrives async from
  // fetchDefaults()). Without the ref guard this would refire — and stomp the user's
  // choice — every time CreatableSearchSelect's chip-clear handler resets currencyId
  // to '' while the user searches for a different currency.
  const currencyDefaultedRef = useRef(currencyId !== '');
  useEffect(() => {
    if (!currencyId && defaultCurrencyId && !currencyDefaultedRef.current) {
      currencyDefaultedRef.current = true;
      setCurrencyId(defaultCurrencyId);
    }
  }, [defaultCurrencyId, currencyId]);

  // Same one-shot guard as currency, for the same reason (ETP-4896): defaultCountryId can arrive
  // asynchronously (org default, or the country the user filtered Salt Edge providers by in
  // NewAccountWizard's BankPicker — see its own defaultCountryId={seededCountryId || ...}), and
  // without the ref it would re-fire on every chip-clear and prevent changing the country at all.
  const countryDefaultedRef = useRef(countryId !== '');
  useEffect(() => {
    if (!countryId && defaultCountryId && !countryDefaultedRef.current) {
      countryDefaultedRef.current = true;
      setCountryId(defaultCountryId);
    }
  }, [defaultCountryId, countryId]);

  // The allowed currency set (EUR/USD/GBP) is enforced server-side by the
  // C_Currency_ID selector; `currencies` arrives already restricted, so this is
  // just a client-side (staticOptions) chip picker over that list.
  const selectedCurrency = currencies.find((currency) => currency.id === currencyId) || null;
  const currencyOptions = currencies.map((currency) => ({ id: currency.id, name: currency.iso }));

  // Unlike currency, `countryIbanRules` is NOT the full country catalog (only the ~45 countries
  // with IBAN metadata) — the picker itself searches the full C_Country_ID selector live
  // (`serverSearch`, below). This lookup is only for cross-checking the typed IBAN and for
  // resolving a display label without a network round-trip when the id was pre-filled.
  const selectedCountry = countryIbanRules.find((country) => country.id === countryId) || null;

  const isBank = mode === 'bank';
  const ibanCheck = isBank ? validateIbanForCountry(iban, selectedCountry) : { ok: true, code: null };
  const ibanInvalid = isBank && iban.trim() !== '' && !ibanCheck.ok;
  const canSubmit = name.trim() !== '' && currencyId !== '' && countryId !== '' && !ibanInvalid && !submitting;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const typeCode = TYPE_BY_MODE[mode] ?? 'C';
    const payload = { name: name.trim(), type: typeCode, currencyId, countryId };
    if (isBank) {
      payload.iban = normalizeIban(iban);
      // Only emit swiftCode when the field is shown — the edit modal hides it and
      // the backend leaves a missing key untouched, preserving the stored value.
      if (showBic) payload.swiftCode = swiftCode.trim().toUpperCase();
    }
    onSubmit?.(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="account-form">
      {isBank && bankName ? (
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--border-subtle))] text-[hsl(var(--text-disabled))]">
            <Landmark className="h-4 w-4" data-testid="Landmark__5e0d1d" />
          </span>
          <span className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]">{bankName}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="account-form-name-input"
            className={FIELD_LABEL}
            data-testid="Label__5e0d1d">
            {ui('financeAccountsNewFieldName')} <span className="text-[hsl(var(--destructive))]">*</span>
          </Label>
          <Input
            id="account-form-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            data-testid="account-form-name"
            className={FIELD_INPUT}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor={COUNTRY_FIELD.key}
            className={FIELD_LABEL}
            data-testid="Label__account-form-country">
            {ui('financeAccountsNewFieldCountry')} <span className="text-[hsl(var(--destructive))]">*</span>
          </Label>
          <CreatableSearchSelect
            field={COUNTRY_FIELD}
            value={countryId}
            displayValue={selectedCountry?.name || ''}
            onChange={(id) => setCountryId(id)}
            formData={{}}
            resolvedLabel={ui('financeAccountsNewFieldCountry')}
            selectorUrl={COUNTRY_SELECTOR_URL}
            token={token}
            serverSearch
            data-testid="CreatableSearchSelect__account-form-country"
          />
        </div>

        {isBank ? (
          <>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="account-form-iban-input"
                className={FIELD_LABEL}
                data-testid="Label__5e0d1d">
                {ui('financeAccountsNewFieldIban')}
              </Label>
              <Input
                id="account-form-iban-input"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                onBlur={() => setIbanTouched(true)}
                placeholder={ui('financeAccountsNewFieldIbanPlaceholder')}
                maxLength={42}
                data-testid="account-form-iban"
                className={FIELD_INPUT}
              />
              {ibanInvalid && ibanTouched ? (
                <p className="text-xs text-[hsl(var(--destructive))]" data-testid="account-form-iban-error">
                  {ui(IBAN_ERROR_KEYS[ibanCheck.code] || IBAN_ERROR_KEYS.invalid)}
                </p>
              ) : null}
            </div>

            {showBic ? (
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="account-form-bic-input"
                  className={FIELD_LABEL}
                  data-testid="Label__5e0d1d">
                  {ui('financeAccountsNewFieldBic')}
                </Label>
                <Input
                  id="account-form-bic-input"
                  value={swiftCode}
                  onChange={(e) => setSwiftCode(e.target.value)}
                  placeholder={ui('financeAccountsNewFieldBicPlaceholder')}
                  maxLength={20}
                  data-testid="account-form-bic"
                  className={FIELD_INPUT}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label
            htmlFor={CURRENCY_FIELD.key}
            className={FIELD_LABEL}
            data-testid="Label__5e0d1d">
            {ui('financeAccountsNewFieldCurrency')} <span className="text-[hsl(var(--destructive))]">*</span>
          </Label>
          <CreatableSearchSelect
            field={CURRENCY_FIELD}
            value={currencyId}
            displayValue={selectedCurrency?.iso || ''}
            onChange={(id) => setCurrencyId(id)}
            formData={{}}
            resolvedLabel={ui('financeAccountsNewFieldCurrency')}
            staticOptions={currencyOptions}
            data-testid="CreatableSearchSelect__5e0d1d"
          />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-[hsl(var(--destructive))]" data-testid="account-form-error">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end py-2">
        <Button
          type="submit"
          disabled={!canSubmit}
          data-testid="account-form-submit"
          className="h-10 rounded-full bg-[hsl(var(--foreground))] px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:opacity-100"
        >
          {submitLabel || ui('financeAccountsNewSubmit')}
        </Button>
      </div>
    </form>
  );
}
