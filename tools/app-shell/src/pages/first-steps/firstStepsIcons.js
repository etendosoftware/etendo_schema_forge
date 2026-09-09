import {
  AddressBook,
  Bank,
  Building,
  Invoice,
  Package,
  User,
  UserPlus,
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
 */
export const FIRST_STEPS_ICONS = {
  AddressBook,
  Bank,
  Building,
  Invoice,
  Package,
  User,
  UserPlus,
};

export default FIRST_STEPS_ICONS;
