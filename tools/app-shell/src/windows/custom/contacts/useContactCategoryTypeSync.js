import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import {
  NOT_GRANTED_MESSAGE_KEY,
  useContactTypeRequirement,
} from '@/components/contract-ui/contactTypeRequirement.js';
import {
  categoryGrantsContactType,
  contactCategoryApiBaseUrl,
  fetchContactCategoryFlags,
} from '@/components/contract-ui/contactCategoryFlags.js';

const CATEGORY_FIELD = 'businessPartnerCategory';
const CATEGORY_LABEL_FIELD = `${CATEGORY_FIELD}$_identifier`;

/**
 * The Contacts header form's side of ETP-5791: the contact category decides the contact's type.
 *
 * Wraps the form's `onChange` for the category field and does two things:
 *
 * 1. **Saved contact — the category overwrites the type.** When the user picks another category
 *    on a contact that already exists, the Cliente / Proveedor-Acreedor checkboxes take the new
 *    category's flags, without asking. They are ordinary edits (`onChange`), so the user can
 *    still flip either box by hand before saving, and Save sends whatever is on screen. Nothing
 *    else is touched: unticking a type only hides its billing block (`BillingPreferencesForm`),
 *    the Tarifa / Método de pago / Cuenta / Condiciones de pago values stay in the record.
 *    A category with NEITHER flag (legacy, not yet migrated by data-fix R50) defines nothing —
 *    the backend inherits nothing from it either — so it leaves the checkboxes alone.
 *    A brand-new contact needs none of this: its checkboxes are not on screen before the first
 *    save, and the backend inherits the flags from the category on create.
 *
 * 2. **Create popup opened from a document — the category must grant the document's type.**
 *    Inside `ContactTypeRequirementContext` (a purchase needs a vendor, a sale a customer) a
 *    category that does not grant it is REFUSED: the selection is held until its flags are known
 *    and is only applied when they grant the type, otherwise a translated error is shown and the
 *    field keeps its previous value. A category that reached the form some other way — the
 *    `/defaults` category when the seed could not be resolved — is checked the same way and,
 *    when it does not grant the type, cleared with the error under the field, so the required
 *    field gate keeps Save disabled until a valid one is chosen. Holding (rather than applying
 *    and undoing) is what keeps an incompatible category from ever being saved, however fast the
 *    user clicks Save. Unknown flags (the category spec refused the read) and a category with
 *    neither flag (legacy, defines nothing — same as the backend) are let through.
 *
 * Only the instance that renders the category field may run this: DetailView mounts the header
 * form once per section, and each instance would otherwise toast and clear on its own.
 *
 * @param {object}   p
 * @param {object}   p.data        the header record being edited
 * @param {Function} p.onChange    the form's own onChange
 * @param {string}   p.apiBaseUrl  `<host>/sws/neo/contacts`
 * @param {boolean}  p.enabled     false for the sections that do not render the category
 * @returns {{ onChange: Function, categoryError: string|null }}
 */
