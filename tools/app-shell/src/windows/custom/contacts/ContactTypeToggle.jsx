import { useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useContactsType } from './ContactsContext';

/* eslint-disable react/prop-types */

export default function ContactTypeToggle({ data, onChange }) {
  const ui = useUI();
  const { personType: selected, setPersonType: setSelected } = useContactsType();

  const userSelectedRef = useRef(false);
  const prevDataIdRef = useRef(data?.id ?? null);

  // Stores the exact string we last auto-wrote to `name` (null = we've written
  // nothing). Used to detect whether the current Razón Social is still "owned by
  // us" (safe to re-sync) or has been edited by the user / carries a persisted
  // value we never generated (must never be overwritten).
  const lastAutoFilledNameRef = useRef(null);

  useEffect(() => {
    if (!data?.id) return;
    const prevDataId = prevDataIdRef.current;
    prevDataIdRef.current = data.id;

    // Switching to a DIFFERENT existing record — start the auto-fill heuristic
    // fresh so a value we wrote for the previous contact does not leak into the
    // ownership check for this one. Guarded by `prevDataId && prevDataId !== data.id`
    // so the "new record was just saved" path (prevDataId === null) below does
    // NOT wipe a value we just wrote for the record being saved.
    if (prevDataId && prevDataId !== data.id) {
      lastAutoFilledNameRef.current = null;
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

  // Switching to company: keep the legal name (Razón Social) in sync with the
  // typed first/last name — as long as the current value is still the one WE
  // auto-generated (or is blank). Once the user edits it by hand, or the record
  // carries a persisted value we never generated, it is user-owned and must never
  // be overwritten. A company has no personal first/last name, so those fields
  // are also cleared (they are hidden in company mode anyway).
  function syncFieldsToCompany() {
    const firstName = (data?.etgoFirstname || '').trim();
    const lastName = (data?.etgoLastname || '').trim();
    const currentName = (data?.name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim().replace(/\s{2,}/g, ' ');
    const ownedByAuto = currentName === '' || currentName === lastAutoFilledNameRef.current;
    if (ownedByAuto && fullName && fullName !== currentName) {
      onChange('name', fullName);
      lastAutoFilledNameRef.current = fullName;
    }
    if (firstName) onChange('etgoFirstname', '');
    if (lastName) onChange('etgoLastname', '');
  }

  // Switching to person: the backend rebuilds Name from first/last on save, so
  // the Razón Social is not user-owned data — clear it to avoid carrying a stale
  // company name. Reset the auto-fill tracker: the field is now blank.
  function clearNameForPerson() {
    if ((data?.name || '').trim() !== '') onChange('name', '');
    lastAutoFilledNameRef.current = null;
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
    <div className="flex flex-row items-center gap-6">
      {[
        { value: 'person',  label: ui('Person') },
        { value: 'company', label: ui('company') },
      ].map(({ value, label }) => {
        const isSelected = selected === value;
        return (
          <label
            key={value}
            className="flex flex-row items-center gap-3 cursor-pointer select-none"
            onClick={() => handleSelect(value)}
          >
            <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
              <div
                className="w-[14.5px] h-[14.5px] rounded-full bg-card flex items-center justify-center transition-colors"
                style={{
                  border: `1.5px solid ${isSelected ? '#121217' : '#D1D4DB'}`,
                  boxShadow: isSelected ? 'none' : '0px 1px 2px rgba(18,18,23,0.05)',
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full" style={{ background: '#121217' }} />
                )}
              </div>
            </div>
            <span className="text-sm text-[#121217]" style={{ lineHeight: '24px' }}>{label}</span>
            <input type="radio" className="sr-only" readOnly checked={isSelected} />
          </label>
        );
      })}
    </div>
  );
}
