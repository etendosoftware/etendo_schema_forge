import AssetsPage, { api } from '@generated/assets/generated/web/assets/AssetsPage';

const windowMeta = { category: 'finance', name: 'Assets' };

// Custom wrapper for the Assets window. Mirrors the generated index.jsx but
// passes `saveBeforeProcesses` so the Save button renders before the process
// buttons (e.g. "Create Amortization") in the toolbar, and `showProcessLoadingState`
// (ETP-4542 Block 2, Bug 6) so those process buttons show a spinner + "Generating..."
// and stay disabled while the backend process runs. Both are Assets-only concerns,
// kept out of the global generator vocabulary.
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return (
    <AssetsPage
      windowName={windowName}
      recordId={recordId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      window={window || windowMeta}
      api={api}
      saveBeforeProcesses
      showProcessLoadingState
      {...rest}
      data-testid="AssetsPage__1e4ba5" />
  );
}