export function useContactCategoryTypeSync({ data, onChange, apiBaseUrl, enabled }) {
  const ui = useUI();
  const requirement = useContactTypeRequirement();
  const requiredType = enabled ? requirement?.requiredType ?? null : null;
  const categoryBase = useMemo(() => contactCategoryApiBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const apiFetch = useApiFetch(categoryBase);
  const [categoryError, setCategoryError] = useState(null);

  // Latest values for the async continuations below, which must act on the form as it is when
  // the flags arrive, not as it was when the request left.
  const dataRef = useRef(data);
  dataRef.current = data;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // id → Promise<flags|null>. A category's flags do not change while the form is open; an
  // unknown answer is not cached, so a transient failure is retried on the next selection.
  const flagsCacheRef = useRef(new Map());
  useEffect(() => { flagsCacheRef.current = new Map(); }, [apiFetch]);
  const getFlags = useCallback((categoryId) => {
    const cache = flagsCacheRef.current;
    if (!cache.has(categoryId)) {
      const pending = fetchContactCategoryFlags(apiFetch, categoryId);
      cache.set(categoryId, pending);
      pending.then((flags) => { if (flags == null && cache.get(categoryId) === pending) cache.delete(categoryId); });
    }
    return cache.get(categoryId);
  }, [apiFetch]);

  // Each category selection gets a sequence number; only the latest one may apply its result.
  const seqRef = useRef(0);
  // The selection being held while its flags load: { seq, id, rest, label, hasLabel }.
  const heldRef = useRef(null);
  // Categories already accepted for the requirement, so the effect below does not re-check them.
  const acceptedRef = useRef(new Set());

  const notGrantedMessage = useCallback(
    (label) => ui(NOT_GRANTED_MESSAGE_KEY[requiredType], { category: label ?? '' }),
    [ui, requiredType],
  );

  /** Saved contact: copy the category's flags onto the type checkboxes. */
  const applyTypeFlags = useCallback((flags) => {
    const record = dataRef.current;
    if (!record?.id || !flags || !(flags.customer || flags.vendor)) return;
    const emit = onChangeRef.current;
    if (Boolean(record.customer) !== flags.customer) emit?.('customer', flags.customer);
    if (Boolean(record.vendor) !== flags.vendor) emit?.('vendor', flags.vendor);
  }, []);

  const settleHeld = useCallback((seq, flags) => {
    const held = heldRef.current;
    if (!held || held.seq !== seq) return;
    heldRef.current = null;
    if (!categoryGrantsContactType(flags, requiredType)) {
      const message = notGrantedMessage(held.label);
      setCategoryError(message);
      toast.error(message);
      return;
    }
    acceptedRef.current.add(held.id);
    setCategoryError(null);
    onChangeRef.current?.(CATEGORY_FIELD, held.id, ...held.rest);
    if (held.hasLabel) onChangeRef.current?.(CATEGORY_LABEL_FIELD, held.label);
    applyTypeFlags(flags);
  }, [requiredType, notGrantedMessage, applyTypeFlags]);

  const handleChange = useCallback((key, value, ...rest) => {
    if (!enabled) return onChange?.(key, value, ...rest);

    if (key === CATEGORY_FIELD) {
      seqRef.current += 1;
      const seq = seqRef.current;
      heldRef.current = null;
      if (!value) {
        setCategoryError(null);
        return onChange?.(key, value, ...rest);
      }
      if (requiredType) {
        // Held: EntityForm emits the label right after the id, in the same tick, and it is held
        // with it (see the CATEGORY_LABEL_FIELD branch below).
        heldRef.current = { seq, id: value, rest, label: undefined, hasLabel: false };
        getFlags(value).then(flags => settleHeld(seq, flags));
        return undefined;
      }
      onChange?.(key, value, ...rest);
      if (dataRef.current?.id) {
        getFlags(value).then((flags) => { if (seqRef.current === seq) applyTypeFlags(flags); });
      }
      return undefined;
    }

    if (key === CATEGORY_LABEL_FIELD && heldRef.current && !heldRef.current.hasLabel) {
      heldRef.current.label = value;
      heldRef.current.hasLabel = true;
      return undefined;
    }

    return onChange?.(key, value, ...rest);
  }, [enabled, onChange, requiredType, getFlags, settleHeld, applyTypeFlags]);

  // A category that did not come through `handleChange` (the seed, the `/defaults` merge) is
  // checked once against the requirement and cleared when it does not grant the type.
  const currentCategory = data?.[CATEGORY_FIELD] || null;
  const currentLabel = data?.[CATEGORY_LABEL_FIELD];
  useEffect(() => {
    if (!requiredType || !currentCategory || acceptedRef.current.has(currentCategory)) return undefined;
    let cancelled = false;
    const seq = seqRef.current;
    getFlags(currentCategory).then((flags) => {
      if (cancelled || seqRef.current !== seq || dataRef.current?.[CATEGORY_FIELD] !== currentCategory) return;
      if (categoryGrantsContactType(flags, requiredType)) {
        acceptedRef.current.add(currentCategory);
        return;
      }
      setCategoryError(notGrantedMessage(currentLabel));
      onChangeRef.current?.(CATEGORY_FIELD, null);
      onChangeRef.current?.(CATEGORY_LABEL_FIELD, '');
    });
    return () => { cancelled = true; };
  }, [requiredType, currentCategory, currentLabel, getFlags, notGrantedMessage]);

  return { onChange: handleChange, categoryError };
}
