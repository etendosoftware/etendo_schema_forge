import React, { useState, useCallback } from 'react';
import FmListPage from './FmListPage';
import { getModel, isKnownModel } from './modelRegistry.js';
import { getDetailPage } from './modelRegistryPages.js';
import FmDebugPanel from './FmDebugPanel.jsx';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';
import { persistDeclarationStatus, fetchDeclaration } from './fiscalModelsUtils.js';

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

  // FmListPage pushes the draft auto-compute map of every model whose registry entry sets
  // `syncDraftComputeToDetail` (349); only an open detail page of such a model takes it.
  const handleComputeUpdate = useCallback((computedMap) => {
    setView(v => {
      if (!getModel(v.type)?.syncDraftComputeToDetail) return v;
      const updated = computedMap[v.decl.id];
      if (!updated) return v;
      return { ...v, decl: { ...v.decl, _precomputed: updated } };
    });
  }, []);

  // ETP-5438 — a successful AEAT telematic filing already set `submitted_ack`,
  // `submissionMethod: 'aeat_telematic'` and the submission snapshot SERVER-side
  // (Fiscal303SubmissionSupport#persistSuccessfulSubmission). Sending the usual status PUT here
  // would be a submitted -> submitted transition, which `rejectRepresentation` answers with 409
  // — the list then never learned about the filing. Instead: patch the detail view and the list
  // locally right away, then re-read the declaration so both pick up `submittedSnapshot` (the
  // list's "Resultado" freezes on it without a manual reload).
  const handleSubmittedRemotely = useCallback(async (id, newStatus) => {
    const patchBoth = (patch) => {
      setView(v => (v.decl?.id === id ? { ...v, decl: { ...v.decl, ...patch } } : v));
      setDeclStatusPatch({ id, patch });
    };
    patchBoth({ status: newStatus, submissionMethod: 'aeat_telematic' });
    const fresh = await fetchDeclaration(id, { token, apiBaseUrl });
    if (fresh) {
      patchBoth({
        status: fresh.status,
        submissionMethod: fresh.submissionMethod ?? 'aeat_telematic',
        submittedSnapshot: fresh.submittedSnapshot ?? null,
      });
    }
  }, [token, apiBaseUrl]);

  // A registered model's declaration is open: render that model's detail page (registry
  // binding in modelRegistryPages.js). `detailType` is captured so the status callback only
  // patches the view while it still shows that model, as each per-model block did before.
  const inDetail = isKnownModel(view.type);
  const detailType = view.type;
  const DetailPage = inDetail ? getDetailPage(detailType) : undefined;
  const detailModel = getModel(detailType);

  return (
    <>
      {/* FmListPage stays mounted at all times so useFiscalAutoCompute keeps polling */}
      <div style={inDetail ? { display: 'none' } : { height: '100%' }}>
        <FmListPage
          active={!inDetail}
          onSelect={handleSelect}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onComputeUpdate={handleComputeUpdate}
          declStatusPatch={declStatusPatch}
          declManualDataPatch={declManualDataPatch}
          data-testid="FmListPage__ca1112" />
      </div>
      {DetailPage && (
        <DetailPage
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
              setView(v => v.type === detailType ? { ...v, decl: { ...v.decl, status: newStatus, ...snapshotPatch } } : v);
              setDeclStatusPatch({ id, patch: { status: newStatus, ...(submissionMethod ? { submissionMethod } : {}), ...snapshotPatch } });
            }
            return result;
          }}
          {...(detailModel.telematicFiling ? { onSubmittedRemotely: handleSubmittedRemotely } : {})}
          onManualDataSaved={(id, manualData) => {
            setDeclManualDataPatch({ id, patch: { manualData } });
          }}
          data-testid={`FmModel${detailType}Page__ca1112`} />
      )}
      {debugMode && <FmDebugPanel view={view} setView={setView} data-testid="FmDebugPanel__ca1112" />}
    </>
  );
}
