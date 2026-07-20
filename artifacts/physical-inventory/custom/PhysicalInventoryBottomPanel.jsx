import { forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { LinesBottomSection, LinesEmptyState } from '@/components/contract-ui';
import GenerateLinesModal from './GenerateLinesModal';

export default function PhysicalInventoryBottomPanel(props) {
  return <LinesBottomSection {...props} showTotals={false} />;
}
PhysicalInventoryBottomPanel.showLineTotals = false;

/**
 * Empty-state for physical inventory lines. Reuses the generic LinesEmptyState
 * (primary "+ Add line" button wired to DetailView's onAddLine) and adds a
 * secondary "Generate lines automatically" action next to it, which opens
 * GenerateLinesModal. This instance owns its own modal state — independent
 * of the dropdown-menu path below (mirrors the sales-invoice two-instance
 * pattern, no shared ref needed).
 *
 * On a NEW (unsaved) inventory there is no recordId yet, so `onGenerateClick`
 * saves the header first via `onSave` (mirrors InvoiceLinesEmptyState) — DetailView's
 * onSave, for a new record, saves + navigates to `/physical-inventory/{id}` and
 * returns false, aborting this click; the `forceOpen` effect below then reopens
 * the modal automatically once the remount lands on the saved record.
 */
function PhysicalInventoryLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh }) {
  const ui = useUI();
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setShowGenerateModal(true);
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const handleGenerateClick = async () => {
    if (onSave) {
      const ok = await onSave('generateLines');
      if (!ok) return;
    }
    setShowGenerateModal(true);
  };

  const secondaryAction = (
    <button
      type="button"
      data-testid="action-generate-lines-automatically"
      onClick={handleGenerateClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        border: '0.5px solid #888',
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-text-secondary)',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {ui('generateLinesAutomatically')}
    </button>
  );

  return (
    <>
      <LinesEmptyState
        data={data}
        onAddLine={onAddLine}
        canAddLine={canAddLine}
        description={ui('addLinesManuallyOrGenerateAutomatically')}
        secondaryAction={secondaryAction}
        margin="0"
        padding="16px"
      />
      {showGenerateModal && (
        <GenerateLinesModal
          recordId={data?.id || recordId}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onClose={() => setShowGenerateModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

PhysicalInventoryBottomPanel.linesEmptyState = PhysicalInventoryLinesEmptyState;

/**
 * forwardRef host for the "+ Add line" dropdown item, shown once lines
 * already exist (STATE B). Renders nothing visible (hideTrigger is always
 * true from this seam) — it exists only to host GenerateLinesModal so the
 * dropdown item can open it via useImperativeHandle. See
 * PhysicalInventoryBottomPanel.lineMenuActions below and the analogous
 * InvoiceBottomPanel.detailExtraActions / lineMenuActions pattern.
 */
const GenerateLinesActions = forwardRef(function GenerateLinesActions(
  { recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh },
  ref,
) {
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setShowGenerateModal(true);
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const openGenerateLinesModal = async () => {
    if (onSave) {
      const ok = await onSave('generateLines');
      if (!ok) return;
    }
    setShowGenerateModal(true);
  };

  useImperativeHandle(ref, () => ({
    openGenerateLinesModal,
  }), [onSave]);

  if (!showGenerateModal) return null;

  return (
    <GenerateLinesModal
      recordId={recordId}
      apiBaseUrl={apiBaseUrl}
      token={token}
      onClose={() => setShowGenerateModal(false)}
      onRefresh={onRefresh}
    />
  );
});

PhysicalInventoryBottomPanel.detailExtraActions = GenerateLinesActions;

/**
 * Plain function (not a hook) — mirrors InvoiceBottomPanel.lineMenuActions.
 * `importRef` points at the GenerateLinesActions instance mounted by
 * DetailView with hideTrigger, which exposes openGenerateLinesModal via
 * useImperativeHandle.
 */
PhysicalInventoryBottomPanel.lineMenuActions = function lineMenuActions({ importRef }) {
  return [
    {
      key: 'generate-lines',
      label: 'generateLinesAutomatically',
      onClick: () => importRef.current?.openGenerateLinesModal?.(),
    },
  ];
};
