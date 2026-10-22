// Modelo 390 — loads the 303 preload (`GET /fiscal390/preload`) for the detail page (ETP-5716).
// `load(monthlyReturn)` fetches it (the on-screen ISMONTHLYRETURN decides where refunds go) and
// resolves the payload, or `null` on failure (the message is kept in `error`); the page decides
// when to apply it (preload390.applyPreload390).
import { useCallback, useRef, useState } from 'react';
import { fetchPreload390 } from './fm390Api.js';

export default function usePreload390({ decl, token, apiBaseUrl }) {
  const [preload, setPreload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Only the latest request may set the state (Calcular can start one while the mount's runs).
  const seq = useRef(0);

  const load = useCallback(async (monthlyReturn) => {
    if (!apiBaseUrl) return null;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPreload390(decl, { token, apiBaseUrl, monthlyReturn });
      if (mine === seq.current) setPreload(res);
      return res;
    } catch (err) {
      if (mine === seq.current) setError(err?.serverMessage || err?.message || 'error');
      return null;
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [decl, token, apiBaseUrl]);

  return { preload, loading, error, load };
}
