import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Landmark,
  Wallet,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Link2,
  PencilLine,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';
import { useAccountMutations } from '@/hooks/useAccountMutations.js';
import { usePsd2Actions } from '@/hooks/usePsd2Actions';
import { AccountFormStep } from './AccountFormStep.jsx';
import { searchBanks, institutionsFor } from './bankCatalog.js';

const STEP = {
  TYPE: 'type',
  CONNECTION: 'connection',
  BANK: 'bank',
  INSTITUTION: 'institution',
  FORM: 'form',
};

/** Stable keys for the bank-picker loading skeleton (avoids array-index keys, Sonar S6479). */
const BANK_SKELETON_KEYS = Array.from({ length: 9 }, (_, i) => `bank-skeleton-${i}`);

/** Curated country list for the bank picker dropdown (Salt Edge providers are fetched per country). */
const BANK_COUNTRIES = [
  { code: 'ES', flag: '🇪🇸' },
  { code: 'IT', flag: '🇮🇹' },
  { code: 'FR', flag: '🇫🇷' },
  { code: 'DE', flag: '🇩🇪' },
  { code: 'PT', flag: '🇵🇹' },
  { code: 'GB', flag: '🇬🇧' },
  { code: 'NL', flag: '🇳🇱' },
  { code: 'BE', flag: '🇧🇪' },
  { code: 'IE', flag: '🇮🇪' },
  { code: 'AT', flag: '🇦🇹' },
];

function resolveContentWidth(step) {
  if (step === STEP.TYPE) return 'max-w-[1016px]';
  if (step === STEP.CONNECTION) return 'max-w-2xl';
  if (step === STEP.BANK || step === STEP.INSTITUTION) return 'max-w-[560px]';
  return 'max-w-lg';
}

function resolveFormBackStep(accountType, selectedBank) {
  if (accountType === 'C') return STEP.TYPE;
  // Salt Edge providers are leaves (no institution sub-step), so they go back to the bank picker.
  if (selectedBank && !selectedBank.isProvider) return STEP.INSTITUTION;
  return STEP.BANK;
}

function resolveFormTitle(accountType, ui) {
  if (accountType === 'C') return ui('financeAccountsNewFormCashTitle');
  if (accountType === 'CA') return ui('financeAccountsNewFormCardTitle');
  return ui('financeAccountsNewFormBankTitle');
}

function resolveFormMode(accountType) {
  if (accountType === 'C') return 'cash';
  if (accountType === 'CA') return 'card';
  return 'bank';
}

/**
 * Multi-step modal to create a financial account "offline" (ETP-4096):
 *   type picker → (Bank/Card) connection toggle → bank picker → institution → form
 *   Bank and Card share the full flow (Card form is Name + Currency only); Caja
 *   goes straight to a simple form. "Con conexión" (PSD2) is shown but inert (T3).
 *
 * Props:
 *   - open: controls visibility
 *   - onClose(): called when the dialog should close
 *   - onCreated(): called after a successful create so the caller can reload the list
 */
