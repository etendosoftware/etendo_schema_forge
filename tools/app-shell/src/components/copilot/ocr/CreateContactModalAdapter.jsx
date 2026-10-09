import { useMemo } from 'react';
import RecordCreateModal from '../../contract-ui/RecordCreateModal.jsx';
import {
  LOOKUP_CREATE_TARGETS, buildContactSeed, resolveContactName,
} from '../../contract-ui/lookupCreateTargets.js';
import { useContactCategorySeed } from '../../contract-ui/useContactCategorySeed.js';
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
  const documentType = item?.payload?.documentType || null;
  // Resolved before the popup mounts: the embedded window reads its seed once, on mount.
  const { ready, categorySeed } = useContactCategorySeed({
    contactsApiBaseUrl: bpApiBaseUrl, documentType, active: true,
  });
  const initialData = useMemo(
    () => ({ ...buildOcrContactSeed(prefilled, documentType), ...categorySeed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(prefilled), documentType, categorySeed],
  );

  // The address belongs to the `locationAddress` child tab: it reaches the Contacts window as a
  // seed that only the tab's "Add address" modal consumes (ETP-5654).
  const initialChildData = useMemo(() => {
    const addressSeed = buildOcrContactAddressSeed(prefilled);
    return addressSeed ? { locationAddress: addressSeed } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prefilled)]);

  if (!ready) return null;

  return (
    <RecordCreateModal
      open
      target={target}
      initialQuery={initialQuery}
      initialData={initialData}
      initialChildData={initialChildData}
      token={token}
      onCancel={onCancel}
      onCreated={record => onSubmit({ created: { ...record, name: resolveContactName(record) } })}
      data-testid="RecordCreateModal__ocrContact" />
  );
}

/**
 * Maps the OCR extraction onto `businessPartner` header fields.
 *
 * Only the four header keys are seeded here. `address`, `postalCode`, `city` and `country` —
 * also produced by `createPrefilledFrom` in `ocrDocTypes.js` — belong to the `locationAddress`
 * CHILD tab, so they travel separately as `initialChildData` (see `buildOcrContactAddressSeed`).
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

/**
 * Maps the OCR address onto the seed of the Contacts window's `locationAddress` tab
 * (ETP-5654): `address`, `postalCode`, `city` and `country` -> `countryName`, trimmed.
 * Returns `null` when all four are empty, so no seed is passed at all. Region is never
 * seeded — it is the user's choice.
 */
export function buildOcrContactAddressSeed(prefilled) {
  const p = prefilled || {};
  const trimmed = value => String(value ?? '').trim();
  const seed = {
    address: trimmed(p.address),
    postalCode: trimmed(p.postalCode),
    city: trimmed(p.city),
    countryName: trimmed(p.country),
  };
  return Object.values(seed).some(Boolean) ? seed : null;
}
