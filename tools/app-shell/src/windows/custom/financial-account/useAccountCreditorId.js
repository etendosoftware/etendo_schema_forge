import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import {
  ACTION_BASE_ABSOLUTE,
  NEW_RECORD_SEGMENT,
  creditorIdSaveErrorMessage,
  fetchCreditorIdInfo,
  notifyCreditorIdSaved,
  saveCreditorId,
} from '@/lib/sepaCreditorIdApi.js';
import { creditorIdErrorKey, normalizeCreditorId } from '@/lib/sepaCreditorId.js';

/** i18n key of the hint shown when a saved identifier is emptied (the backend cannot delete it). */
export const CREDITOR_ID_CLEARED_KEY = 'sepaCreditorIdCannotClear';

/**
 * ETP-6247 — the SEPA creditor identifier of the account being edited, as one more field of the
 * «Editar cuenta» form. It reads ONLY the value stored on the account (`accountCreditorId` of the
 * remittance `sepaFileData` answer, never the organization-computed proposal) and is saved by the
 * modal's «Guardar cambios» together with the other fields, through the remittance `saveCreditorId`
 * action on the record `new` with `saveToAccount`. The server stays the authority on the format; the
 * inline error is the same rule (lib/sepaCreditorId.js) sparing the round-trip.
 *
 * The identifier cannot be deleted (the backend has no such action), so emptying a saved value is
 * a blocking state with its own hint instead of a silent no-op. An account that never had one may
 * keep the field empty. A refusal to read it (no remittance payment methods, flag off, ...) leaves
 * `available` false and the section hidden rather than showing an error the user cannot act on.
 *
 * @param {{ open: boolean, account: object|null, capable: boolean, active: boolean, ui: Function }} params
 *   `capable`: the sepaRemittances capability; `active`: the pending Type is Bank. The value is read
 *   once per opening, the first time the Type is Bank (a Cash account never reads it).
 */
export function useAccountCreditorId({ open, account, capable, active, ui }) {
  const apiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  const accountId = account?.id ?? null;
  const [available, setAvailable] = useState(false);
  const [stored, setStored] = useState('');
  const [value, setValue] = useState('');
  const [requested, setRequested] = useState(false);
  const requestRef = useRef(0);

  // A new account (or reopening the modal) forgets everything that was read or typed.
  useEffect(() => {
    requestRef.current += 1;
    setAvailable(false);
    setStored('');
    setValue('');
    setRequested(false);
  }, [open, accountId, capable]);

  // Read once per opening, and only for a Bank account: a Cash account never shows the field. Toggling
  // the pending Type afterwards does not re-read, so a typed value survives it.
  useEffect(() => {
    if (!open || !accountId || !capable || !active || requested) return;
    setRequested(true);
    const requestId = ++requestRef.current;
    fetchCreditorIdInfo(apiFetch, ACTION_BASE_ABSOLUTE, { recordId: NEW_RECORD_SEGMENT, accountId })
      .then((info) => {
        if (requestId !== requestRef.current) return;
        const saved = info.accountCreditorId ?? '';
        setStored(saved);
        setValue(saved);
        setAvailable(true);
      })
      .catch(() => { /* not eligible or unreadable: the section stays hidden */ });
  }, [apiFetch, open, accountId, capable, active, requested]);

  const live = active && available;
  const normalized = normalizeCreditorId(value);
  const changed = live && normalized !== normalizeCreditorId(stored);
  const cleared = changed && normalized === '';
  const formatErrorKey = live ? creditorIdErrorKey(value) : null;
  const errorKey = cleared ? CREDITOR_ID_CLEARED_KEY : formatErrorKey;

  /** Saves the typed identifier on the account. Throws the backend's refusal with a translated `creditorIdMessage`. */
  const save = useCallback(async () => {
    let result;
    try {
      result = await saveCreditorId(apiFetch, ACTION_BASE_ABSOLUTE, {
        recordId: NEW_RECORD_SEGMENT, accountId, creditorId: normalized, saveToAccount: true,
      });
    } catch (err) {
      throw Object.assign(err, { creditorIdMessage: creditorIdSaveErrorMessage(err, ui) });
    }
    const saved = result.accountCreditorId ?? normalized;
    setStored(saved);
    setValue(saved);
    notifyCreditorIdSaved(accountId);
  }, [apiFetch, accountId, normalized, ui]);

  return {
    available,
    visible: live,
    value,
    setValue,
    errorKey,
    /** Something to persist: a non-empty value that differs from the saved one. */
    dirty: changed && !cleared,
    /** Makes the form unsavable: an invalid format, or a saved value that was emptied. */
    blocked: changed && Boolean(errorKey),
    save,
  };
}
