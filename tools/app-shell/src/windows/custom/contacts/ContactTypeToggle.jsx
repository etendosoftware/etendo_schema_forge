import { useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useContactsType } from './ContactsContext';

/* eslint-disable react/prop-types */

export default function ContactTypeToggle({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  const { personType: selected, setPersonType: setSelected } = useContactsType();

  // Ref so the post-save PATCH can read the current selection without a stale closure
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const userSelectedRef = useRef(false);
  const prevDataIdRef = useRef(data?.id ?? null);

  useEffect(() => {
    if (!data?.id) return;
    const prevDataId = prevDataIdRef.current;
    prevDataIdRef.current = data.id;

    if (!prevDataId && userSelectedRef.current) {
      // New record was just saved — persist the user's toggle choice
      userSelectedRef.current = false;
      if (recordId && token && apiBaseUrl) {
        fetch(`${apiBaseUrl}/businessPartner/${recordId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ etgoIsperson: selectedRef.current === 'person' }),
        }).catch(() => {});
      }
      return;
    }

    userSelectedRef.current = false;
    const isPerson = data.etgoIsperson === true || data.etgoIsperson === 'Y';
    setSelected(isPerson ? 'person' : 'company');
  }, [data?.id]);

  if (!data) return null;

  function handleSelect(newType) {
    userSelectedRef.current = true;
    setSelected(newType);
    if (recordId && token && apiBaseUrl) {
      fetch(`${apiBaseUrl}/businessPartner/${recordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ etgoIsperson: newType === 'person' }),
      }).catch(() => {});
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
                className="w-[14.5px] h-[14.5px] rounded-full bg-white flex items-center justify-center transition-colors"
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
