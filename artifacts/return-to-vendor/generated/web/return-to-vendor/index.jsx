import ReturnMaterialPage from './ReturnMaterialPage';

const windowMeta = { category: 'procurement', name: 'Return to Vendor' };

export default function App({ token, apiBaseUrl, window }) {
  return <ReturnMaterialPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
