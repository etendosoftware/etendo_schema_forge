import React from 'react';
import { normalizeBreadcrumb, BREADCRUMB_SEPARATOR } from '@/components/layout/TopBar/breadcrumb.js';

// ── In-page breadcrumb — 303/349 detail headers (ETP-5597) ──
// These pages draw their own header under the TopBar instead of publishing page meta, so their
// breadcrumb is rendered here — but from the SAME item model the TopBar breadcrumb uses
// (`normalizeBreadcrumb`, components/layout/TopBar/breadcrumb.js: a string or
// `{ label, href?, onClick? }` per level), so a level with an `onClick` is navigable exactly like
// the parent crumb of a generated window's detail ("Facturas de compra" → back to the list). These
// detail pages are a view state of FiscalModelsPage, not a route, so `onClick` (their own back
// handler) is the only navigation used here.
// Separators stay plain " / " text so the visible text is unchanged.
export function FmBreadcrumb({ items, style }) {
  const levels = normalizeBreadcrumb(items) ?? [];
  return (
    <div style={style} data-testid="fm-breadcrumb">
      {levels.map((item, i) => (
        <React.Fragment key={`${i}-${item.label}`}>
          {i > 0 && BREADCRUMB_SEPARATOR}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="fm-breadcrumb__link"
              data-testid={`fm-breadcrumb-level-${i}`}
            >
              {item.label}
            </button>
          ) : item.label}
        </React.Fragment>
      ))}
    </div>
  );
}
