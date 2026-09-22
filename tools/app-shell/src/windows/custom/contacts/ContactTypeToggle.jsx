import { useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useContactsType } from './ContactsContext';

/* eslint-disable react/prop-types */

export default function ContactTypeToggle({ data, onChange }) {
  const ui = useUI();
  const { personType: selected, setPersonType: setSelected } = useContactsType();

  const userSelectedRef = useRef(false);
  const prevDataIdRef = useRef(data?.id ?? null);
  // The form only shows one identity shape at a time, but an existing record may be
  // toggled back and forth before the user saves. Keep the hidden shape locally so a
  // type preview never destroys a persisted value. These are drafts only: the active
  // form state is still cleared so the eventual save cannot persist fields belonging
  // to the other type.
  const initialIsPerson = data?.etgoIsperson === true || data?.etgoIsperson === 'Y';
  const companyNameDraftRef = useRef(initialIsPerson ? '' : (data?.name ?? ''));
  // A draft derived from person names may be safely refreshed when those names change.
  // A loaded or manually edited company name is always user-owned and restored verbatim.
  const companyNameAutoDerivedRef = useRef(false);
  const personNameDraftRef = useRef(initialIsPerson
    ? { firstName: data?.etgoFirstname ?? '', lastName: data?.etgoLastname ?? '' }
    : { firstName: '', lastName: '' });

  useEffect(() => {
    if (!data?.id) return;
    const prevDataId = prevDataIdRef.current;
    prevDataIdRef.current = data.id;

    // Switching to a DIFFERENT existing record must not leak hidden drafts from
    // the previously selected contact. Do not reset on a new record just saved:
    // its current edit state is still the source of truth for this mounted form.
    if (prevDataId && prevDataId !== data.id) {
      const isPerson = data.etgoIsperson === true || data.etgoIsperson === 'Y';
      companyNameDraftRef.current = isPerson ? '' : (data.name ?? '');
      companyNameAutoDerivedRef.current = false;
      personNameDraftRef.current = isPerson
        ? { firstName: data.etgoFirstname ?? '', lastName: data.etgoLastname ?? '' }
        : { firstName: '', lastName: '' };
    }

    if (!prevDataId && userSelectedRef.current) {
      // New record was just saved. The toggle choice already travelled to the
      // backend inside the create POST — `handleSelect` writes `etgoIsperson`
      // into the editing state via onChange, so the single create request
      // carries it alongside name/first/last. No separate PATCH is needed here;
      // we only stop resyncing `selected` from the freshly saved record to avoid
      // a transient flip back to the persisted-but-just-set value.
      userSelectedRef.current = false;
      return;
    }

    userSelectedRef.current = false;
    const isPerson = data.etgoIsperson === true || data.etgoIsperson === 'Y';
    setSelected(isPerson ? 'person' : 'company');
  }, [data?.id]);

  if (!data) return null;

  // Switching to company restores its local draft. A new record that began as a
  // person has no company draft, so first+last supply a useful initial legal name.
  // First/last are cleared from the active state: if saved as a company, they must
  // not be sent to the backend.
  function syncFieldsToCompany() {
    const firstName = (data?.etgoFirstname || '').trim();
    const lastName = (data?.etgoLastname || '').trim();
    const fullName = `${firstName} ${lastName}`.trim().replace(/\s{2,}/g, ' ');
    // Same rule for the person side: bank what the user typed, never overwrite the bank
    // with the empties this function itself just produced.
    if (firstName || lastName) personNameDraftRef.current = { firstName, lastName };
    const existingDraft = String(companyNameDraftRef.current || '').trim();
    const companyName = companyNameAutoDerivedRef.current || !existingDraft
      ? fullName
      : existingDraft;
    // Only a real value may move the draft. With no person name to derive from there is
    // nothing to record, and writing the empty result would discard a legal name the user
    // still owns — which is also what makes re-selecting the already-active Empresa a no-op
    // instead of a silent erase.
    if (companyName) {
      onChange('name', companyName);
      companyNameDraftRef.current = companyName;
      companyNameAutoDerivedRef.current = !existingDraft || companyNameAutoDerivedRef.current;
    }
    if (firstName) onChange('etgoFirstname', '');
    if (lastName) onChange('etgoLastname', '');
  }

  // Switching to person stores the company legal name locally, clears it from the
  // active payload, and restores any person draft. The backend rebuilds Name from
  // first/last on save, so the company-only value must not travel with a person.
  function clearNameForPerson() {
    const companyName = (data?.name || '').trim();
    if (companyName) {
      companyNameAutoDerivedRef.current = companyNameAutoDerivedRef.current
        && companyName === companyNameDraftRef.current;
      companyNameDraftRef.current = companyName;
    }
    if (companyName) onChange('name', '');
    const { firstName, lastName } = personNameDraftRef.current;
    if (firstName) onChange('etgoFirstname', firstName);
    if (lastName) onChange('etgoLastname', lastName);
  }

  function handleSelect(newType) {
    userSelectedRef.current = true;
    setSelected(newType);

    // Write the toggle choice and the dependent person/company fields into the
    // local editing state only. Persistence happens through the single explicit
    // Save (or the create POST), so `etgoIsperson` travels in the SAME request as
    // `name`/`etgoFirstname`/`etgoLastname` — the backend only keeps the person
    // name fields when `etgoIsperson` is true, so they must not be split across
    // separate, unordered PATCH requests.
    if (onChange) {
      onChange('etgoIsperson', newType === 'person');
      if (newType === 'company') syncFieldsToCompany();
      else clearNameForPerson();
    }
  }

  return (
    <div className="flex flex-row items-center gap-6" data-testid="contact-type-toggle">
      {[
        { value: 'person',  label: ui('Person') },
        { value: 'company', label: ui('company') },
      ].map(({ value, label }) => {
        const isSelected = selected === value;
        return (
          <label
            key={value}
            className="flex flex-row items-center gap-3 cursor-pointer select-none"
            onClick={(event) => {
              // ETP-5350 — `preventDefault` is load-bearing, not tidiness. This <label> wraps
              // an `sr-only` radio, so the browser's label activation behavior synthesizes a
              // SECOND click on that input, which bubbles back here and ran `handleSelect`
              // twice per user click. Harmless until the toggle started keeping drafts: the
              // second call runs after the first has already cleared the person fields, so it
              // derived an empty name and wiped the very state the drafts exist to preserve
              // (measured: legal name frozen at its first derivation, a corrected surname that
              // never re-synced, and a hand-typed Razón Social replaced on the next click).
              // The radio stays non-interactive and purely declarative for assistive tech.
              event.preventDefault();
              handleSelect(value);
            }}
          >
            <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
              <div
                className="w-[14.5px] h-[14.5px] rounded-full bg-card flex items-center justify-center transition-colors"
                style={{
                  border: `1.5px solid ${isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--border-control))'}`,
                  boxShadow: isSelected ? 'none' : '0px 1px 2px hsl(var(--foreground) / 0.05)',
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full" style={{ background: 'hsl(var(--foreground))' }} />
                )}
              </div>
            </div>
            <span className="text-sm text-[hsl(var(--foreground))]" style={{ lineHeight: '24px' }}>{label}</span>
            <input type="radio" className="sr-only" readOnly checked={isSelected} />
          </label>
        );
      })}
    </div>
  );
}
