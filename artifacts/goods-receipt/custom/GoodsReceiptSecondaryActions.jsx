import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';
import CloneButton from '@/windows/custom/shared/CloneButton.jsx';
import { CloneReceiptModal } from '@generated/goods-receipt/custom/GoodsReceiptActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to goods-receipt (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/goods-receipt/index.jsx`, this
 * renders Copy link -> Clone to the LEFT of Save/Confirm — see the classification
 * comment near `DetailView.jsx`'s `topbarSecondary`/`topbarRight` render for the
 * primary/secondary split rationale.
 *
 * Clone is NOT delegated to `DocumentSecondaryActions`' built-in `clone` config
 * (`clone={false}` here): goods-receipt clones through its own bespoke
 * `CloneReceiptModal` (fetches receipt lines, then POSTs cloneRecord — a
 * different shape than the generic `CloneOrderModal`), so the Clone
 * button/modal are rendered here via the `children` extension point instead,
 * matching `GoodsReceiptActions`' pre-ETP-5260 inline behaviour exactly.
 *
 * No Send button — this window never had one in `GoodsReceiptActions`.
 *
 * goods-receipt is the "worst case" from the ETP-5260 plan: primaries
 * ("Crear devolución", "Crear factura") and secondaries used to be
 * INTERCALATED in `GoodsReceiptActions`. Both primaries stay there, unaffected
 * by this migration.
 */
export default function GoodsReceiptSecondaryActions(props) {
  const { recordId, data, apiBaseUrl, token } = props;
  const ui = useUI();
  const navigate = useNavigate();
  const [showClone, setShowClone] = useState(false);

  const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="goods-receipt"
      clone={false}
      data-testid="GoodsReceiptSecondaryActions">
      <CloneButton
        onClick={() => setShowClone(true)}
        title={ui('cloneOrderBtn')}
        data-testid="GoodsReceiptSecondaryActions__clone" />
      {showClone && createPortal(
        <CloneReceiptModal
          receiptId={recordId}
          data={data}
          base={base}
          headers={headers}
          onClose={() => setShowClone(false)}
          onCloned={(newId) => { setShowClone(false); navigate(`/goods-receipt/${newId}`); }}
          data-testid="CloneReceiptModal__GoodsReceiptSecondaryActions" />,
        document.body,
      )}
    </DocumentSecondaryActions>
  );
}
