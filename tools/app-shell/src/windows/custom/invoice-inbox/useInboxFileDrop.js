import { useCallback, useRef, useState } from 'react';

/** Whether a drag carries files (not text or a link dragged from the page). */
export function dragHasFiles(event) {
  return Array.from(event?.dataTransfer?.types ?? []).includes('Files');
}

/**
 * ETP-6049 — drag-and-drop of files over the whole inbox. Returns the props to spread on the
 * drop container and whether the "drop to upload" overlay must show.
 *
 * Child elements fire their own dragenter/dragleave, so a depth counter (not the last event)
 * decides when the drag really left the container; without it the overlay flickers.
 *
 * @param {(files: File[]) => void} onFiles
 */
export function useInboxFileDrop(onFiles) {
  const [dragging, setDragging] = useState(false);
  const depthRef = useRef(0);

  const onDragEnter = useCallback((event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    depthRef.current += 1;
    setDragging(true);
  }, []);

  const onDragOver = useCallback((event) => {
    if (!dragHasFiles(event)) return;
    // Required, or the browser opens the file instead of dropping it here.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((event) => {
    if (!dragHasFiles(event)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback((event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    depthRef.current = 0;
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files ?? []));
  }, [onFiles]);

  return { dragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
