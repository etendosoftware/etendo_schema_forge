import { useState, useMemo, useCallback } from 'react';
import RecordCreateModal from './RecordCreateModal.jsx';
import { LOOKUP_CREATE_TARGETS, buildContactSeed, resolveContactName } from './lookupCreateTargets.js';

import { buildHeaders } from '@/auth/api.js';

/**
 * Wires the "+ Crear contacto" affordance a document's Contacto selector offers.
 *
 * ETP-5332: what this opens is the REAL Contacts window, mounted at its own `new` route
 * inside a dialog by `RecordCreateModal`/`EmbeddedWindowRoute` — the mechanism ETP-5254
 * built for Products. It used to open `CreateContactModal`, a hand-rolled reimplementation
 * of that window which had already drifted from it (missing fields, different validations,
 * options in the wrong language). Mounting the window instead of imitating it is what makes
 * the drift structurally impossible rather than merely fixed once.
 *
 * The trigger side is untouched: `createContactCtxValue` still flows through
 * `CreateContactContext` into `EntityForm.SearchSelectField`, and `onSelect` still receives
 * `{ id, name }`, so none of the six document windows had to change.
 */
export function useCreateContactModal({ apiBaseUrl, token, documentType = 'sale' }) {
  const [createContactState, setCreateContactState] = useState(null);

  const headers = useMemo(() => (buildHeaders(token)), [token]);

  const bpApiBaseUrl = useMemo(
    () => (apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/contacts') : null),
    [apiBaseUrl],
  );

  const createContactCtxValue = useMemo(() => ({
    fieldKey: 'businessPartner',
    onOpen: (query, onSelect) => setCreateContactState({ query, onSelect }),
  }), []);

  // Memoised because RecordCreateModal's reset effect has `target` in its dependency array:
  // a fresh object per render would re-run it — reloading the window module and refetching
  // /defaults — on every keystroke in the document behind the dialog.
  const target = useMemo(
    () => ({ ...LOOKUP_CREATE_TARGETS.contact, apiBaseUrl: bpApiBaseUrl }),
    [bpApiBaseUrl],
  );

  const query = createContactState?.query ?? '';
  const initialData = useMemo(
    () => buildContactSeed(query, { documentType }),
    [query, documentType],
  );

  const handleCreated = useCallback((record) => {
    createContactState?.onSelect({ id: record?.id, name: resolveContactName(record) });
    setCreateContactState(null);
  }, [createContactState]);

  const contactPortal = createContactState ? (
    <RecordCreateModal
      open
      target={target}
      initialQuery={query}
      initialData={initialData}
      token={token}
      onCancel={() => setCreateContactState(null)}
      onCreated={handleCreated}
      data-testid="RecordCreateModal__contact" />
  ) : null;

  return { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue, contactPortal };
}
