import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { EMBEDDED_WINDOW_NAME } from '@/lib/embeddedWindow.js';

/**
 * Hosts a real application window inside a dialog, in a same-origin iframe.
 *
 * An iframe rather than a React subtree, for one hard reason: React Router refuses to nest
 * routers ("You cannot render a <Router> inside another <Router>"), and a window navigates —
 * on save, on delete, from several tabs. Mounted in-tree it would either be forbidden
 * outright or, without a router of its own, drive the HOST document away from under the
 * dialog. A separate document gets its own router, its own providers and its own session
 * (same origin, so cookies and storage are shared), and its navigation cannot escape.
 *
 * The frame is loaded with `?embedded=interactive`, which AppLayout honours by dropping the
 * sidebar, topbar, command palette and widgets while leaving the window usable — unlike the
 * plain `embedded=1` preview, which also disables pointer events.
 *
 * Creation is detected by watching the frame's own location: the window navigates from
 * `/<spec>/new` to `/<spec>/<id>` when it saves, which is the same signal a nested router
 * would have given, read through a same-origin handle instead.
 */
export default function EmbeddedWindowFrame({ src, windowName, title, onRecordId, height = 520 }) {
  const frameRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  // A whole application window takes a visible moment to boot. Without this the dialog
  // opens onto an empty rectangle, which reads as broken rather than as loading.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pattern = new RegExp(`/${windowName}/([^/?#]+)`);
    const read = () => {
      const frame = frameRef.current;
      if (!frame) return;
      let pathname;
      try {
        pathname = frame.contentWindow?.location?.pathname;
      } catch {
        // Cross-origin would mean the frame navigated somewhere unexpected; stop reporting
        // rather than throwing on every tick.
        setBlocked(true);
        return;
      }
      const id = pattern.exec(pathname || '')?.[1];
      if (id && id !== 'new') onRecordId(id);
    };
    // Polling rather than a `load` listener: the window navigates within the same document
    // (client-side routing), so no further load events fire after the first.
    const timer = setInterval(read, 400);
    return () => clearInterval(timer);
  }, [windowName, onRecordId]);

  return (
    <>
      {!ready && (
        <div
          className="flex w-full items-center justify-center rounded-lg border border-border bg-background"
          style={{ height }}
          data-testid="embedded-window-loading"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <iframe
        ref={frameRef}
        onLoad={() => setReady(true)}
        hidden={!ready}
        src={src}
        name={EMBEDDED_WINDOW_NAME}
        title={title}
        data-testid="embedded-window-frame"
        className="w-full rounded-lg border border-border bg-background"
        style={{ height }}
      />
      {blocked && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="embedded-window-blocked">
          {title}
        </p>
      )}
    </>
  );
}
