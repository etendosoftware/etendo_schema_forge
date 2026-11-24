import ConversionRatesPage from './ConversionRatesPage.jsx';

/**
 * ETP-6365 — "Conversión de divisas" (Currency Conversion): hand-written page over the
 * `conversion-rates` spec (`layoutType: "custom"` in `artifacts/conversion-rates/decisions.json`).
 * `/conversion-rates/:recordId` keeps resolving here and shows the same page: the window has no
 * drill-in detail since the redesign (rows are edited in a dialog).
 */
export default function App({ apiBaseUrl, ...rest }) {
  return <ConversionRatesPage apiBaseUrl={apiBaseUrl} {...rest} data-testid="ConversionRatesPage__convrate" />;
}
