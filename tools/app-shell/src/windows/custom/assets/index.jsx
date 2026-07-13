import AssetsPage, { api } from '@generated/assets/generated/web/assets/AssetsPage';

const windowMeta = { category: 'finance', name: 'Assets' };

// Custom wrapper for the Assets window. Mirrors the generated index.jsx but
// passes `saveBeforeProcesses` so the Save button renders before the process
// buttons (e.g. "Create Amortization") in the toolbar. This is an Assets-only
// concern, kept out of the global generator vocabulary.
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
      {...rest}
      data-testid="AssetsPage__1e4ba5" />
  );
}
