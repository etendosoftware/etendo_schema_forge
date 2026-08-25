import { useMemo } from 'react';
import CreateContactModal from '../../contract-ui/CreateContactModal.jsx';
import { deriveContactsApiBase } from './contactApi.js';
import { writeHeaders } from '@/lib/sessionHeaders.js';

/* eslint-disable react/prop-types */

// Bridges the OCR EntityField create-popup contract
// ({ item, apiBaseUrl, onCancel, onSubmit }) to the header
// CreateContactModal API. The modal creates the BP up-front and returns
// { id, name }, which EntityField forwards as a resolved entity selection.
export default function CreateContactModalAdapter({ item, apiBaseUrl, onCancel, onSubmit }) {
  const bpApiBaseUrl = useMemo(() => deriveContactsApiBase(apiBaseUrl), [apiBaseUrl]);
  // ETP-4576 — CreateContactModal takes one header bag for its reads and its
  // writes, so it gets the write builder: same shape as the `{ Authorization,
  // Content-Type }` it used to receive, with the session's proof in place of a
  // token the client no longer holds.
  const headers = useMemo(() => writeHeaders(), []);
  // `prefilled` is keyed by CreateContactModal form field id — the OCR doc type
  // declares the mapping in `createPrefilledFrom`, so everything the extraction
  // found for this contact (tax id, address, city, country, email, phone) is
  // forwarded, not just the name. ETP-4855 Error 1.
  const prefilled = item?.payload?.prefilled || {};
  const initialQuery = prefilled.name || '';
  return (
    <CreateContactModal
      bpApiBaseUrl={bpApiBaseUrl}
      headers={headers}
      prefill={prefilled}
      initialQuery={initialQuery}
      documentType={item?.payload?.documentType || null}
      onClose={onCancel}
      onCreated={(record) => onSubmit({ created: record })}
      data-testid="CreateContactModal__fc9c1d" />
  );
}
