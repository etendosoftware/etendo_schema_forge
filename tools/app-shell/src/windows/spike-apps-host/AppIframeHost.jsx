import React, { useEffect, useState } from 'react';
import { writeHeaders } from '../../lib/sessionHeaders.js';

function resolveAppTokenUrl(appId) {
  const envBase = import.meta.env.VITE_API_BASE;
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  const apiBase = envBase || (webIdx === -1 ? '' : path.substring(0, webIdx));
  return `${apiBase}/sws/apps/token?appId=${encodeURIComponent(appId)}`;
}

// ETP-4576 — no `etendoToken` parameter any more. The POST that mints the app's
// iframe JWT is authenticated by the ACTIVE SESSION, whatever scheme carries it,
// so threading a token here only offered a value the cookie scheme never holds.
async function fetchAppToken(appId) {
  const res = await fetch(resolveAppTokenUrl(appId), {
    method: 'POST',
    credentials: 'include',
    headers: writeHeaders(),
  });
  if (!res.ok) throw new Error(`token endpoint failed: ${res.status}`);
  const body = await res.json();
  return body.token;
}

export default function AppIframeHost({ appUrl, appId }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // ETP-4576 — no `!token` gate. Under the cookie scheme the client holds no
    // token, so this refused to mint the app JWT at all and the iframe rendered
    // "Missing Etendo session token" for every user. Whether the session is valid
    // is the token endpoint's answer to give, not this component's to presume.
    (async () => {
      try {
        const appToken = await fetchAppToken(appId);
        const separator = appUrl.includes('?') ? '&' : '?';
        setSrc(`${appUrl}${separator}jwt=${encodeURIComponent(appToken)}`);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [appUrl, appId]);

  if (error) return <div className="p-8 text-destructive">App token error: {error}</div>;
  if (!src) return <div className="p-8 text-muted-foreground">Loading app…</div>;

  return (
    <iframe
      title={appId}
      src={src}
      sandbox="allow-scripts allow-same-origin allow-forms"
      className="w-full h-full border-0"
    />
  );
}
