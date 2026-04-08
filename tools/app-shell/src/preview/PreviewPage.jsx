import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

import * as mockDataModule from '@generated/sales-order/custom/mockData.js';

const COMPONENT_NAMES = ['OrderPage', 'OrderTable', 'OrderForm', 'OrderLineTable'];

async function fetchSource(name) {
  const resp = await fetch(`/api/source/sales-order/${name}.jsx`);
  if (!resp.ok) return `// Failed to load ${name}`;
  return resp.text();
}

/**
 * Strip ES module imports and convert exports so the code can run
 * inside a plain script context (Babel standalone in the iframe).
 */
function prepareCodeForIframe(source) {
  return source
    .split('\n')
    .filter((line) => !line.match(/^\s*import\s+.*\s+from\s+['"]/))
    .join('\n')
    .replace(
      /export\s+default\s+function\s+(\w+)\s*\(/g,
      'exports.default = function $1(',
    )
    .replace(/\bexport\s+/g, '');
}

function buildPreviewCode(sources) {
  return sources.map(prepareCodeForIframe).join('\n\n');
}

export default function PreviewPage() {
  const [activeComponent, setActiveComponent] = useState('OrderPage');
  const [sources, setSources] = useState({});
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => {
    Promise.all(
      COMPONENT_NAMES.map(async (name) => [name, await fetchSource(name)]),
    ).then((entries) => {
      setSources(Object.fromEntries(entries));
      setLoading(false);
    });
  }, []);

  const sendToIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframeReady || !sources[activeComponent]) return;

    const code = buildPreviewCode([sources[activeComponent]]);

    iframe.contentWindow.postMessage(
      {
        type: 'preview-render',
        code,
        mockData: JSON.parse(JSON.stringify(mockDataModule)),
      },
      '*',
    );
  }, [activeComponent, iframeReady, sources]);

  useEffect(() => {
    sendToIframe();
  }, [sendToIframe]);

  const handleIframeLoad = useCallback(() => {
    setIframeReady(true);
  }, []);

  useEffect(() => {
    if (iframeReady) sendToIframe();
  }, [iframeReady, sendToIframe]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading preview sources...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b bg-background">
        {COMPONENT_NAMES.map((name) => (
          <Button
            key={name}
            variant={activeComponent === name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveComponent(name)}
          >
            {name}
          </Button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={sendToIframe}>
          Refresh
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        src="/preview.html"
        sandbox="allow-scripts"
        title="Component Preview"
        className="flex-1 w-full border-0"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
