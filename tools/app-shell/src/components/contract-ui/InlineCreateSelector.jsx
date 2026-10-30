import { useState, useRef, useMemo } from 'react';
import { apiFetch as defaultApiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCanCreateInSpec } from '@/hooks/useCanCreateInSpec.js';
import {
  extractBackendMessageKeys, extractBackendMessageParams, translateBackendError,
} from '@/lib/backendErrors.js';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';
import { InlineCreateModal } from './InlineCreateModal.jsx';
import { resolveInlineCreateVariant, resolveCreateErrorMessage } from '@/lib/inlineCreateVariants.js';

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
 * POST `body` (default `{ name }`) to a lookup table's W endpoint and return the created
 * `{ id, name }`. Throws on a non-ok response or a missing id so the modal can surface the
 * error; the thrown error carries the HTTP `status` and the backend `messageKeys` /
 * `messageParams` (when sent) so a caller can translate it.
 *
 * @param {object}   args
 * @param {Function} [args.request] - authenticated fetch to use (a component passes its
 *   `useApiFetch()` so the write invalidates dependent caches); defaults to the core `apiFetch`.
 * @param {object}   [args.body]    - request body; defaults to `{ name }`.
 */
export async function createLookupRecord({
  apiBaseUrl, createSpec, createEntity, token, name, body, request = defaultApiFetch,
}) {
  const res = await request(buildCreateUrl(apiBaseUrl, createSpec, createEntity), {
    method: 'POST',
    baseUrl: '',
    token,
    body: JSON.stringify(body ?? { name }),
  });
  if (!res.ok) {
    let message;
    let messageKeys;
    let messageParams;
    try {
      const errorBody = await res.json();
      message = errorBody?.response?.error?.message || errorBody?.error?.message || errorBody?.message;
      messageKeys = extractBackendMessageKeys(errorBody);
      messageParams = extractBackendMessageParams(errorBody);
    } catch { /* non-JSON error body */ }
    const error = new Error(message || `Request failed (${res.status})`);
    error.status = res.status;
    error.messageKeys = messageKeys;
    error.messageParams = messageParams;
    throw error;
  }
  const json = await res.json();
  const rec = json?.response?.data?.[0] ?? json?.response?.data ?? json?.data ?? json;
  const id = rec?.id ?? rec?.[`${createEntity}_ID`];
  if (!id) throw new Error('Created record has no id');
  return { id, name: rec?.name ?? name };
}

/**
 * The message shown in the create modal for a failed create:
 * 1. the variant's own translation when its error rules match (`resolveCreateErrorMessage`);
 * 2. otherwise the shared translator (`translateBackendError`: backend message keys first, then
 *    known backend texts);
 * 3. a translator miss keeps the backend text for a 4xx — a refusal written for the user — but
 *    never for a 5xx or a missing status: that text is a server failure (it can carry raw SQL), so
 *    the user gets the generic translated error instead (ETP-5826 QA BUG-1). A network failure keeps
 *    its own message, which the request helper already translated.
 */
function describeCreateError(variant, error, ui) {
  if (isNetworkError(error)) return error.message;
  const mapped = resolveCreateErrorMessage(variant, error);
  if (mapped) return ui(mapped.key, mapped.params);
  const raw = error?.message;
  const translated = translateBackendError(raw, ui, {
    messageKeys: error?.messageKeys, messageParams: error?.messageParams,
  });
  if (translated && translated !== raw) return translated;
  const isClientRefusal = typeof error?.status === 'number' && error.status >= 400 && error.status < 500;
  return (isClientRefusal && raw) ? raw : ui('genericError');
}

/**
 * Searchable FK selector with inline record creation via a small create modal (mirrors the
 * reject-reason flow). Wraps {@link CreatableSearchSelect}: the "+ create" action opens
 * {@link InlineCreateModal} pre-filled with the typed text; on submit it POSTs to the target
 * table and auto-selects the new record.
 *
 * What the modal asks for, how it is validated, the request body and the option order come
 * from the `createSpec`'s variant (`inlineCreateVariants.js`); without one it is a name-only
 * create.
 *
 * The "+ create" row is shown only when the current role may write `createSpec`'s window
 * (`useCanCreateInSpec`: write tier or admin; hidden while access is unloaded; a spec with no
 * window in `menu.json` is not gated). Without it the component is a plain searchable selector —
 * the POST would be refused with a 403 anyway.
 *
 * @param {string} createSpec       - NEO spec backing the create endpoint.
 * @param {string} createEntity     - entity within that spec.
 * @param {string} createLabel      - "+ create" action label shown in the dropdown.
 * @param {string} createTitle      - modal heading.
 * @param {string} namePlaceholder  - modal input placeholder.
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
  const ui = useUI();
  const request = useApiFetch();
  const variant = resolveInlineCreateVariant(createSpec);
  const canCreate = useCanCreateInSpec(createSpec);
  const [modalOpen, setModalOpen] = useState(false);
  const [initialName, setInitialName] = useState('');
  const onCreatedRef = useRef(null);

  const validate = useMemo(() => {
    if (!variant.validate) return undefined;
    return (value) => {
      const problem = variant.validate(value);
      return problem ? ui(problem.key, problem.params) : null;
    };
  }, [variant, ui]);

  const handleCreateRequest = (query, onCreated) => {
    onCreatedRef.current = onCreated;
    setInitialName((query || '').trim());
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    onCreatedRef.current = null;
  };

  const handleSubmit = async (value) => {
    let created;
    try {
      created = await createLookupRecord({
        apiBaseUrl, createSpec, createEntity, token, name: value, body: variant.buildBody(value), request,
      });
    } catch (e) {
      throw new Error(describeCreateError(variant, e, ui));
    }
    onCreatedRef.current?.(created.id, created.name);
    setModalOpen(false);
    onCreatedRef.current = null;
  };

  return (
    <>
      <CreatableSearchSelect
        {...selectProps}
        token={token}
        createLabel={canCreate ? createLabel : undefined}
        onCreateRequest={canCreate ? handleCreateRequest : undefined}
        sortOptions={variant.sortOptions}
        data-testid="CreatableSearchSelect__1ec739" />
      <InlineCreateModal
        open={modalOpen}
        title={createTitle}
        namePlaceholder={namePlaceholder}
        initialName={initialName}
        inputLabel={variant.inputLabelKey ? ui(variant.inputLabelKey) : undefined}
        inputSuffix={variant.inputSuffixKey ? ui(variant.inputSuffixKey) : undefined}
        inputMode={variant.inputMode}
        inputPattern={variant.inputPattern}
        maxLength={variant.inputMaxLength}
        rejectedMessage={variant.inputRejectedKey ? ui(variant.inputRejectedKey) : undefined}
        validate={validate}
        onCancel={closeModal}
        onSubmit={handleSubmit}
        data-testid="InlineCreateModal__1ec739" />
    </>
  );
}
