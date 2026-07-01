import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CreateContactModal from './CreateContactModal';

export function useCreateContactModal({ apiBaseUrl, token, documentType = 'sale' }) {
  const [createContactState, setCreateContactState] = useState(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const bpApiBaseUrl = useMemo(
    () => (apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/contacts') : null),
    [apiBaseUrl],
  );

  const createContactCtxValue = useMemo(() => ({
    fieldKey: 'businessPartner',
    onOpen: (query, onSelect) => setCreateContactState({ query, onSelect }),
  }), []);

  const contactPortal = createContactState ? createPortal(
    <CreateContactModal
      bpApiBaseUrl={bpApiBaseUrl}
      headers={headers}
      initialQuery={createContactState.query}
      documentType={documentType}
      onClose={() => setCreateContactState(null)}
      onCreated={(newBP) => {
        createContactState.onSelect({ id: newBP.id, name: newBP.name });
        setCreateContactState(null);
      }}
      data-testid="CreateContactModal__2fcf00" />,
    document.body,
  ) : null;

  return { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue, contactPortal };
}
