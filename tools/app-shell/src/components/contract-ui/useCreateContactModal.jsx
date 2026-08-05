import { useState, useMemo } from 'react';
import { jsonHeaders } from '@/lib/sessionHeaders.js';
import { createPortal } from 'react-dom';
import CreateContactModal from './CreateContactModal';

export function useCreateContactModal({ apiBaseUrl, documentType = 'sale' }) {
  const [createContactState, setCreateContactState] = useState(null);

  // ETP-4576 — no credential in the header; the `__Host-` session cookie carries
  // the session and each fetch opts in with `credentials: 'include'`.
  const headers = jsonHeaders();

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
