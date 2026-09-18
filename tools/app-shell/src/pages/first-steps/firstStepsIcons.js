import {
  AddressBookIcon,
  BankIcon,
  BuildingIcon,
  InvoiceIcon,
  PackageIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';

/**
 * ETP-5190 — `iconName` → Phosphor component, for the step rows.
 *
 * Separate from `firstStepsConfig.js` so that the catalogue itself stays icon-free: `SideMenu`
 * and `DashboardPage` both read the catalogue and neither draws a row, so an icon import there
 * would land in their bundles (and in every suite that mocks `@phosphor-icons/react` with only
 * the handful of icons it actually uses).
 *
 * A step whose `iconName` is missing here renders no icon rather than crashing the page.
 *
 * The KEYS are deliberately the bare names, not the library's: they are what `iconName` holds in
 * `firstStepsConfig.js`, so they are our own identifiers and this map is the single place the
 * library's naming is allowed to leak in. Phosphor 2.1.6 carries an `@deprecated Use <name>Icon`
 * tag on every bare export, which is why the imports above use the `*Icon` suffix; renaming the
 * keys to match would push a library rename into the catalogue, into the tests that assert
 * `iconName`, and into any future config, for no benefit.
 */
export const FIRST_STEPS_ICONS = {
  AddressBook: AddressBookIcon,
  Bank: BankIcon,
  Building: BuildingIcon,
  Invoice: InvoiceIcon,
  Package: PackageIcon,
  User: UserIcon,
  UserPlus: UserPlusIcon,
};

export default FIRST_STEPS_ICONS;
