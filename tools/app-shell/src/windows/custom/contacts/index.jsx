import './contacts.css';
import './contactsFkResolvers.js';
import './contactsImportDescriptor.js';
import './recordVersionAliases.js';
import BusinessPartnerPage from '@generated/contacts/generated/web/contacts/BusinessPartnerPage';
import { ContactsProvider } from './ContactsContext';
import { ContactsFinanceProvider } from './ContactsFinanceContext';
import ContactsBusinessPartnerForm from './ContactsBusinessPartnerForm';
import ContactsSummaryWidget from './ContactsSummaryWidget';
import { useUI } from '@/i18n';
import { useChromelessEmbed } from '@/lib/embeddedWindow.js';
import { useSupportSession } from '@/hooks/useSupportSession.js';
/* eslint-disable react/prop-types */

const CONTACTS_WRAPPER = 'flex-1 min-h-0 flex flex-col [&_tr[data-empty-state]]:hidden [&_button[role=checkbox]]:h-full contacts-rows';

/*
 * Read `./recordVersionAliases.js` (imported above for its side effect) before adding a tab that
 * WRITES the `C_BPartner` row through a second entity name — `customer`, `vendorCreditor` or
 * `employee` — or through `intrastatAdquisitions`. It declares which of this window's entity names
 * share one table so the optimistic-locking version cache keeps them in one bucket; without that
 * declaration the second save of a sitting goes out with a token the first already consumed
 * (ETP-5263).
 */

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
  // Support mode: the backend answers 403 to contact create/delete (ETP-5351); hide those entry points.
  const { isSupportMode } = useSupportSession();
  /*
   * ETP-5332 — this window is also mounted inside the "Nuevo contacto" create popup
   * (`RecordCreateModal` → `EmbeddedWindowRoute`). The balance/income/expense summary
   * (`headerContent`, which also hosts the period picker since ETP-5600) is analytics chrome
   * that only makes sense for a contact that already exists and has history. On a record being
   * created seconds ago it is guaranteed-empty noise, and inside a dialog it is noise that
   * costs scarce vertical space — ~45px plus the widget, several times what shrinking the field
   * controls could ever recover.
   *
   * `useChromelessEmbed` is the same signal DetailView already uses to drop the sidebar and the
   * window's own Cancel button in this exact situation, so this reuses that decision rather than
   * inventing a second notion of "am I in a popup". `/contacts` itself is unaffected.
   */
  const chromeless = useChromelessEmbed();

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
           // ETP-5758 — bulk delete is ListView's generic "Delete selected" action
           // (useBulkRowDelete): its confirm dialog stays open and read-only until the
           // batch settles, so the window no longer renders a delete of its own and must
           // not set `hideBulkDelete`. NOTE: this whole object REPLACES — not merges with — the
           // generated page's own `listViewOptions={{hidePrint,hideCounter,hideLink}}`
           // (same last-prop-wins JSX precedence SUBSET_FILTERS above relies on), so it must
           // keep repeating those flags — keep this in sync if BusinessPartnerPage's
           // generated defaults ever change.
           listViewOptions={{ hidePrint: true, hideCounter: true, hideLink: true, ...(isSupportMode && { hideBulkDelete: true }) }}
           hideCreate={isSupportMode}
           hideDeleteButton={isSupportMode}
           rowQuickActions={{ hideDeleteButton: isSupportMode }}
           // The import dialog creates contacts too; spread so the generated config survives outside support.
           {...(isSupportMode && { import: { enabled: false } })}
           enableSecondaryRowDelete={!isSupportMode}
           headerContent={chromeless ? undefined : renderContactsHeaderSummary}
           // ETP-5600: Save stays the primary (filled) button on existing contacts too.
           primarySave={true}
           noHeaderBorder={true}
           toolbarBorderBottom={true}
           toolbarPaddingX="px-2"
           newLabel={ui('newContact')}
           // ETP-5600 (Figma) — "Importar contactos" lives in the New split menu and opens the
           // window's own import dialog (`window.import`); ListView then drops the standalone
           // import icon, since the menu already offers it.
           newActions={[{ key: 'import', label: ui('importContacts'), opensImportDialog: true }]}
           listbarPaddingX="px-2"
           iconButtonHover="hover:bg-[hsl(var(--muted))]"
           tablePaddingX="px-2"
           selectionBarSize="default"
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
      </ContactsFinanceProvider>
    </ContactsProvider>
  );
}
