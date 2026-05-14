import { useState, useRef, useCallback } from 'react';

export function useDraggable() {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startTop = rect.top;
    const startLeft = rect.left;

    const onMove = (ev) => {
      const maxLeft = window.innerWidth  - rect.width  - 4;
      const maxTop  = window.innerHeight - rect.height - 4;
      setPos({
        top:  Math.max(0, Math.min(maxTop,  startTop  + ev.clientY - startY)),
        left: Math.max(0, Math.min(maxLeft, startLeft + ev.clientX - startX)),
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
  }, []);

  const posStyle = pos ? { top: pos.top, left: pos.left, right: 'auto' } : {};

  return { panelRef, posStyle, handleMouseDown };
}
