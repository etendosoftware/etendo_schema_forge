import { useState, useMemo, useCallback } from 'react';
import RecordCreateModal from './RecordCreateModal.jsx';
import { useContactCategorySeed } from './useContactCategorySeed.js';
import {
  ContactTypeRequirementContext, buildContactTypeCreateCheck, contactTypeRequirementFor,
} from './contactTypeRequirement.js';
import { contactCategoryApiBaseUrl } from './contactCategoryFlags.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
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
  const ui = useUI();
  const contactTypeRequirement = useMemo(() => contactTypeRequirementFor(documentType), [documentType]);
  const categoryApiFetch = useApiFetch(contactCategoryApiBaseUrl(bpApiBaseUrl));
  // ETP-5791: the type-vs-category check for RecordCreateModal's fallback form (the embedded
  // window runs its own, see useContactCategoryTypeSync).
  const validateBeforeCreate = useMemo(
    () => buildContactTypeCreateCheck({ requirement: contactTypeRequirement, apiFetch: categoryApiFetch, ui }),
    [contactTypeRequirement, categoryApiFetch, ui],
  );
  const target = useMemo(
    () => ({ ...LOOKUP_CREATE_TARGETS.contact, apiBaseUrl: bpApiBaseUrl, validateBeforeCreate }),
    [bpApiBaseUrl, validateBeforeCreate],
  );

  const query = createContactState?.query ?? '';
  // The category id is per client, so it is looked up before the popup mounts (the embedded
  // window reads its seed once, on mount). A failed lookup still reports ready, with no
  // category, and the form's own default applies.
  const { ready: categoryReady, categorySeed } = useContactCategorySeed({
    contactsApiBaseUrl: bpApiBaseUrl, documentType, active: !!createContactState,
  });
  // ETP-5791: no `customer` / `vendor` in the seed — the new contact's type comes from the
  // seeded category (see `buildContactSeed`), and the popup refuses a category that does not
  // grant the type this document needs (`contactTypeRequirement`).
  const initialData = useMemo(
    () => ({ ...buildContactSeed(query), ...categorySeed }),
    [query, categorySeed],
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
