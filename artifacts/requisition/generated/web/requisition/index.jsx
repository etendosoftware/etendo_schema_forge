import RequisitionPage from './RequisitionPage';

export default function App({ token, apiBaseUrl, window }) {
  return <RequisitionPage token={token} apiBaseUrl={apiBaseUrl} window={window} />;
}
