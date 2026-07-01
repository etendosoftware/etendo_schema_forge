import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Filter for movement amount.
 *
 * value:
 *   - null                                     → Any amount
 *   - { presetId: 'gt0' | 'lt0' }              → Only inflows / outflows
 *   - { min: number|null, max: number|null }   → Manual range (abs value)
 *
 * @param {{ value: any, onChange: (v: any) => void }} props
 */
export function AmountFilter({ value, onChange }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);

  const presets = useMemo(() => ([
    { id: 'gt0', labelKey: 'financeAccountMovementsFilterAmountInflows' },
    { id: 'lt0', labelKey: 'financeAccountMovementsFilterAmountOutflows' },
  ]).map((p) => ({ ...p, label: ui(p.labelKey) })), [ui]);

  const activePresetId = value && 'presetId' in value ? value.presetId : null;
  const isCustom = !!value && ('min' in value || 'max' in value);

  // ── Local draft state (only emitted on Apply) ─────────────────────────────
  const [draftMin, setDraftMin] = useState(isCustom && value.min != null ? String(value.min) : '');
  const [draftMax, setDraftMax] = useState(isCustom && value.max != null ? String(value.max) : '');

  useEffect(() => {
    if (!open) return;
    if (isCustom) {
      setDraftMin(value.min != null ? String(value.min) : '');
      setDraftMax(value.max != null ? String(value.max) : '');
    } else {
      setDraftMin('');
      setDraftMax('');
    }
  }, [open, isCustom, value]);

  const parsedMin = draftMin.trim() === '' ? null : Number(draftMin);
  const parsedMax = draftMax.trim() === '' ? null : Number(draftMax);
  const minValid = parsedMin == null || !Number.isNaN(parsedMin);
  const maxValid = parsedMax == null || !Number.isNaN(parsedMax);
  const rangeValid = parsedMin == null || parsedMax == null || parsedMin <= parsedMax;
  const canApply = minValid && maxValid && rangeValid && (parsedMin != null || parsedMax != null);

  const handlePresetClick = (presetId) => {
    onChange?.({ presetId });
    setOpen(false);
  };

  const handleApply = () => {
    if (!canApply) return;
    onChange?.({ min: parsedMin, max: parsedMax });
    setOpen(false);
  };

  const handleClear = () => {
    onChange?.(null);
    setOpen(false);
  };

  // ── Trigger label ─────────────────────────────────────────────────────────
  const triggerLabel = (() => {
    if (activePresetId) {
      return presets.find((p) => p.id === activePresetId)?.label ?? ui('financeAccountMovementsFilterAmountAll');
    }
    if (isCustom) {
      const minStr = value.min != null ? `${formatNumber(value.min)} €` : null;
      const maxStr = value.max != null ? `${formatNumber(value.max)} €` : null;
      if (minStr != null && maxStr != null) return `${minStr} – ${maxStr}`;
      if (minStr != null) return `≥ ${minStr}`;
      if (maxStr != null) return `≤ ${maxStr}`;
    }
    return ui('financeAccountMovementsFilterAmountAll');
  })();

  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__c66309">
      <PopoverTrigger asChild data-testid="PopoverTrigger__c66309">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-between gap-1 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm font-medium leading-6 text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-[#828FA3]"
            data-testid="ChevronDown__c66309" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" data-testid="PopoverContent__c66309">
        {/* Presets */}
        <div className="flex flex-col py-1">
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'relative flex h-8 items-center px-3 text-left text-sm leading-6 text-[#121217] transition-colors',
              !value ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
            )}
          >
            <span className="flex-1">{ui('financeAccountMovementsFilterAmountAll')}</span>
            {!value ? <Check className="h-4 w-4 shrink-0" data-testid="Check__c66309" /> : null}
          </button>
          {presets.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset.id)}
                className={cn(
                  'relative flex h-8 items-center px-3 text-left text-sm leading-6 text-[#121217] transition-colors',
                  active ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
                )}
              >
                <span className="flex-1">{preset.label}</span>
                {active ? <Check className="h-4 w-4 shrink-0" data-testid="Check__c66309" /> : null}
              </button>
            );
          })}
        </div>

        {/* Custom range — manual inputs */}
        <div className="border-t border-[#E8EAEF] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium leading-4 text-[#3F3F50]">
              {ui('financeAccountMovementsFilterAmountManualRange')}
            </span>
            {(draftMin !== '' || draftMax !== '' || isCustom) && (
              <button
                type="button"
                onClick={() => {
                  setDraftMin('');
                  setDraftMax('');
                  if (isCustom) onChange?.(null);
                }}
                className="text-xs font-medium leading-4 text-[#6C6C89] hover:text-[#121217] hover:underline"
              >
                {ui('financeAccountMovementsFilterAmountClear')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NumberField
              value={draftMin}
              onChange={setDraftMin}
              placeholder={ui('financeAccountMovementsFilterAmountMin')}
              invalid={!minValid || !rangeValid}
              data-testid="NumberField__c66309" />
            <span className="text-sm text-[#6C6C89]">–</span>
            <NumberField
              value={draftMax}
              onChange={setDraftMax}
              placeholder={ui('financeAccountMovementsFilterAmountMax')}
              invalid={!maxValid || !rangeValid}
              data-testid="NumberField__c66309" />
          </div>
          {!rangeValid && (
            <p className="mt-2 text-xs text-[#D50B3E]">
              {ui('financeAccountMovementsFilterAmountInvalidRange')}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E8EAEF] px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#D1D4DB] bg-white px-3 text-sm font-medium text-[#121217] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[rgba(18,18,23,0.05)]"
          >
            {ui('dateRangeCancel')}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="inline-flex h-9 items-center justify-center rounded-full bg-[#121217] px-3 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ui('dateRangeApply')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function NumberField({ value, onChange, placeholder, invalid }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'h-9 w-full min-w-0 rounded-md border bg-white px-2 text-sm text-[#121217] placeholder:text-[#828FA3] focus:outline-none focus:ring-2 focus:ring-offset-1',
        invalid
          ? 'border-[#D50B3E] focus:ring-[#D50B3E]'
          : 'border-[#D1D4DB] focus:ring-[#121217]',
      )}
    />
  );
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}
