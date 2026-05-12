import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/purchase-invoice/RelatedDocuments.jsx';
import SifDataTabs from './SifDataTabs';

/* eslint-disable react/prop-types */

/**
 * Purchase Invoice bottom section. Delegates to the shared LinesBottomSection
 * so the Docs/Notes/Totals layout stays identical to the rest of the
 * inline-editable family; injects the purchase-invoice-specific RelatedDocuments
 * and the SIF (fiscal) data tabs as the `notesExtra` slot beneath the notes block.
 */
export default function PurchaseInvoiceBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
      notesExtra={SifDataTabs}
    />
  );
}

function PurchaseInvoiceLinesEmptyState({ data, onAddLine, canAddLine = true }) {
  const ui = useUI();
  const isDraft = data?.documentStatus === 'DR';

  if (!isDraft) return null;

  return (
    <div style={{
      margin: '24px 16px',
      padding: '32px 24px',
      background: 'var(--color-background-secondary)',
      borderRadius: 'var(--border-radius-lg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 'var(--border-radius-md)',
        background: 'var(--color-background-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>
        {ui('noLinesYet')}
      </span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {ui('addLinesManually')}
      </span>
      {canAddLine && (
        <button
          type="button"
          onClick={onAddLine}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            background: '#18181b',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          + {ui('addLines')}
        </button>
      )}
    </div>
  );
}

PurchaseInvoiceBottomPanel.linesEmptyState = PurchaseInvoiceLinesEmptyState;
