import { useState, useCallback } from 'react';
import './contacts.css';
import './contactsFkResolvers.js';
import './contactsImportDescriptor.js';
import BusinessPartnerPage from '@generated/contacts/generated/web/contacts/BusinessPartnerPage';
import { ContactsProvider } from './ContactsContext';
import { ContactsFinanceProvider } from './ContactsFinanceContext';
import ContactsBusinessPartnerForm from './ContactsBusinessPartnerForm';
import ContactsPeriodButton from './ContactsPeriodButton';
import ContactsSummaryWidget from './ContactsSummaryWidget';
import { useUI } from '@/i18n';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import { Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { extractErrorMessage } from '@/hooks/useEntity';
import { runBatchDelete, toastBatchDeleteOutcome } from '@/lib/batchDelete.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
/* eslint-disable react/prop-types */

const CONTACTS_WRAPPER = 'flex-1 min-h-0 flex flex-col [&_tr[data-empty-state]]:hidden [&_button[role=checkbox]]:h-full contacts-rows';

const isPerson = (r) => r.etgoIsperson === true || r.etgoIsperson === 'Y';

// Overrides the generated BusinessPartnerPage's subsetFilters (Todos/Clientes/Proveedores)
// with Todos/Personas/Empresas. Works because the generated page spreads {...props} after
// its hardcoded subsetFilters, so this value wins via JSX prop precedence (last wins).
// i18n-allowlist: ["all", "persons", "companies"]
const SUBSET_FILTERS = [
  { label: 'all' },
  { label: 'persons',  rowFilter: isPerson },
  { label: 'companies', rowFilter: (r) => !isPerson(r) },
];

function renderContactsHeaderSummary(data) {
  return <ContactsSummaryWidget data={data} data-testid="ContactsSummaryWidget__ef097c" />;
}

export default function ContactsWindow(props) {
  const ui = useUI();
  const apiFetch = useApiFetch(props.apiBaseUrl);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(null);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!pendingBulkDelete) return;
    const { rows, reselectFailed } = pendingBulkDelete;
    setPendingBulkDelete(null);

    // ETP-4656 (QA fix) — was a sequential loop that stopped on the first
    // error (never attempting the remaining rows) and toasted the raw,
    // untranslated backend error message. Now mirrors every other
    // bulk-delete consumer (see `useBulkRowDelete.jsx`): parallel deletes via
    // `runBatchDelete`, backend errors translated through
    // `extractErrorMessage` (FK-violation → `deleteBlockedByReferences`), and
    // exactly one Spanish 3-outcome toast via `toastBatchDeleteOutcome`.
    const { succeeded, failed } = await runBatchDelete(rows, (row) =>
      apiFetch(`/businessPartner/${row.id || row}`, {
        method: 'DELETE',
      }).then(async (res) => {
        if (!res.ok) throw new Error(await extractErrorMessage(res, ui));
        return row;
      })
    );

    toastBatchDeleteOutcome(ui, { succeeded, failed, total: rows.length });

    // Reselect only the failed rows (keeping them checked for retry) and
    // deselect the succeeded ones — same outcome handling the generic
    // "Delete selected" toolbar button gets for free via useBulkRowDelete.
    reselectFailed(succeeded, failed);
  }, [pendingBulkDelete, ui, apiFetch]);

  const handleBulkDeleteCancel = useCallback(() => {
    setPendingBulkDelete(null);
  }, []);

  // ETP-4972 — the standalone X (clear-selection) button was removed: the
  // floating SelectionToolbar now provides its own built-in close button, so
  // this one was a visually-broken duplicate (an old light-bar X next to the
  // new dark-pill one). The trash button is restyled for legibility on the
  // dark pill (was `bg-card` — a near-white chip, invisible against the
  // pill). Icon-only, no visible "Eliminar" label: the applied Figma
  // instance has this button's Button Text property set to false.
  const selectionBarRightActions = useCallback(
    ({ selectedRows, token, apiBaseUrl, reselectFailed }) => (
      <button
        onClick={() => setPendingBulkDelete({ rows: selectedRows, apiBaseUrl, token, reselectFailed })}
        title={ui('delete')}
        aria-label={ui('delete')}
        className="inline-flex items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__ef097c" />
      </button>
    ),
    [ui]
  );

  return (
    <ContactsProvider data-testid="ContactsProvider__ef097c">
      <ContactsFinanceProvider
        token={props.token}
        apiBaseUrl={props.apiBaseUrl}
        data-testid="ContactsFinanceProvider__ef097c">
       <div className={CONTACTS_WRAPPER}>
         <BusinessPartnerPage
           {...props}
           Form={ContactsBusinessPartnerForm}
           subsetFilters={SUBSET_FILTERS}
           // ETP-4656 — this window renders its own delete affordance via
           // `selectionBarRightActions` below (trash button; close is now
           // SelectionToolbar's own built-in X, ETP-4972), so it must opt out of
           // ListView's generic "Delete selected" toolbar action explicitly via
           // `hideBulkDelete` (no more implicit inference from selectionBarRightActions'
           // mere presence). NOTE: this whole object REPLACES — not merges with — the
           // generated page's own `listViewOptions={{hidePrint,hideCounter,hideLink}}`
           // (same last-prop-wins JSX precedence SUBSET_FILTERS above relies on), so it must
           // keep repeating those flags — keep this in sync if BusinessPartnerPage's
           // generated defaults ever change.
           listViewOptions={{ hidePrint: true, hideCounter: true, hideLink: true, hideBulkDelete: true }}
           enableSecondaryRowDelete={true}
           tabsBarAfter={ContactsPeriodButton}
           headerContent={renderContactsHeaderSummary}
           noHeaderBorder={true}
           toolbarBorderBottom={true}
           toolbarPaddingX="px-2"
           newLabel={ui('newContact')}
           listbarPaddingX="px-2"
           SortIconComponent={SortIcon}
           RefreshIconComponent={RefreshIcon}
           iconButtonHover="hover:bg-[hsl(var(--muted))]"
           tablePaddingX="px-2"
           selectionBarSize="default"
           selectionBarRightActions={selectionBarRightActions}
           toolbarButtonSize="default"
           primaryTabsVariant="pill"
           tabsBarPaddingX="pl-2 pr-2"
           formScrollPaddingX="pl-0 pr-0"
           formScrollPaddingB="pb-2"
           secondaryTabContentPaddingT="pt-2"
           formCardPadding="pt-2 px-5 pb-2"
           secondaryTabsPaddingY="py-[14px]"
           secondaryTabsShowHoverLine={true}
           hideAddLineChevron={true}
           addLineButtonPaddingX="pl-2"
           data-testid="BusinessPartnerPage__ef097c" />
       </div>
       <Dialog
         open={Boolean(pendingBulkDelete)}
         onOpenChange={(open) => { if (!open) handleBulkDeleteCancel(); }}
         data-testid="Dialog__ef097c">
         <DialogContent className="max-w-sm" data-testid="DialogContent__ef097c">
           <DialogHeader data-testid="DialogHeader__ef097c">
             <DialogTitle data-testid="DialogTitle__ef097c">{ui('deleteConfirmTitle')}</DialogTitle>
             <DialogDescription data-testid="DialogDescription__ef097c">
               {ui('deleteConfirmMessage')}
             </DialogDescription>
           </DialogHeader>
           <DialogFooter data-testid="DialogFooter__ef097c">
             <Button
               variant="outline"
               size="sm"
               onClick={handleBulkDeleteCancel}
               data-testid="Button__ef097c">
               {ui('cancel')}
             </Button>
             <Button
               variant="destructive"
               size="sm"
               onClick={handleBulkDeleteConfirm}
               data-testid="Button__ef097c">
               {ui('delete')}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
      </ContactsFinanceProvider>
    </ContactsProvider>
  );
}
