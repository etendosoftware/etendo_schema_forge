import { useState, useRef, useCallback } from 'react';
import { useUI } from '@/i18n';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';
import LocationEditorModal from '../../windows/custom/shared/LocationEditorModal.jsx';

/**
 * PartnerAddressPicker — address selector for C_BPartner_Location_ID fields.
 *
 * Thin wrapper around CreatableSearchSelect that wires the "Add address" inline
 * action to LocationEditorModal. Selecting a contact auto-loads its addresses;
 * clicking "+ Add address" opens the same Location modal used in the Contacts
 * window. After save, the new address is auto-selected in the dropdown.
 *
 * The contacts API base URL is derived from apiBaseUrl by replacing the last
 * path segment with "/contacts" (same transform used by useCreateContactModal).
 *
 * This component is registered in EntityForm for all dependent fields whose
 * column is C_BPartner_Location_ID. To use it in a new window, simply ensure
 * the field in decisions.json has:
 *   - type: dependent  (or inputMode: dependent)
 *   - column: C_BPartner_Location_ID
 *   - dependsOn: { field: "businessPartner", filterKey: "C_BPartner_ID" }
 * No further configuration is required.
 *
 * Props — forwarded from EntityForm, same shape as other field components:
 * @param {object}   field          - Field definition (dependsOn, column, required…)
 * @param {string}   value          - Current selected C_BPartner_Location_ID
 * @param {string}   displayValue   - Human-readable label for the current value
 * @param {Function} onChange       - (id, label, opt?) => void
 * @param {object}   formData       - Full form data (to read businessPartner value)
 * @param {string}   resolvedLabel  - Translated field label
 * @param {string}   selectorUrl    - Selector endpoint (built by EntityForm)
 * @param {object}   selectorContext - Extra query params
 * @param {string}   token          - JWT bearer token
 * @param {string}   apiBaseUrl     - Window API base, e.g. /sws/neo/sales-invoice
 */
export function PartnerAddressPicker({
  field,
  value,
  displayValue,
  onChange,
  formData,
  resolvedLabel,
  selectorUrl,
  selectorContext,
  token,
  apiBaseUrl,
}) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  // Stores the onCreated callback supplied by CreatableSearchSelect so we can
  // call it once LocationEditorModal reports a successful save.
  const onCreatedRef = useRef(null);

  const parentKey = field.dependsOn?.field;
  const parentValue = formData?.[parentKey];
  const contactsApiBase = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/contacts') : null;

  const handleCreateRequest = useCallback((_query, onCreated) => {
    onCreatedRef.current = onCreated;
    setModalOpen(true);
  }, []);

  const handleSaved = useCallback((newId, newName) => {
    setModalOpen(false);
    if (onCreatedRef.current && newId) {
      onCreatedRef.current(newId, newName);
    }
    onCreatedRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    onCreatedRef.current = null;
  }, []);

  return (
    <>
      <CreatableSearchSelect
        field={field}
        value={parentValue ? value : ''}
        displayValue={parentValue ? displayValue : undefined}
        onChange={onChange}
        formData={formData}
        resolvedLabel={resolvedLabel}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        createLabel={ui('addAddress')}
        onCreateRequest={contactsApiBase && parentValue ? handleCreateRequest : undefined}
        data-testid={"CreatableSearchSelect__" + field.id} />
      <LocationEditorModal
        open={modalOpen}
        onClose={handleClose}
        onSaved={handleSaved}
        rowId={null}
        bpId={parentValue}
        apiBase={contactsApiBase}
        token={token}
        selectorContext={selectorContext}
        data-testid={"LocationEditorModal__" + field.id} />
    </>
  );
}
