import React, { useState, useCallback } from 'react';
import FmListPage from './FmListPage';
import FmModel303Page from './models/303/FmModel303Page';
import FmModel349Page from './models/349/FmModel349Page';
import FmDebugPanel from './FmDebugPanel.jsx';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';
import { persistDeclarationStatus } from './fiscalModelsUtils.js';

export default function FiscalModelsPage({ token, apiBaseUrl }) {
  const [view, setView] = useState({ type: 'list' });
  const debugMode = useDebugMode();
  // ETP-5338 CRITICAL FIX — see the long comment on `declStatusPatch` in FmListPage.jsx for
  // the full root-cause explanation. In short: FmListPage never remounts (and so never
  // refetches) when the user presents a declaration from the detail page and goes back, so a
  // status change made here must be pushed into FmListPage's own `decls` state explicitly —
  // it is otherwise invisible to it. A fresh object on every successful status change (not a
  // toggle/counter) so FmListPage's effect always re-fires, even for a repeat status.
  const [declStatusPatch, setDeclStatusPatch] = useState(null);
  // ETP-5338 Bug A fix — same mechanism, for a successful manualData save (Guardar/Calcular)
  // instead of a status change. Under the redesigned explicit-save-only model, "Guardar" is now
  // the ONLY write path for identChecks/manualOverrides (no more debounce racing ahead of it),
  // so this is the single place that needs to keep FmListPage's cache in sync — see
  // `FmModel303Page.jsx`'s `persistEditableFields` for where this fires.
  const [declManualDataPatch, setDeclManualDataPatch] = useState(null);

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
      <div style={inDetail ? { display: 'none' } : { height: '100%' }}>
        <FmListPage
          onSelect={handleSelect}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onComputeUpdate={handleComputeUpdate}
          declStatusPatch={declStatusPatch}
          declManualDataPatch={declManualDataPatch}
          data-testid="FmListPage__ca1112" />
      </div>
      {view.type === '303' && (
        <FmModel303Page
          decl={view.decl}
          onBack={handleBack}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onStatusChange={async (id, newStatus, submissionMethod) => {
            const result = await persistDeclarationStatus(id, newStatus, { token, apiBaseUrl, submissionMethod });
            if (result.ok) {
              // ETP-5438 — carry the snapshot the backend froze at submission into both the
              // detail view and the list, so the list freezes on it without a refetch.
              const snapshotPatch = result.submittedSnapshot ? { submittedSnapshot: result.submittedSnapshot } : {};
              setView(v => v.type === '303' ? { ...v, decl: { ...v.decl, status: newStatus, ...snapshotPatch } } : v);
              setDeclStatusPatch({ id, patch: { status: newStatus, ...(submissionMethod ? { submissionMethod } : {}), ...snapshotPatch } });
            }
            return result;
          }}
          onManualDataSaved={(id, manualData) => {
            setDeclManualDataPatch({ id, patch: { manualData } });
          }}
          data-testid="FmModel303Page__ca1112" />
      )}
      {view.type === '349' && (
        <FmModel349Page
          decl={view.decl}
          onBack={handleBack}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onStatusChange={async (id, newStatus, submissionMethod) => {
            const result = await persistDeclarationStatus(id, newStatus, { token, apiBaseUrl, submissionMethod });
            if (result.ok) {
              // ETP-5438 — carry the snapshot the backend froze at submission into both the
              // detail view and the list, so the list freezes on it without a refetch.
              const snapshotPatch = result.submittedSnapshot ? { submittedSnapshot: result.submittedSnapshot } : {};
              setView(v => v.type === '349' ? { ...v, decl: { ...v.decl, status: newStatus, ...snapshotPatch } } : v);
              setDeclStatusPatch({ id, patch: { status: newStatus, ...(submissionMethod ? { submissionMethod } : {}), ...snapshotPatch } });
            }
            return result;
          }}
          data-testid="FmModel349Page__ca1112" />
      )}
      {debugMode && <FmDebugPanel view={view} setView={setView} data-testid="FmDebugPanel__ca1112" />}
    </>
  );
}
