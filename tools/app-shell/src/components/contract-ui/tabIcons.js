import {
  ListBulletsIcon,
  ShieldIcon,
  UsersIcon,
  BankIcon,
  MapPinIcon,
  ReceiptIcon,
  ArrowsLeftRightIcon,
  PaperclipIcon,
  CoinsIcon,
  PackageIcon,
} from '@phosphor-icons/react';

/**
 * Icon shown before the label of a secondary tab in DetailView's bottom tab strip, keyed by the
 * tab key (`secondaryTabs[].key`, or `custom:<key>` for `customTabs`). Any key not listed here
 * falls back to the generic `List` icon.
 *
 * Lives outside DetailView.jsx because that component is under a committed no-growth guardrail
 * (.claude/hooks/check-detailview-growth.mjs). The map is keyed by tab key, not by window, so
 * every window whose tab shares one of these keys gets the same icon.
 */
export const TAB_ICONS = {
  'custom:attachments': PaperclipIcon,
  'custom:sif': ShieldIcon,
  'custom:pricing': CoinsIcon,
  // Product's Movements tab (ETP-5889). The same two arrows the financial account's Movements tab uses.
  'custom:movements': ArrowsLeftRightIcon,
  'products': PackageIcon,
  // Business-partner tabs (Contacts window, ETP-5600 Figma).
  'contact': UsersIcon,
  'bankAccount': BankIcon,
  'locationAddress': MapPinIcon,
  'customerAccounting': ReceiptIcon,
  'vendorAccounting': ReceiptIcon,
};

/**
 * Icon component for a tab: the tab's own `icon` when it carries one, else the icon of its key,
 * else the generic `List` icon.
 *
 * `icon` (ETP-5791) is opt-in per tab object. Today only the `customLines` tab sets it, from the
 * static `tabIcon` of the window's `CustomLines` component (see buildInitialTabs in
 * detailViewHelpers.jsx): that tab's key is the same in every window, so keying the map on it
 * would change the icon of every window with a custom lines tab. A tab without `icon` resolves
 * exactly as before.
 */
export function resolveTabIcon(tabKey, icon = null) {
  return icon ?? TAB_ICONS[tabKey] ?? ListBulletsIcon;
}
