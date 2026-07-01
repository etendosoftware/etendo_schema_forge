import { useState } from 'react';
import { useUI } from '@/i18n';
import { isValidEmailAddress, normalizeRecipientList } from './recipientEdits.js';

/**
 * Recipient chip editor (ETP-4226). Renders one chip per address with a remove
 * button and a free-text input that adds addresses on Enter, comma, or blur.
 * Invalid non-empty input stays in the input with an inline error and is
 * reported upward via `onValidityChange(false)`; valid/empty input reports
 * `true`. Duplicates merge case-insensitively via `normalizeRecipientList`.
 *
 * Props:
 * - recipients: string[] — current addresses (controlled)
 * - onChange: (next: string[]) => void
 * - label: field label (already translated)
 * - disabled: disables chips removal and the input
 * - testIdPrefix: data-testid prefix → `{prefix}-input`, `{prefix}-chip-{email}`, `{prefix}-remove-{email}`
 * - onValidityChange: (isValid: boolean) => void — draft validity for send gating
 * - placeholder: input placeholder override (defaults to sendModalRecipientPlaceholder)
 */
export default function RecipientChipEditor({
  recipients = [],
  onChange,
  label,
  disabled = false,
  testIdPrefix = 'recipient',
  onValidityChange,
  placeholder,
}) {
  const ui = useUI();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const reportValidity = (isValid) => {
    setInvalid(!isValid);
    onValidityChange?.(isValid);
  };

  // Commits the draft: valid entries (comma-separated supported) are merged
  // into the list; invalid entries stay in the input with the inline error.
  const commitDraft = (value) => {
    const parts = String(value ?? '').split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      setDraft('');
      reportValidity(true);
      return;
    }
    const validParts = parts.filter(isValidEmailAddress);
    const invalidParts = parts.filter(part => !isValidEmailAddress(part));
    if (validParts.length > 0) {
      onChange?.(normalizeRecipientList([...recipients, ...validParts]));
    }
    if (invalidParts.length > 0) {
      setDraft(invalidParts.join(', '));
      reportValidity(false);
    } else {
      setDraft('');
      reportValidity(true);
    }
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    // Comma-separated paste (or typed comma that bypassed keydown) commits immediately.
    if (value.includes(',')) {
      commitDraft(value);
      return;
    }
    setDraft(value);
    if (value.trim() === '' || isValidEmailAddress(value)) {
      reportValidity(true);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft(draft);
    }
  };

  const handleRemove = (email) => {
    onChange?.(recipients.filter(address => address !== email));
  };

  return (
    <div>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '4px 8px', border: invalid ? '0.5px solid #dc2626' : '0.5px solid #d1d5db', borderRadius: 6, background: disabled ? '#f9fafb' : '#fff', boxSizing: 'border-box' }}>
        {recipients.map(email => (
          <span
            key={email}
            data-testid={`${testIdPrefix}-chip-${email}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#111827', background: '#f3f4f6', borderRadius: 9999, padding: '2px 8px', maxWidth: '100%' }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-remove-${email}`}
              aria-label={ui('sendModalRemoveRecipient', { email })}
              disabled={disabled}
              onClick={() => handleRemove(email)}
              style={{ fontSize: 13, lineHeight: 1, padding: 0, border: 'none', background: 'none', color: '#6B7280', cursor: disabled ? 'default' : 'pointer' }}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          data-testid={`${testIdPrefix}-input`}
          value={draft}
          disabled={disabled}
          placeholder={recipients.length === 0 ? (placeholder ?? ui('sendModalRecipientPlaceholder')) : ''}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => commitDraft(draft)}
          style={{ flex: 1, minWidth: 120, fontSize: 13, padding: '4px 2px', border: 'none', outline: 'none', color: '#111827', background: 'transparent' }}
        />
      </div>
      {invalid && (
        <span role="alert" style={{ display: 'block', fontSize: 12, color: '#dc2626', marginTop: 4 }}>
          {ui('sendModalInvalidEmail')}
        </span>
      )}
    </div>
  );
}
