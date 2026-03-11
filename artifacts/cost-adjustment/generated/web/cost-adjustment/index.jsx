import CostAdjustmentPage from './CostAdjustmentPage';

const windowMeta = { category: 'warehouse', name: 'Cost Adjustment' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <CostAdjustmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
