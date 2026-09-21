import { useMemo } from 'react';
import RecordCreateModal from '../../contract-ui/RecordCreateModal.jsx';
import {
  LOOKUP_CREATE_TARGETS, buildContactSeed, resolveContactName,
} from '../../contract-ui/lookupCreateTargets.js';
import { deriveContactsApiBase } from './contactApi.js';

/* eslint-disable react/prop-types */

/**
 * Bridges the OCR EntityField create-popup contract
 * ({ item, apiBaseUrl, token, onCancel, onSubmit }) to `RecordCreateModal`.
 *
 * ETP-5332: this used to open `CreateContactModal`, a hand-rolled copy of the Contacts
 * window. It now opens the Contacts window itself, exactly like a document's Contacto
 * selector does, so OCR and the document flow can no longer disagree about what creating a
 * contact looks like.
 */
export default function CreateContactModalAdapter({ item, apiBaseUrl, token, onCancel, onSubmit }) {
  const bpApiBaseUrl = useMemo(() => deriveContactsApiBase(apiBaseUrl), [apiBaseUrl]);

  // Memoised: RecordCreateModal's reset effect depends on `target`, so a fresh object per
  // render would reload the window module and refetch /defaults continuously.
  const target = useMemo(
    () => ({ ...LOOKUP_CREATE_TARGETS.contact, apiBaseUrl: bpApiBaseUrl }),
    [bpApiBaseUrl],
  );

  const prefilled = item?.payload?.prefilled || {};
  const initialQuery = prefilled.name || '';
  const initialData = useMemo(
    () => buildOcrContactSeed(prefilled, item?.payload?.documentType || null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(prefilled), item?.payload?.documentType],
  );

  return (
    <RecordCreateModal
      open
      target={target}
      initialQuery={initialQuery}
      initialData={initialData}
      token={token}
      onCancel={onCancel}
      onCreated={record => onSubmit({ created: { ...record, name: resolveContactName(record) } })}
      data-testid="RecordCreateModal__ocrContact" />
  );
}

/**
 * Maps the OCR extraction onto `businessPartner` header fields.
 *
 * Only the four header keys are seeded. `address`, `postalCode`, `city` and `country` — also
 * produced by `createPrefilledFrom` in `ocrDocTypes.js` — belong to the `locationAddress`
 * CHILD tab, not to the header record `initialData` seeds, so the user still types those.
 * Registered as debt (`ocr-contact-address-prefill`): closing it means seeding a child tab's
 * new row, a different mechanism from `useEntity.handleNew`.
 */
export function buildOcrContactSeed(prefilled, documentType) {
  const p = prefilled || {};
  return {
    ...buildContactSeed(p.name, { documentType }),
    ...(p.taxID && { taxID: p.taxID }),
    ...(p.etgoEmail && { etgoEmail: p.etgoEmail }),
    ...(p.etgoPhone && { etgoPhone: p.etgoPhone }),
  };
}
