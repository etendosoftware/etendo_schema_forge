import ReservationPage from './ReservationPage';

const windowMeta = { category: 'warehouse-transactions', name: 'Stock Reservation' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <ReservationPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
