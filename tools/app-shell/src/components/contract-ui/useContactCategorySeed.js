import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import {
  CONTACT_CATEGORY_KEY_BY_DOCUMENT_TYPE,
  resolveContactCategorySeed,
} from './lookupCreateTargets.js';

const NO_SEED = Object.freeze({});

/**
 * Resolves the contact-category seed (see `resolveContactCategorySeed`) while a create-contact
 * popup is being opened, and tells the caller when it is safe to mount it.
 *
 * Why the caller must WAIT for `ready` instead of merging the seed in late: the embedded
 * Contacts window reads its `initialData` once, when `useEntity.handleNew` runs on mount.
 * A seed that arrives afterwards is silently ignored. Waiting costs one small selector call
 * (4s ceiling); a failure or a missing group still reports `ready` with an empty seed, so the
 * popup always opens and the form's own default applies.
 *
 * Once mounted, the seed beats the `/defaults` response with no extra handling: `handleNew`
 * marks every seeded key as user-changed and `mergeDefaultsPreservingUserEdits` never
 * overwrites those.
 *
 * @param {object}  p
 * @param {string}  p.contactsApiBaseUrl `<host>/sws/neo/contacts`
 * @param {string}  [p.documentType]     'purchase' | 'sale'; anything else needs no lookup
 * @param {boolean} p.active             true while the popup is wanted open
 * @returns {{ ready: boolean, categorySeed: object }}
 */
export function useContactCategorySeed({ contactsApiBaseUrl, documentType, active }) {
  const apiFetch = useApiFetch(contactsApiBaseUrl);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!active) {
      setResult(null);
      return undefined;
    }
    if (!CONTACT_CATEGORY_KEY_BY_DOCUMENT_TYPE[documentType]) {
      setResult({ forType: documentType, seed: NO_SEED });
      return undefined;
    }
    let cancelled = false;
    resolveContactCategorySeed({ apiFetch, documentType }).then((seed) => {
      if (!cancelled) setResult({ forType: documentType, seed });
    });
    return () => { cancelled = true; };
  }, [active, documentType, apiFetch]);

  const ready = active && result?.forType === documentType;
  return { ready, categorySeed: ready ? result.seed : NO_SEED };
}
