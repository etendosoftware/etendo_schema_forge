import { useState, useMemo, useCallback } from 'react';
import RecordCreateModal from './RecordCreateModal.jsx';
import { useContactCategorySeed } from './useContactCategorySeed.js';
import { ContactTypeRequirementContext } from './contactTypeRequirement.js';
import { useContactCreateTypeGate } from './useContactCreateTypeGate.js';
import { buildContactSeed, resolveContactName } from './lookupCreateTargets.js';

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

  // ETP-5791 (flag `contact-category-type`): the memoised create target, the type requirement
  // the document imposes on the category, and whether the seed still carries customer/vendor.
  // See useContactCreateTypeGate for what ON and OFF do.
  const {
    requirement: contactTypeRequirement, target, seedDocumentType,
  } = useContactCreateTypeGate({ documentType, bpApiBaseUrl });

  const query = createContactState?.query ?? '';
  // The category id is per client, so it is looked up before the popup mounts (the embedded
  // window reads its seed once, on mount). A failed lookup still reports ready, with no
  // category, and the form's own default applies.
  const { ready: categoryReady, categorySeed } = useContactCategorySeed({
    contactsApiBaseUrl: bpApiBaseUrl, documentType, active: !!createContactState,
  });
  // Flag ON (ETP-5791): no `customer` / `vendor` in the seed (`seedDocumentType` is null) — the
  // new contact's type comes from the seeded category, and the popup refuses a category that
  // does not grant the type this document needs (`contactTypeRequirement`).
  // Flag OFF: the seed flags the contact from the document's nature, as before ETP-5791.
  const initialData = useMemo(
    () => ({ ...buildContactSeed(query, { documentType: seedDocumentType }), ...categorySeed }),
    [query, seedDocumentType, categorySeed],
  );

  const handleCreated = useCallback((record) => {
    createContactState?.onSelect({ id: record?.id, name: resolveContactName(record) });
    setCreateContactState(null);
  }, [createContactState]);

  const contactPortal = createContactState && categoryReady ? (
    <ContactTypeRequirementContext.Provider value={contactTypeRequirement}>
      <RecordCreateModal
        open
        target={target}
        initialQuery={query}
        initialData={initialData}
        token={token}
        onCancel={() => setCreateContactState(null)}
        onCreated={handleCreated}
        data-testid="RecordCreateModal__contact" />
    </ContactTypeRequirementContext.Provider>
  ) : null;

  return { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue, contactPortal };
}
