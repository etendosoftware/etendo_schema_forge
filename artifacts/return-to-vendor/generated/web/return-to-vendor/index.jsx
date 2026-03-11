import ReturnMaterialPage from './ReturnMaterialPage';

const windowMeta = { category: 'procurement', name: 'Return to Vendor' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <ReturnMaterialPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
