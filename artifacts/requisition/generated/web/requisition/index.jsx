import RequisitionPage from './RequisitionPage';

const windowMeta = { category: 'procurement', name: 'Requisition' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <RequisitionPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
