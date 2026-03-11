import RequisitionPage from './RequisitionPage';

const windowMeta = { category: 'procurement', name: 'Manage Requisitions' };

export default function App({ token, apiBaseUrl, window }) {
  return <RequisitionPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
