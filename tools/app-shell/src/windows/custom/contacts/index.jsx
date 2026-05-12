import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import './contacts.css';
import BusinessPartnerPage from '@generated/contacts/generated/web/contacts/BusinessPartnerPage';
import { ContactsProvider } from './ContactsContext';
import ContactsBusinessPartnerForm from './ContactsBusinessPartnerForm';
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

export default function ContactsWindow(props) {
  const ui = useUI();
  const [pendingBulkDelete, setPendingBulkDelete] = useState(null);

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
  }, [pendingBulkDelete]);

  const handleBulkDeleteCancel = useCallback(() => {
    setPendingBulkDelete(null);
  }, []);

  const selectionBarRightActions = useCallback(
    ({ selectedRows, clearSelection, token, apiBaseUrl, onDataMutated }) => (
      <>
        <button
          onClick={() => setPendingBulkDelete({ rows: selectedRows, clearSelection, onDataMutated, apiBaseUrl, token })}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-[#FBB1C4] bg-white shadow-[0px_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#FFF0F4] transition-colors"
        >
          <Trash2 className="h-4 w-4 text-[#F3164E]" />
        </button>
        <button
          onClick={clearSelection}
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[#F5F7F9] transition-colors"
        >
          <X className="h-4 w-4 text-[#828FA3]" />
        </button>
      </>
    ),
    []
  );

  return (
    <ContactsProvider>
      <div className={CONTACTS_WRAPPER}>
        <BusinessPartnerPage
          {...props}
          Form={ContactsBusinessPartnerForm}
          subsetFilters={SUBSET_FILTERS}
          autoSaveOnBlur={true}
          enableSecondaryRowDelete={true}
          sidebarClassName="w-[30%] shrink-0 overflow-y-auto border-l border-[#E8EAEF]"
          noHeaderBorder={true}
          toolbarBorderBottom={true}
          toolbarPaddingX="px-2"
          newLabel={ui('newContact')}
          listbarPaddingX="px-2"
          SortIconComponent={SortIcon}
          RefreshIconComponent={RefreshIcon}
          iconButtonHover="hover:bg-[#F5F7F9]"
          tablePaddingX="px-2"
          hoverRowActions={true}
          selectionBarSize="default"
          selectionBarRightActions={selectionBarRightActions}
          toolbarButtonSize="default"
          primaryTabsVariant="pill"
          tabsBarPaddingX="pl-2 pr-5"
          formScrollPaddingX="pl-0 pr-0"
          formScrollPaddingB="pb-2"
          secondaryTabContentPaddingT="pt-2"
          formCardPadding="pt-2 px-5 pb-2"
          secondaryTabsPaddingY="py-[14px]"
          secondaryTabsShowHoverLine={true}
          hideAddLineChevron={true}
          addLineButtonPaddingX="pl-2"
        />
      </div>

      <Dialog open={Boolean(pendingBulkDelete)} onOpenChange={(open) => { if (!open) handleBulkDeleteCancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {ui('deleteConfirmMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleBulkDeleteCancel}>
              {ui('cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDeleteConfirm}>
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContactsProvider>
  );
}
