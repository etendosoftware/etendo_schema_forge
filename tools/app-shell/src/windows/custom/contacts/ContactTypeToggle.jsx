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
    <div
      className="flex items-center gap-1 p-1 h-10 rounded-xl"
      style={{ background: '#F5F7F9' }}
    >
      <button
        type="button"
        onClick={() => handleSelect('person')}
        className="flex-1 h-8 px-2 text-sm font-medium rounded-lg transition-all"
        style={
          selected === 'person'
            ? {
                background: '#FFFFFF',
                color: '#121217',
                boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)',
              }
            : { color: '#121217' }
        }
      >
        {ui('Person')}
      </button>
      <button
        type="button"
        onClick={() => handleSelect('company')}
        className="flex-1 h-8 px-2 text-sm font-medium rounded-lg transition-all"
        style={
          selected === 'company'
            ? {
                background: '#FFFFFF',
                color: '#121217',
                boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)',
              }
            : { color: '#121217' }
        }
      >
        {ui('company')}
      </button>
    </div>
  );
}