export function NewAccountWizard({ open, onClose, onCreated, onConnectWithCreation }) {
  const ui = useUI();
  const { createAccount, fetchDefaults } = useAccountMutations();

  const [step, setStep] = useState(STEP.TYPE);
  const [accountType, setAccountType] = useState(null);
  const [selectedBank, setSelectedBank] = useState(null);
  const [bankQuery, setBankQuery] = useState('');
  const [currencies, setCurrencies] = useState([]);
  const [defaultCurrencyId, setDefaultCurrencyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setStep(STEP.TYPE);
    setAccountType(null);
    setSelectedBank(null);
    setBankQuery('');
    setSubmitting(false);
    setFormError(null);
    let cancelled = false;
    fetchDefaults()
      .then((data) => {
        if (cancelled) return;
        setCurrencies(Array.isArray(data.currencies) ? data.currencies : []);
        setDefaultCurrencyId(data.defaultCurrencyId || '');
      })
      .catch(() => {
        if (!cancelled) toast.error(ui('financeAccountsNewCreateError'));
      });
    return () => {
      cancelled = true;
    };
    // Re-run only when the dialog opens (or the fetcher changes); `ui` is read in
    // the catch but must not retrigger the reset/refetch and wipe wizard progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchDefaults]);

  const goBack = () => {
    setFormError(null);
    if (step === STEP.CONNECTION) setStep(STEP.TYPE);
    else if (step === STEP.BANK) setStep(STEP.CONNECTION);
    else if (step === STEP.INSTITUTION) setStep(STEP.BANK);
    else if (step === STEP.FORM) setStep(resolveFormBackStep(accountType, selectedBank));
  };

  // Bank and Card share the full flow (connection → bank → institution → form);
  // Cash goes straight to a simple form.
  const pickType = (type) => {
    setAccountType(type);
    setStep(type === 'C' ? STEP.FORM : STEP.CONNECTION);
  };

  const pickBank = (bank) => {
    setSelectedBank(bank);
    // Salt Edge providers have no institution sub-list — go straight to the form.
    setStep(bank.isProvider ? STEP.FORM : STEP.INSTITUTION);
  };

  const handleCreate = async (values) => {
    setSubmitting(true);
    setFormError(null);
    try {
      // When the chosen bank is a real Salt Edge provider, remember it on the account so a later
      // PSD2 connect preselects that bank. Static-catalog banks have no Salt Edge code → skipped.
      const payload = selectedBank?.isProvider
        ? { ...values, providerCode: selectedBank.id, providerName: selectedBank.name }
        : values;
      await createAccount(payload);
      toast.success(ui('financeAccountsNewCreateSuccess'));
      onCreated?.();
      onClose?.();
    } catch (err) {
      if (err.status === 409) {
        setFormError(ui('financeAccountsNewNameExists'));
      } else {
        toast.error(err.message || ui('financeAccountsNewCreateError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    [STEP.TYPE]: ui('financeAccountsNewTitle'),
    [STEP.CONNECTION]: ui(accountType === 'CA'
      ? 'financeAccountsNewConnectionTitleCard'
      : 'financeAccountsNewConnectionTitle'),
    [STEP.BANK]: ui('financeAccountsNewBankTitle'),
    [STEP.INSTITUTION]: ui('financeAccountsNewBankTitle'),
    [STEP.FORM]: resolveFormTitle(accountType, ui),
  };

  const showBadge = step === STEP.FORM && (accountType === 'B' || accountType === 'CA');
  const contentWidth = resolveContentWidth(step);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__24760b">
      <DialogContent
        className={cn('bg-white', contentWidth)}
        data-testid="new-account-wizard"
      >
        <DialogHeader data-testid="DialogHeader__24760b">
          <div className="flex items-center gap-2">
            {step !== STEP.TYPE ? (
              <button
                type="button"
                onClick={goBack}
                aria-label={ui('financeAccountsNewBack')}
                data-testid="new-account-back"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D1D4DB] text-[#121217] hover:bg-[#F5F7F9]"
              >
                <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__24760b" />
              </button>
            ) : null}
            <DialogTitle className="text-xl leading-7" data-testid="DialogTitle__24760b">{titles[step]}</DialogTitle>
            {showBadge ? (
              <span className="rounded-full bg-[#F5F7F9] px-2 py-0.5 text-xs font-normal text-[#6C6C89]">
                {ui('financeAccountsNewOfflineBadge')}
              </span>
            ) : null}
          </div>
          {step === STEP.TYPE ? (
            <DialogDescription
              className="text-xs leading-4 text-[#555B6D]"
              data-testid="DialogDescription__24760b">
              {ui('financeAccountsNewSubtitle')}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {step === STEP.TYPE ? (
          <TypePicker ui={ui} onPick={pickType} data-testid="TypePicker__24760b" />
        ) : null}

        {step === STEP.CONNECTION ? (
          <div
            className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2"
            data-testid="account-connection-options"
          >
            <ConnectionCard
              icon={Link2}
              iconTone="green"
              title={ui('financeAccountsNewConnectionOnline')}
              description={ui(accountType === 'CA'
                ? 'financeAccountsNewConnectionOnlineDescCard'
                : 'financeAccountsNewConnectionOnlineDesc')}
              onClick={() => {
                // Case 2: no account exists yet. Launch Salt Edge (popup opens within this
                // user gesture); the account is created from the chosen bank account afterwards.
                onConnectWithCreation?.(accountType);
                onClose?.();
              }}
              testid="account-connection-online"
              data-testid="ConnectionCard__24760b" />
            <ConnectionCard
              icon={PencilLine}
              iconTone="neutral"
              title={ui('financeAccountsNewConnectionOffline')}
              description={ui(accountType === 'CA'
                ? 'financeAccountsNewConnectionOfflineDescCard'
                : 'financeAccountsNewConnectionOfflineDesc')}
              onClick={() => setStep(STEP.BANK)}
              testid="account-connection-offline"
              data-testid="ConnectionCard__24760b" />
          </div>
        ) : null}

        {step === STEP.BANK ? (
          <BankPicker
            ui={ui}
            query={bankQuery}
            onQueryChange={setBankQuery}
            onPick={pickBank}
            onSkip={() => { setSelectedBank(null); setStep(STEP.FORM); }}
            data-testid="BankPicker__24760b" />
        ) : null}

        {step === STEP.INSTITUTION ? (
          <InstitutionList
            ui={ui}
            bank={selectedBank}
            onPick={() => setStep(STEP.FORM)}
            data-testid="InstitutionList__24760b" />
        ) : null}

        {step === STEP.FORM ? (
          <AccountFormStep
            key={accountType}
            mode={resolveFormMode(accountType)}
            bankName={selectedBank?.name}
            currencies={currencies}
            defaultCurrencyId={defaultCurrencyId}
            // Pre-fill the account name with the chosen bank's name so the user only tweaks it
            // (e.g. "Santander" → "Santander nóminas"). Empty when no bank was selected (skip / cash).
            initialValues={{ name: selectedBank?.name ?? '' }}
            submitting={submitting}
            error={formError}
            onSubmit={handleCreate}
            data-testid="AccountFormStep__24760b" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const TYPE_CARDS = [
  { type: 'B', icon: Landmark, image: '/illustrations/account-type-bank.png', titleKey: 'financeAccountsNewTypeBank', descKey: 'financeAccountsNewTypeBankDesc' },
  { type: 'C', icon: Wallet, image: '/illustrations/account-type-cash.png', titleKey: 'financeAccountsNewTypeCash', descKey: 'financeAccountsNewTypeCashDesc' },
  { type: 'CA', icon: CreditCard, image: '/illustrations/account-type-card.png', titleKey: 'financeAccountsNewTypeCard', descKey: 'financeAccountsNewTypeCardDesc' },
];

function TypePicker({ ui, onPick }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {TYPE_CARDS.map(({ type, icon: Icon, image, titleKey, descKey }) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          data-testid={`new-account-type-${type}`}
          className="flex flex-col rounded-xl border border-[#E8EAEF] bg-white p-1 text-left shadow-[0_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
        >
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="h-[180px] w-full rounded-lg object-cover"
          />
          <div className="flex flex-col gap-1 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D1D4DB] bg-white text-[#828FA3] shadow-[0_1px_3px_rgba(18,18,23,0.1),0_1px_2px_rgba(18,18,23,0.06)]">
                <Icon className="h-5 w-5" data-testid="Icon__24760b" />
              </span>
              <span className="text-base font-medium leading-6 text-[#121217]">{ui(titleKey)}</span>
            </div>
            <span className="text-sm font-normal leading-5 text-[#555B6D]">{ui(descKey)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function BankPicker({ ui, query, onQueryChange, onPick, onSkip }) {
  const { fetchProviders } = usePsd2Actions();
  const [country, setCountry] = useState(BANK_COUNTRIES[0].code);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the Salt Edge bank catalog for the selected country (live). While it loads we show a
  // spinner (no mock catalog flash); on error / no PSD2 API key the list stays empty and we fall
  // back to the static catalog so offline creation still works.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProviders(country)
      .then((list) => { if (!cancelled) setProviders(list); })
      .catch(() => { if (!cancelled) setProviders([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country, fetchProviders]);

  const selectedFlag = BANK_COUNTRIES.find((c) => c.code === country)?.flag ?? '';
  const needle = (query ?? '').trim().toLowerCase();
  const banks = providers.length > 0
    ? providers
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
      .map((p) => ({ id: p.code, name: p.name, logoUrl: p.logoUrl, isProvider: true }))
    : searchBanks(query);

  return (
    <div className="flex flex-col gap-5">
      {/* Banco field: country selector + search input */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium leading-6 text-[#121217]">{ui('financeAccountsNewBankLabel')}</p>
        <div className="flex h-10 w-full items-center overflow-hidden rounded-lg border border-[#D1D4DB] bg-white shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
          <DropdownMenu data-testid="DropdownMenu__24760b">
            <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__24760b">
              <button
                type="button"
                data-testid="new-account-bank-country"
                aria-label={ui('financeAccountsNewBankCountry')}
                className="flex h-full w-[60px] shrink-0 items-center justify-center gap-2 border-r border-[#E8EAEF] hover:bg-[#F5F7F9] focus:outline-none"
              >
                <span className="text-base leading-none">{selectedFlag}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-[#828FA3]"
                  data-testid="ChevronDown__24760b" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[260px] overflow-y-auto"
              data-testid="DropdownMenuContent__24760b">
              {BANK_COUNTRIES.map((c) => (
                <DropdownMenuItem
                  key={c.code}
                  onClick={() => setCountry(c.code)}
                  data-testid={`new-account-bank-country-${c.code}`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="text-sm text-[#121217]">{c.code}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={ui('financeAccountsNewBankSearchPlaceholder')}
            data-testid="new-account-bank-search"
            className="h-full flex-1 bg-transparent px-3 text-sm text-[#121217] placeholder:text-[#6C6C89] focus:outline-none"
          />
        </div>
      </div>
      {/* Providers grid */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div
            className="grid h-[424px] grid-cols-3 content-start gap-5"
            data-testid="new-account-bank-loading"
          >
            {BANK_SKELETON_KEYS.map((key) => (
              <div
                key={key}
                className="flex h-[124px] flex-col items-start gap-3 rounded-xl border border-[#E8EAEF] bg-white p-4 shadow-[0_1px_2px_rgba(18,18,23,0.05)]"
              >
                <Skeleton className="h-10 w-10 rounded-lg" data-testid="Skeleton__24760b" />
                <Skeleton className="h-4 w-24 rounded" data-testid="Skeleton__24760b" />
              </div>
            ))}
          </div>
        ) : (
        <div className="grid h-[424px] grid-cols-3 content-start gap-5 overflow-y-auto pr-3">
          {banks.map((bank) => (
            <button
              key={bank.id}
              type="button"
              onClick={() => onPick(bank)}
              data-testid={`new-account-bank-${bank.id}`}
              className="flex h-[124px] flex-col items-start gap-3 rounded-xl border border-[#E8EAEF] bg-white p-4 text-left shadow-[0_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
            >
              {bank.logoUrl ? (
                <img
                  src={bank.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg border border-[#D1D4DB] bg-white object-contain p-1 shadow-[0_1px_2px_rgba(18,18,23,0.05)]"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D1D4DB] bg-white shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
                  <Landmark className="h-5 w-5 text-[#828FA3]" data-testid="Landmark__24760b" />
                </span>
              )}
              <span className="line-clamp-2 w-full text-left text-sm font-medium leading-5 text-[#121217]">{bank.name}</span>
            </button>
          ))}
        </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSkip}
        data-testid="new-account-bank-skip"
        className="self-center text-sm text-[#555B6D] hover:text-[#121217] hover:underline"
      >
        {ui('financeAccountsNewBankSkip')}
      </button>
    </div>
  );
}

function InstitutionList({ ui, bank, onPick }) {
  const institutions = institutionsFor(bank);
  return (
    <div className="flex flex-col gap-5">
      {/* Bank display field */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium leading-6 text-[#121217]">{ui('financeAccountsNewBankLabel')}</p>
        <div className="flex h-10 w-full items-center overflow-hidden rounded-lg border border-[#D1D4DB] bg-white shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
          <div className="flex h-full w-[60px] shrink-0 items-center justify-center gap-0.5 border-r border-[#E8EAEF] px-2">
            <Landmark className="h-4 w-4 text-[#828FA3]" data-testid="Landmark__24760b" />
            <ChevronDown className="h-4 w-4 text-[#828FA3]" data-testid="ChevronDown__24760b" />
          </div>
          <span className="flex-1 px-3 text-sm leading-6 text-[#121217]">{bank?.name ?? ''}</span>
        </div>
      </div>
      {/* Institutions section */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium leading-6 text-[#121217]">{ui('financeAccountsNewInstitutions')}</p>
        <div className="flex flex-col gap-4">
          {institutions.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={onPick}
              data-testid={`new-account-institution-${inst.id}`}
              className="flex h-8 w-full items-center rounded-lg px-2 py-1 text-left hover:bg-[#F5F7F9]"
            >
              <span className="flex flex-1 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8EAEF] text-[#828FA3]">
                  <Landmark className="h-3.5 w-3.5" data-testid="Landmark__24760b" />
                </span>
                <span className="text-sm leading-6 text-[#121217]">{inst.name}</span>
              </span>
              <span className="flex shrink-0 items-center pr-1">
                <ChevronRight className="h-4 w-4 text-[#828FA3]" data-testid="ChevronRight__24760b" />
              </span>
            </button>
          ))}

        </div>
      </div>
    </div>
  );
}

/**
 * Card used in the Bank "Connection" step. Renders as: lead icon (44x44, tinted
 * box) → title → description. Per the redesigned spec the cards no longer carry
 * status pills or illustrations — they're clean, info-only tiles.
 *
 * `iconTone` controls the lead icon's colour set:
 *   - 'green'   → success tones (used by "Con conexión")
 *   - 'neutral' → subtle/gray tones (used by "Sin conexión")
 */
function ConnectionCard({ icon: Icon, iconTone = 'neutral', title, description, onClick, testid }) {
  const toneClasses = iconTone === 'green'
    ? 'bg-[#EEFBF4] border-[#C5F0D8] text-[#17663A]'
    : 'bg-[#F5F7F9] border-[#E8EAEF] text-[#3F3F50]';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="flex flex-col rounded-xl border border-[#E8EAEF] bg-white p-5 text-left shadow-[0_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
    >
      <span
        className={cn(
          'mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl border',
          toneClasses,
        )}
      >
        <Icon className="h-[22px] w-[22px]" data-testid="Icon__24760b" />
      </span>
      <h3 className="m-0 text-base font-semibold leading-5 text-[#121217]">{title}</h3>
      <p className="mt-1 text-[13px] font-normal leading-[18px] text-[#6C6C89]">{description}</p>
    </button>
  );
}
