import { cn } from '@/lib/utils';

/* eslint-disable react/prop-types */

/**
 * Minimum width of a gallery card, in px (ETP-5516).
 *
 * Taken from the Figma "Productos Vista Galería" frame (card 221.6 px wide, 5 per row at
 * 1280 px with the Navigation Rail collapsed), rounded down so those 5 still fit at that
 * reference width. Pending final confirmation from UX — change it here and every gallery
 * follows.
 */
export const GALLERY_CARD_MIN_WIDTH_PX = 220;

/**
 * Track definition shared by every card gallery: as many columns as fit the CONTAINER at
 * GALLERY_CARD_MIN_WIDTH_PX or wider, never a viewport breakpoint. When the container narrows
 * (rail expanded, smaller window) cards wrap to the next row instead of shrinking.
 * `auto-fill` (not `auto-fit`) keeps empty tracks, so a short row — e.g. a report category with
 * two reports — keeps the same card width as a full one. `min(..., 100%)` keeps a single column
 * from overflowing a container narrower than the minimum.
 */
export const GALLERY_GRID_TEMPLATE_COLUMNS =
  `repeat(auto-fill, minmax(min(${GALLERY_CARD_MIN_WIDTH_PX}px, 100%), 1fr))`;

/**
 * GalleryGrid — the width-driven grid container used by the Products and Reports galleries,
 * so their column logic cannot drift apart again.
 *
 * Props: `className` (extra classes, e.g. top padding), `children` (the cards). Any other prop
 * is forwarded to the div; `data-testid` defaults to `gallery-grid`.
 */
export default function GalleryGrid({ className, children, ...rest }) {
  return (
    <div
      data-testid="gallery-grid"
      {...rest}
      className={cn('grid gap-4', className)}
      style={{ gridTemplateColumns: GALLERY_GRID_TEMPLATE_COLUMNS }}
    >
      {children}
    </div>
  );
}
