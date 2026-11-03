import { useEffect, useRef, useState } from 'react';

const DEFAULT_MAX_HEIGHT = 560;

/**
 * ETP-5988 — A printable page shown at the size it has room for. The markup is laid out at the
 * page's own pixel size (A4: 794 x 1123 portrait, 1123 x 794 landscape) inside a sandboxed iframe (no
 * scripts) and scaled down to fit BOTH the available width and `maxHeight`, so there are no
 * scrollbars at low resolutions and the preview never makes the page tall. It never scales above 100 %
 * and is centered when the height, not the width, is what limits it.
 *
 * @param {{html: string, title: string, pageWidth: number, pageHeight: number, maxHeight?: number, testId?: string}} props
 */
export default function PrintablePreviewFrame({
  html, title, pageWidth, pageHeight, maxHeight = DEFAULT_MAX_HEIGHT, testId = 'PrintablePreviewFrame',
}) {
  const [scale, setScale] = useState(1);
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => setScale(Math.min(1, box.clientWidth / pageWidth, maxHeight / pageHeight) || 1);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [pageWidth, pageHeight, maxHeight]);

  return (
    <div ref={boxRef} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-md border bg-white"
        style={{ width: pageWidth * scale, height: pageHeight * scale }}
      >
        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          scrolling="no"
          style={{ width: pageWidth, height: pageHeight, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
