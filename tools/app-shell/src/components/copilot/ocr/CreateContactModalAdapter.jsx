import { useMemo } from 'react';
import CreateContactModal from '../../contract-ui/CreateContactModal.jsx';
import { deriveContactsApiBase } from './contactApi.js';

/* eslint-disable react/prop-types */

// Bridges the OCR EntityField create-popup contract
// ({ item, apiBaseUrl, token, onCancel, onSubmit }) to the header
// CreateContactModal API. The modal creates the BP up-front and returns
// { id, name }, which EntityField forwards as a resolved entity selection.
export default function CreateContactModalAdapter({ item, apiBaseUrl, token, onCancel, onSubmit }) {
  const bpApiBaseUrl = useMemo(() => deriveContactsApiBase(apiBaseUrl), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);
  const prefilled = item?.payload?.prefilled || {};
  const initialQuery = prefilled.name || '';
  return (
    <CreateContactModal
      bpApiBaseUrl={bpApiBaseUrl}
      headers={headers}
      initialQuery={initialQuery}
      documentType={item?.payload?.documentType || null}
      onClose={onCancel}
      onCreated={(record) => onSubmit({ created: record })}
      data-testid="CreateContactModal__fc9c1d" />
  );
}
