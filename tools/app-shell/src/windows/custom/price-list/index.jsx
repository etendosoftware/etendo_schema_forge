import GeneratedApp from '@generated/price-list/generated/web/price-list/index.jsx';
import PriceListProductPrices from './PriceListProductPrices.jsx';

export default function PriceListWindow(props) {
  return (
    <GeneratedApp
      {...props}
      detailEntity={null}
      detailLabel="Product Price"
      DetailTable={null}
      DetailForm={null}
      CustomLines={PriceListProductPrices}
      customLinesLabel="Product Price"
      data-testid="GeneratedApp__d2d28e" />
  );
}
