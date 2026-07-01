import { useState, useRef } from 'react';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';
import { InlineCreateModal } from './InlineCreateModal.jsx';

/**
 * Build the create endpoint for an inline-creatable FK. The host window's `apiBaseUrl`
 * ends with its own spec (e.g. `/sws/neo/match-rule`); the new record lives in a
 * different spec/entity, so swap the spec segment: `/sws/neo/transaction-type/transactionType`.
 */
export function buildCreateUrl(apiBaseUrl, createSpec, createEntity) {
  const specBase = apiBaseUrl.replace(/\/[^/]+$/, '/' + createSpec);
  return `${specBase}/${createEntity}`;
}

/**
 * POST `{ name }` to a lookup table's W endpoint and return the created `{ id, name }`.
 * Throws on a non-ok response or a missing id so the modal can surface the error.
 */
export async function createLookupRecord({ apiBaseUrl, createSpec, createEntity, token, name }) {
  const res = await fetch(buildCreateUrl(apiBaseUrl, createSpec, createEntity), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let message;
    try {
      const body = await res.json();
      message = body?.response?.error?.message || body?.message;
    } catch { /* non-JSON error body */ }
    throw new Error(message || `Request failed (${res.status})`);
  }
  const json = await res.json();
  const rec = json?.response?.data?.[0] ?? json?.response?.data ?? json?.data ?? json;
  const id = rec?.id ?? rec?.[`${createEntity}_ID`];
  if (!id) throw new Error('Created record has no id');
  return { id, name: rec?.name ?? name };
}

/**
 * Searchable FK selector with inline record creation via a small "create by name"
 * modal (mirrors the reject-reason flow). Wraps {@link CreatableSearchSelect}: the
 * "+ create" action opens {@link InlineCreateModal} pre-filled with the typed text;
 * on submit it POSTs to the target table and auto-selects the new record.
 *
 * @param {string} createSpec       - NEO spec backing the create endpoint.
 * @param {string} createEntity     - entity within that spec.
 * @param {string} createLabel      - "+ create" action label shown in the dropdown.
 * @param {string} createTitle      - modal heading.
 * @param {string} namePlaceholder  - modal name-input placeholder.
 * @param {string} apiBaseUrl       - host window API base (spec segment is swapped out).
 * @param {string} token            - JWT bearer token.
 * (remaining props are forwarded verbatim to CreatableSearchSelect)
 */
export function InlineCreateSelector({
  createSpec,
  createEntity,
  createLabel,
  createTitle,
  namePlaceholder,
  apiBaseUrl,
  token,
  ...selectProps
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialName, setInitialName] = useState('');
  const onCreatedRef = useRef(null);

  const handleCreateRequest = (query, onCreated) => {
    onCreatedRef.current = onCreated;
    setInitialName((query || '').trim());
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    onCreatedRef.current = null;
  };

  const handleSubmit = async (name) => {
    const created = await createLookupRecord({ apiBaseUrl, createSpec, createEntity, token, name });
    onCreatedRef.current?.(created.id, created.name);
    setModalOpen(false);
    onCreatedRef.current = null;
  };

  return (
    <>
      <CreatableSearchSelect
        {...selectProps}
        token={token}
        createLabel={createLabel}
        onCreateRequest={handleCreateRequest}
        data-testid="CreatableSearchSelect__1ec739" />
      <InlineCreateModal
        open={modalOpen}
        title={createTitle}
        namePlaceholder={namePlaceholder}
        initialName={initialName}
        onCancel={closeModal}
        onSubmit={handleSubmit}
        data-testid="InlineCreateModal__1ec739" />
    </>
  );
}
