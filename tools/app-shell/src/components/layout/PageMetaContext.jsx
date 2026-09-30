import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { breadcrumbKey } from './TopBar/breadcrumb.js';

const PageMetaContext = createContext(null);

export function PageMetaProvider({ children }) {
  const [meta, setMetaState] = useState({});
  const setMeta = useCallback((m) => setMetaState(m ?? {}), []);
  return (
    <PageMetaContext.Provider value={{ ...meta, setMeta }}>
      {children}
    </PageMetaContext.Provider>
  );
}

export function usePageMeta() {
  return useContext(PageMetaContext);
}

export function useSetPageMeta(meta, deps = []) {
  const ctx = useContext(PageMetaContext);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => {
    ctx?.setMeta(metaRef.current);
    return () => ctx?.setMeta({});
  // ETP-5504 — `breadcrumb` may be an array of levels (new reference every render); key it by
  // content so an unchanged breadcrumb does not re-publish the meta in a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.title, breadcrumbKey(meta?.breadcrumb), ...deps]);
}
