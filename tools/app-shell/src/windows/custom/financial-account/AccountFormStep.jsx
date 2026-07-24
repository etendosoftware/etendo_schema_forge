import { useEffect, useRef, useState } from 'react';
import { Landmark } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { isValidIban, normalizeIban } from '@/lib/validateIban.js';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';

const CURRENCY_FIELD = { key: 'account-form-currency', id: 'account-form-currency' };

const EMPTY = { name: '', iban: '', swiftCode: '', currencyId: '' };

// Form mode → persisted FIN_FinancialAccount.type value. Unmapped modes
// (e.g. 'cash') fall back to 'C'.
const TYPE_BY_MODE = { bank: 'B', card: 'CA' };

const FIELD_LABEL = 'text-sm font-medium leading-6 text-[hsl(var(--foreground))]';
const FIELD_INPUT = 'bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]';

/**
 * Reusable account form for the offline flow (ETP-4096). Used both by the New
 * Account wizard (bank/cash creation) and the Edit Account modal.
 *
 * - `mode='bank'` shows IBAN + BIC/SWIFT; `mode='cash'` and `mode='card'` show
 *   only Name + Currency.
 * - Name is required; IBAN is optional but, when present, must pass mod-97.
 * - `onSubmit` receives `{ name, type, currencyId, iban, swiftCode }` — type is
 *   'B' (bank) / 'C' (cash) / 'CA' (card); iban/swift are normalised and only
 *   included for bank accounts.
 */
export function AccountFormStep({
  mode = 'bank',
  bankName,
  currencies = [],
  defaultCurrencyId,
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

  // The allowed currency set (EUR/USD/GBP) is enforced server-side by the
  // C_Currency_ID selector; `currencies` arrives already restricted, so this is
  // just a client-side (staticOptions) chip picker over that list.
  const selectedCurrency = currencies.find((currency) => currency.id === currencyId) || null;
  const currencyOptions = currencies.map((currency) => ({ id: currency.id, name: currency.iso }));

  const isBank = mode === 'bank';
  const ibanInvalid = isBank && iban.trim() !== '' && !isValidIban(iban);
  const canSubmit = name.trim() !== '' && currencyId !== '' && !ibanInvalid && !submitting;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const typeCode = TYPE_BY_MODE[mode] ?? 'C';
    const payload = { name: name.trim(), type: typeCode, currencyId };
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
                  {ui('financeAccountsNewIbanInvalid')}
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
            {ui('financeAccountsNewFieldCurrency')}
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
