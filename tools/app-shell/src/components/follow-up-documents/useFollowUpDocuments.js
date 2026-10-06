import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { trackDocumentCreated } from '@/lib/observability/health-events.js';
import {
  FOLLOW_UP_GENERIC_ERROR_KEY,
  FOLLOW_UP_PROMPT_EVENT,
  buildFollowUpActionUrl,
  consumeFollowUpPrompt,
  followUpErrorMessage,
  mergeFollowUpInputValues,
  readConfiguredFollowUpEntries,
  readCreatedDocument,
  readFollowUpInputRequest,
  readFollowUpInputValue,
} from './followUpDocuments.js';

/**
 * ETP-5576 — state machine of the generic follow-up document flow.
 *
 *   closed ──open()──▶ choice ──create(key)──▶ (loading) ──201──▶ result ──close()──▶ closed
 *                        │                         ├──error──▶ choice (error shown inline)
 *                        │                         └──error with `input`──▶ choice + selector
 *                        │                                (no error; create(key) retries the POST
 *                        │                                 with the chosen value in the body)
 *                        └──close() (Cancel / X / Esc / backdrop)──▶ closed
 *
 * A session freezes the record it was opened with (`session.record`): the record is
 * re-fetched as soon as a document is created (its `followUp` annotation then says nothing
 * is pending), and the modal must not lose its options or its result when that happens.
 *
 * @param {object} params
 * @param {string} params.apiBaseUrl spec-scoped NEO base the window receives
 * @param {string} params.spec       source spec (e.g. 'sales-invoice')
 * @param {string} [params.entity='header'] source entity
 * @param {object|null} params.record current source record (carries `followUp`)
 * @param {Object<string, object>} params.options per-key presentation config (see FollowUpDocumentModal)
 * @param {(created: object) => void} [params.onCreated] called after a document is created
 *   (the window re-reads the record here so the annotation and related documents refresh)
 *
 * Input-required round-trip: when the POST fails with an `input` block
 * (readFollowUpInputRequest), the session keeps the request in `session.inputRequest`
 * (`{ key, options }`) and the values collected so far in `session.inputs`
 * (`{ forKey, values }` — `forKey` is the follow-up key whose action asked). `setInputValue`
 * records the user's choice; `create(forKey)` refuses to POST while the requested value is
 * missing and otherwise sends `inputs.values` as the body. A create for another follow-up
 * key starts from an empty body (the collected values belong to the action that asked), and
 * `releaseInput(selectedKey)` drops the request as soon as the user selects another follow-up.
 */
