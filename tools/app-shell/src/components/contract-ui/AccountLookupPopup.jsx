import { SearchPopup } from './SearchPopup.jsx';
import { useAccountSelectorPages } from './useAccountSelectorPages.js';

/**
 * AccountLookupPopup — the `account` entry of the lookup drawer registry (`lookupDrawers.js`):
 * a lookup field declared with `"lookupDrawer": "account"` opens the shared `SearchPopup` over
 * the field's server selector instead of the product search drawer.
 *
 * ETP-5681: the G/L journal line Account column. The product drawer it used before was built for
 * products (images, prices, stock) and cut long account names off; this popup is the one the
 * report filters already use for "Desde la cuenta" and shows each `"code - name"` in full.
 *
 * Same props contract as every registry drawer. `onSelect` receives the raw selector item, so the
 * caller keeps reading `_identifier` / `_aux` from it as it does for the product drawer.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(item: object) => void} props.onSelect
 * @param {string} props.selectorUrl — the field's NEO selector endpoint
 * @param {object} [props.selectorContext] — extra query params (parent context) for every request
 * @param {string} [props.title]
 */
export default function AccountLookupPopup({ open, onClose, onSelect, selectorUrl, selectorContext, title }) {
  const loadPage = useAccountSelectorPages(selectorUrl, selectorContext);

  return (
    <SearchPopup
      open={open}
      onClose={onClose}
      onSelect={onSelect}
      loadPage={loadPage}
      title={title}
      data-testid="account-lookup-popup"
    />
  );
}
