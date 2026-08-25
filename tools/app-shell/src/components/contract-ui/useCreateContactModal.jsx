import { useState, useMemo } from 'react';
import { writeHeaders } from '@/lib/sessionHeaders.js';
import { createPortal } from 'react-dom';
import CreateContactModal from './CreateContactModal';

export function useCreateContactModal({ apiBaseUrl, documentType = 'sale' }) {
  const [createContactState, setCreateContactState] = useState(null);

  // ETP-4576 — the WRITE builder, not `jsonHeaders()`. This one bag is handed to
  // CreateContactModal, which creates the partner and its location with five POSTs
  // and rolls back with a DELETE, and to CloneOrderModal, which POSTs the clone
  // action. A read builder omits `X-Go-CSRF`, so under the cookie session every
  // one of those writes would come back 403 — with the reads still working, which
  // is what makes this kind of mix-up hard to spot.
  const headers = writeHeaders();

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
