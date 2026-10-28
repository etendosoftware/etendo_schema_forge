import { useMemo } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { buildContactTypeCreateCheck, contactTypeRequirementFor } from './contactTypeRequirement.js';
import { contactCategoryApiBaseUrl } from './contactCategoryFlags.js';
import { LOOKUP_CREATE_TARGETS } from './lookupCreateTargets.js';

/**
 * The "create contact" popup's side of the `contact-category-type` flag (ETP-5791), shared by
 * the document Contacto selector (`useCreateContactModal`) and the OCR adapter
 * (`CreateContactModalAdapter`). The single toggle point of both flows.
 *
 * Flag ON — the contact category decides the type:
 *  - `requirement`: the type the calling document needs (`ContactTypeRequirementContext` value),
 *    so the embedded Contacts window refuses a category that does not grant it;
 *  - `target.validateBeforeCreate`: the same refusal for RecordCreateModal's fallback form;
 *  - `target.createOmitUntouched`: `customer` / `vendor` are not POSTed unless the user set them,
 *    so the backend inherits them from the category;
 *  - `seedDocumentType: null`: the seed carries no `customer` / `vendor`.
 *
 * Flag OFF — the pre-ETP-5791 popup: no requirement, no check, every key POSTed, and the seed
 * flags the contact `vendor` (purchase) / `customer` (sale) from `seedDocumentType`.
 *
 * @param {{ documentType: 'sale'|'purchase'|null|undefined, bpApiBaseUrl: string }} p
 * @returns {{ enabled: boolean, requirement: object|null, target: object, seedDocumentType: string|null }}
 */
export function useContactCreateTypeGate({ documentType, bpApiBaseUrl }) {
  const enabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const ui = useUI();
  const requirement = useMemo(
    () => (enabled ? contactTypeRequirementFor(documentType) : null),
    [enabled, documentType],
  );
  const categoryApiFetch = useApiFetch(contactCategoryApiBaseUrl(bpApiBaseUrl));
  const validateBeforeCreate = useMemo(
    () => buildContactTypeCreateCheck({ requirement, apiFetch: categoryApiFetch, ui }),
    [requirement, categoryApiFetch, ui],
  );
  // Memoised: RecordCreateModal's reset effect depends on `target`, so a fresh object per render
  // would reload the window module and refetch /defaults on every keystroke behind the dialog.
  const target = useMemo(() => {
    const { createOmitUntouched, ...base } = LOOKUP_CREATE_TARGETS.contact;
    return {
      ...base,
      apiBaseUrl: bpApiBaseUrl,
      ...(enabled && { createOmitUntouched, validateBeforeCreate }),
    };
  }, [enabled, bpApiBaseUrl, validateBeforeCreate]);
  return { enabled, requirement, target, seedDocumentType: enabled ? null : (documentType ?? null) };
}
