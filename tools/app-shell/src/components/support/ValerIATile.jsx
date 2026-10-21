import * as React from 'react';

/**
 * Official Etendo AI brand icon (ETP-5752, docs/visual-identity.md) — same
 * asset used by SideMenu's Navigation Rail and company switcher. The PNG
 * already carries its own lime background and square corners (160x160), so
 * the tile just clips it to `radius` and `object-fit: cover` keeps it
 * filling the requested `size` regardless of aspect.
 */
export function ValerIATile({ size = 32, radius = 8 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <img
        src="/logo-etendo-ai.png"
        alt="Etendo"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
