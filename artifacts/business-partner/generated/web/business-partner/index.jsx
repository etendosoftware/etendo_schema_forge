import BusinessPartnerPage from './BusinessPartnerPage';

const windowMeta = { category: 'reference', name: 'Business Partner' };

<<<<<<< HEAD
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <BusinessPartnerPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} {...rest} />;
=======
export default function App({ token, apiBaseUrl, window }) {
  return <BusinessPartnerPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
>>>>>>> origin/main
}
