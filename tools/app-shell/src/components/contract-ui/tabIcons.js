import { List, Shield, Users, Landmark, MapPin, ReceiptText } from 'lucide-react';
import { AttachmentIcon } from '@/components/attachments/AttachmentIcon';
import { PricingIcon, WarehouseProductsIcon } from '@/components/ui/custom-icons';

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
  'custom:attachments': AttachmentIcon,
  'custom:sif': Shield,
  'custom:pricing': PricingIcon,
  'products': WarehouseProductsIcon,
  // Business-partner tabs (Contacts window, ETP-5600 Figma).
  'contact': Users,
  'bankAccount': Landmark,
  'locationAddress': MapPin,
  'customerAccounting': ReceiptText,
  'vendorAccounting': ReceiptText,
};

/** Icon component for a tab key, or the generic `List` icon when the key has none. */
export function resolveTabIcon(tabKey) {
  return TAB_ICONS[tabKey] ?? List;
}