export function useFollowUpDocuments({ apiBaseUrl, spec, entity = 'header', record, options, onCreated }) {
  const ui = useUI();
  // Empty base ON PURPOSE (same as InvoiceTopbarExtra / ManageDocsLauncher): the action URL
  // is already absolute, and resolveApiUrl would otherwise prefix it a second time.
  const apiFetch = useApiFetch('');
  const [session, setSession] = useState(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // Synchronous double-submit guard: `session.loading` only disables the button after the
  // next render, a second click in between must not POST twice.
  const inFlightRef = useRef(false);

  const recordId = record?.id ?? null;
  const latest = useRef({ record, options, onCreated });
  latest.current = { record, options, onCreated };

  const entries = useMemo(() => readConfiguredFollowUpEntries(record, options), [record, options]);

  const open = useCallback((snapshot) => {
    const source = snapshot ?? latest.current.record;
    if (readConfiguredFollowUpEntries(source, latest.current.options).length === 0) return false;
    setSession({
      record: source, phase: 'choice', loading: false, error: null, created: [], inputRequest: null, inputs: null,
    });
    return true;
  }, []);

  // A session in flight cannot be closed: the document may already be committed and the
  // user would never see the link to it.
  const close = useCallback(() => {
    setSession(current => (current?.loading ? current : null));
  }, []);

  const setInputValue = useCallback((value) => {
    setSession((s) => {
      if (!s?.inputRequest || s.loading) return s;
      const values = { ...s.inputs?.values };
      if (value == null || value === '') delete values[s.inputRequest.key];
      else values[s.inputRequest.key] = String(value);
      return { ...s, inputs: { ...s.inputs, values } };
    });
  }, []);

  // Multi-option layout: the requested input belongs to `inputs.forKey`; once the user selects
  // another follow-up it no longer applies and is dropped (a later POST asks again if needed).
  const releaseInput = useCallback((selectedKey) => {
    setSession(s => (s?.inputs && s.inputs.forKey !== selectedKey ? { ...s, inputRequest: null, inputs: null } : s));
  }, []);

  const create = useCallback(async (key) => {
    const current = sessionRef.current;
    if (!current || current.loading || inFlightRef.current) return null;
    const entry = readConfiguredFollowUpEntries(current.record, latest.current.options).find(e => e.key === key);
    if (!entry) return null;
    const sameAction = current.inputs?.forKey === key;
    const values = sameAction ? current.inputs.values : {};
    // Guard for every way of submitting (primary button, Enter on a choice card, Enter in
    // the selector): the value the backend asked for must have been chosen.
    if (sameAction && current.inputRequest && !readFollowUpInputValue(values, current.inputRequest.key)) return null;
    inFlightRef.current = true;
    setSession(s => (s ? { ...s, loading: true, error: null } : s));
    try {
      const res = await apiFetch(
        buildFollowUpActionUrl({ apiBaseUrl, spec, entity, recordId: current.record.id, action: entry.action }),
        { method: 'POST', body: JSON.stringify(values) },
      );
      const body = await res.json().catch(() => null);
      const doc = res.ok ? readCreatedDocument(body) : null;
      const inputRequest = res.ok ? null : readFollowUpInputRequest(body);
      if (inputRequest) {
        // Not an error: the modal stays open and asks for the value (see FollowUpDocumentModal).
        setSession(s => (s ? {
          ...s,
          loading: false,
          error: null,
          inputRequest,
          inputs: { forKey: key, values: mergeFollowUpInputValues(inputRequest, values) },
        } : s));
        return null;
      }
      if (!doc) {
        const message = res.ok ? (ui(FOLLOW_UP_GENERIC_ERROR_KEY) || FOLLOW_UP_GENERIC_ERROR_KEY) : followUpErrorMessage(body, ui);
        setSession(s => (s ? { ...s, loading: false, error: message } : s));
        return null;
      }
      const created = {
        key,
        id: doc.id,
        documentNo: doc.documentNo ?? '',
        spec: doc.spec ?? entry.targetSpec,
        entity: doc.entity ?? entry.targetEntity,
        lineCount: doc.lineCount ?? null,
        documentStatus: doc.documentStatus ?? 'DR',
      };
      setSession(s => (s ? { ...s, loading: false, phase: 'result', created: [created] } : s));
      if (created.spec) trackDocumentCreated(created.spec);
      // Same `<spec>:document-created` convention the order windows use, so a related
      // documents definition can list it as its `refreshEvent`.
      window.dispatchEvent(new CustomEvent(`${spec}:document-created`, {
        detail: { recordId: current.record.id, followUp: key, document: created },
      }));
      latest.current.onCreated?.(created);
      return created;
    } catch (err) {
      // apiFetch's NetworkError already carries a translated message (networkErrorRetry).
      const message = err?.message || ui(FOLLOW_UP_GENERIC_ERROR_KEY) || FOLLOW_UP_GENERIC_ERROR_KEY;
      setSession(s => (s ? { ...s, loading: false, error: message } : s));
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [apiFetch, apiBaseUrl, spec, entity, ui]);

  // Prompt hand-off from draftMode.afterProcess (see followUpDocuments.js): consume a prompt
  // queued before this component mounted, and listen for prompts queued while mounted.
  useEffect(() => {
    if (!spec || !recordId) return undefined;
    const queued = consumeFollowUpPrompt(spec, recordId);
    if (queued) open(queued);
    const handler = (event) => {
      if (event.detail?.spec !== spec || String(event.detail?.recordId) !== String(recordId)) return;
      const snapshot = consumeFollowUpPrompt(spec, recordId);
      if (snapshot) open(snapshot);
    };
    window.addEventListener(FOLLOW_UP_PROMPT_EVENT, handler);
    return () => window.removeEventListener(FOLLOW_UP_PROMPT_EVENT, handler);
  }, [spec, recordId, open]);

  // A session belongs to one record: navigating to another record closes it. A session
  // whose POST is still in flight is kept until it settles — `sessionLoading` is a
  // dependency so the check runs again then, and a session left over from a record the
  // user already navigated away from is closed at that point.
  const sessionLoading = Boolean(session?.loading);
  useEffect(() => {
    setSession(current => (current && current.record?.id !== recordId && !current.loading ? null : current));
  }, [recordId, sessionLoading]);

  return { entries, session, open, close, create, setInputValue, releaseInput };
}
