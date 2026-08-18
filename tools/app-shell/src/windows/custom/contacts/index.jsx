import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import './contacts.css';
import './contactsFkResolvers.js';
import './contactsImportDescriptor.js';
import BusinessPartnerPage from '@generated/contacts/generated/web/contacts/BusinessPartnerPage';
import { ContactsProvider } from './ContactsContext';
import { ContactsFinanceProvider } from './ContactsFinanceContext';
import { useContactsCacheInvalidation } from './contactsCacheInvalidation';
import ContactsBusinessPartnerForm from './ContactsBusinessPartnerForm';
import ContactsPeriodButton from './ContactsPeriodButton';
import ContactsSummaryWidget from './ContactsSummaryWidget';
import { useUI } from '@/i18n';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import { Trash2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { extractApiErrorMessage } from '@/lib/apiError';

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
  const [pendingBulkDelete, setPendingBulkDelete] = useState(null);
  const { invalidateBusinessPartner } = useContactsCacheInvalidation();

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!pendingBulkDelete) return;
    const { rows, clearSelection, onDataMutated, apiBaseUrl, token } = pendingBulkDelete;
    setPendingBulkDelete(null);

    // Sequential: stop on first error so no records are deleted if any would fail.
    for (const row of rows) {
      const res = await fetch(`${apiBaseUrl}/businessPartner/${row.id || row}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error(await extractApiErrorMessage(res));
        return;
      }
    }

    clearSelection();
    onDataMutated?.();
    invalidateBusinessPartner();
  }, [pendingBulkDelete, invalidateBusinessPartner]);

  const handleBulkDeleteCancel = useCallback(() => {
    setPendingBulkDelete(null);
  }, []);

  const selectionBarRightActions = useCallback(
    ({ selectedRows, clearSelection, token, apiBaseUrl, onDataMutated }) => (
      <>
        <button
          onClick={() => setPendingBulkDelete({ rows: selectedRows, clearSelection, onDataMutated, apiBaseUrl, token })}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-[hsl(var(--destructive) / 0.3)] bg-card shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[var(--status-destructive-bg)] transition-colors"
        >
          <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" data-testid="Trash2__ef097c" />
        </button>
        <button
          onClick={clearSelection}
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <X className="h-4 w-4 text-[hsl(var(--text-disabled))]" data-testid="X__ef097c" />
        </button>
      </>
    ),
    []
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
           // `selectionBarRightActions` below (trash + X buttons), so it must opt out of
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
