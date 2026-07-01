import React, { useState, useCallback } from 'react';
import FmListPage from './FmListPage';
import FmModel303Page from './models/303/FmModel303Page';
import FmModel349Page from './models/349/FmModel349Page';
import FmDebugPanel from './FmDebugPanel.jsx';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';

export default function FiscalModelsPage({ token, apiBaseUrl }) {
  const [view, setView] = useState({ type: 'list' });
  const debugMode = useDebugMode();

  const handleSelect = useCallback((decl) => {
    setView({ type: decl.model, decl });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  const handleComputeUpdate = useCallback((computedMap349) => {
    setView(v => {
      if (v.type !== '349') return v;
      const updated = computedMap349[v.decl.id];
      if (!updated) return v;
      return { ...v, decl: { ...v.decl, _precomputed: updated } };
    });
  }, []);

  const inDetail = view.type === '303' || view.type === '349';

  return (
    <>
      {/* FmListPage stays mounted at all times so useFiscalAutoCompute keeps polling */}
      <div style={inDetail ? { display: 'none' } : undefined}>
        <FmListPage
          onSelect={handleSelect}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onComputeUpdate={handleComputeUpdate}
          data-testid="FmListPage__ca1112" />
      </div>
      {view.type === '303' && (
        <FmModel303Page
          decl={view.decl}
          onBack={handleBack}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onStatusChange={(id, newStatus) => {
            setView(v => v.type === '303' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
          }}
          data-testid="FmModel303Page__ca1112" />
      )}
      {view.type === '349' && (
        <FmModel349Page
          decl={view.decl}
          onBack={handleBack}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onStatusChange={(id, newStatus) => {
            setView(v => v.type === '349' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
          }}
          data-testid="FmModel349Page__ca1112" />
      )}
      {debugMode && <FmDebugPanel view={view} setView={setView} data-testid="FmDebugPanel__ca1112" />}
    </>
  );
}
