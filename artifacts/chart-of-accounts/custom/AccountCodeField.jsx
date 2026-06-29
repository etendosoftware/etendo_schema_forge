import React, { useState, useEffect } from 'react';
import { useUI } from '@/i18n';

const PGC_PREFIX_LENGTH = 4;
const ACCOUNT_CODE_LENGTH = 8;

/**
 * AccountCodeField — split prefix + suffix editor for 8-digit chart-of-accounts codes.
 *
 * Props:
 *   value     — current full 8-digit code (string)
 *   onChange  — (newFullCode: string) => void  — always fires with the complete 8-char value
 *   record    — full form data object (used to detect summaryLevel and codePrefix)
 *   readOnly  — when true, renders as a single locked display
 *
 * Render rules:
 *   - summaryLevel === 'Y' OR readOnly  → single read-only display  (data-testid="account-code-readonly")
 *   - Leaf + existing record            → [prefix locked] + [suffix input]  (4+4 split)
 *   - Leaf + new child (codePrefix set) → [record.codePrefix locked] + [empty suffix input]
 *
 * Suffix input constraints:
 *   - maxLength=4, digits only (non-digit keys rejected on keydown)
 *   - On blur: validates total code length === 8; shows inline error if not
 *   - Error key: "codeExact8Digits" in genericLabels (both en_US.json and es_ES.json)
 */
export default function AccountCodeField({ value = '', onChange, record, readOnly = false }) {
  const ui = useUI();
  const isSummary = record?.summaryLevel === 'Y';
  const isReadOnlyDisplay = isSummary || readOnly;

  // Derive prefix and suffix from value or record.codePrefix. New-account modals
  // pass partial codes while the user types, so preserve partial suffixes too.
  const codePrefix = record?.codePrefix ?? '';
  const derivedPrefix = codePrefix || (value?.length >= 4 ? value.slice(0, 4) : '');
  const derivedSuffix = value?.startsWith(derivedPrefix)
    ? value.slice(derivedPrefix.length, ACCOUNT_CODE_LENGTH)
    : (value?.length > PGC_PREFIX_LENGTH ? value.slice(PGC_PREFIX_LENGTH, ACCOUNT_CODE_LENGTH) : '');

  const [suffix, setSuffix] = useState(derivedSuffix);
  const [error, setError] = useState('');

  // Sync suffix when the value prop changes externally (e.g. record load)
  useEffect(() => {
    setSuffix(derivedSuffix);
  }, [derivedSuffix]);

  if (isReadOnlyDisplay) {
    return (
      <div
        data-testid="account-code-readonly"
        className="flex h-10 items-center rounded-lg border border-[#D1D4DB] bg-muted/50 px-3 text-sm text-foreground"
      >
        {value}
      </div>
    );
  }

  const handleSuffixChange = (e) => {
    const v = e.target.value.replace(/\D/g, '');
    setSuffix(v);
    setError('');
    onChange?.(derivedPrefix + v);
  };

  const handleKeyDown = (e) => {
    // Allow: digit keys, navigation, and editing keys
    const isDigit = /^\d$/.test(e.key);
    const isControl = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key);
    const isModified = e.ctrlKey || e.metaKey || e.altKey;
    if (!isDigit && !isControl && !isModified) {
      e.preventDefault();
    }
  };

  const handleBlur = () => {
    const full = derivedPrefix + suffix;
    if (full.length !== 8 || !/^\d+$/.test(full)) {
      setError(ui('codeExact8Digits'));
    } else {
      setError('');
    }
  };

  return (
    <div>
      <div className="flex items-center">
        <span
          data-testid="account-code-prefix"
          className="inline-flex items-center h-10 px-3 text-sm border border-r-0 rounded-l-lg border-[#D1D4DB] bg-muted/50 text-[#6C6C89] select-none whitespace-nowrap"
        >
          {derivedPrefix}
        </span>
        <input
          data-testid="account-code-suffix-input"
          type="text"
          value={suffix}
          onChange={handleSuffixChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          maxLength={4}
          placeholder={ui('codeSuffixPlaceholder')}
          className="h-10 flex-1 rounded-r-lg border border-[#D1D4DB] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && (
        <p
          className="text-xs text-red-500 mt-1"
          data-testid="account-code-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
