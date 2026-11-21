/**
 * ETP-6155 — defaults handed to Phosphor's `IconContext` in `main.jsx`.
 * Regular weight everywhere (the navigation rail opts into Fill itself) and 24px for an icon
 * that sets no size of its own, the footprint it had before the migration from lucide.
 */
export const ICON_DEFAULTS = { weight: 'regular', size: 24 };
