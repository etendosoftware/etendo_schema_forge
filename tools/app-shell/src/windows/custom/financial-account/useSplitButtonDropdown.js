import { useEffect, useRef, useState } from 'react';

/**
 * Open-state wiring for the toolbar split buttons (Movements "Nuevo movimiento"
 * and Statements "Importar extracto"). Tracks `open`, exposes a `ref` for the
 * menu container, and closes on outside click / Escape while open.
 *
 * Shared by MovementsToolbar and StatementsToolbar so the dismiss logic lives in
 * one place instead of being duplicated in each toolbar.
 *
 * @returns {{ open: boolean, setOpen: (v: boolean | ((o: boolean) => boolean)) => void, ref: import('react').RefObject<HTMLElement> }}
 */
export function useSplitButtonDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}
