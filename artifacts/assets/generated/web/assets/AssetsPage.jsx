import { ListView, DetailView } from '@/components/contract-ui';
import AssetsTable from './AssetsTable';
import AssetsForm from './AssetsForm';
import AmortizationLineTable from './AmortizationLineTable';
import AmortizationLineForm from './AmortizationLineForm';
import AssetAcctTable from './AssetAcctTable';
import AssetAcctForm from './AssetAcctForm';
import catalogs from './mockCatalogs';

import { TrendingDown, CheckCircle2 } from 'lucide-react';

const breadcrumb = 'Accounting / Assets';

// @sf-generated-start statusBar:assets
function AssetsStatusBar({ data }) {
  if (!data) return null;
  const fmt = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const depreciate = data.depreciate === true || data.depreciate === 'Y';
  const depreciatedValue = Number(data.depreciatedValue ?? 0);
  const assetValue = Number(data.assetValue ?? 0);
  const pct = (depreciate && assetValue > 0) ? Math.min(100, Math.round((depreciatedValue / assetValue) * 100)) : null;
  const colorMap = {
    blue:   { bg: 'bg-blue-100',   border: 'border-l-blue-500',    text: 'text-blue-800',    sub: 'text-blue-500',    icon: 'text-blue-500',    bar: 'bg-blue-500',    barTrack: 'bg-blue-200'    },
    teal:   { bg: 'bg-teal-50',    border: 'border-l-teal-500',    text: 'text-teal-800',    sub: 'text-teal-500',    icon: 'text-teal-500',    bar: 'bg-teal-500',    barTrack: 'bg-teal-200'    },
    orange: { bg: 'bg-orange-50',  border: 'border-l-orange-500',  text: 'text-orange-700',  sub: 'text-orange-500',  icon: 'text-orange-500',  bar: 'bg-orange-500',  barTrack: 'bg-orange-200'  },
    green:  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-800', sub: 'text-emerald-500', icon: 'text-emerald-500', bar: 'bg-emerald-500', barTrack: 'bg-emerald-200' },
  };
  const cards = [
    { label: 'Depreciated Value', value: fmt(data.depreciatedValue), color: 'blue',  Icon: TrendingDown },
    { label: 'Depreciated Plan', value: fmt(data.depreciatedPlan), color: 'teal',  Icon: TrendingDown },
  ];
    const progressColor = pct === 100 ? 'green' : 'orange';
  const pc = colorMap[progressColor];
  return (
    <div className="flex flex-wrap gap-3 pt-2 pb-3 mb-2 border-b border-gray-100">
      {cards.map(({ label, value, color, Icon }) => {
        const c = colorMap[color];
        return (
          <div key={label} className={`flex items-center gap-3 ${c.bg} border-l-4 ${c.border} rounded-lg px-4 py-2.5 min-w-[160px]`}>
            <Icon size={18} className={c.icon} />
            <div>
              <div className={`text-lg font-semibold leading-tight ${c.text}`}>{value}</div>
              <div className={`text-xs ${c.sub} mt-0.5`}>{label}</div>
            </div>
          </div>
        );
      })}
      {pct !== null && (
        <div className={`flex items-center gap-3 ${pc.bg} border-l-4 ${pc.border} rounded-lg px-4 py-2.5 min-w-[170px]`}>
          {pct === 100 ? <CheckCircle2 size={18} className={pc.icon} /> : <TrendingDown size={18} className={pc.icon} />}
          <div>
            <div className={`text-lg font-semibold leading-tight ${pc.text}`}>{pct}%</div>
            <div className={`text-xs ${pc.sub} mt-0.5`}>Depreciation</div>
            <div className={`mt-1.5 h-1.5 w-24 ${pc.barTrack} rounded-full overflow-hidden`}>
              <div className={`h-full ${pc.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// @sf-generated-end statusBar:assets


// @sf-generated-start summary:assets
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:assets

// @sf-custom-slot extraBadges:assets
// @sf-generated-start extraBadges:assets
const extraBadges = [];
// @sf-generated-end extraBadges:assets

// @sf-generated-start processes:assets
const processes = [

];
// @sf-generated-end processes:assets

// @sf-generated-start draftMode:assets
const draftMode = null;
// @sf-generated-end draftMode:assets

// @sf-generated-start addLineFields:amortizationLine
const addLineFields = {
  entry: [
    { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage' },
    { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', reference: 'Currency', inputMode: 'selector' },
  ],
  derived: [
    { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', label: 'Amortization Amount' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:amortizationLine

const api = {
  "specName": "assets",
  "baseUrl": "/sws/neo/assets",
  "crud": {
    "assets": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/assets",
      "detailUrl": "/sws/neo/assets/assets/{id}",
      "supportedFilters": [
        "searchKey",
        "name",
        "assetCategory",
        "depreciate",
        "fullyDepreciated"
      ]
    },
    "amortizationLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/amortizationLine",
      "detailUrl": "/sws/neo/assets/amortizationLine/{id}",
      "supportedFilters": []
    },
    "assetAcct": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/assetAcct",
      "detailUrl": "/sws/neo/assets/assetAcct/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "assets",
      "field": "assetCategory",
      "column": "A_Asset_Group_ID",
      "reference": "AssetGroup",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assets/selectors/assetCategory"
    },
    {
      "entity": "assets",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assets/selectors/currency"
    },
    {
      "entity": "assets",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/assets/assets/selectors/product"
    },
    {
      "entity": "assets",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/assets/assets/selectors/project"
    },
    {
      "entity": "amortizationLine",
      "field": "amortization",
      "column": "A_Amortization_ID",
      "reference": "Amortization",
      "inputMode": "search",
      "url": "/sws/neo/assets/amortizationLine/selectors/amortization"
    },
    {
      "entity": "amortizationLine",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/assets/amortizationLine/selectors/currency"
    },
    {
      "entity": "assetAcct",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/accountingSchema"
    },
    {
      "entity": "assetAcct",
      "field": "accumulatedDepreciation",
      "column": "A_Accumdepreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/accumulatedDepreciation"
    },
    {
      "entity": "assetAcct",
      "field": "depreciation",
      "column": "A_Depreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/depreciation"
    }
  ],
  "actions": [
    {
      "entity": "assets",
      "field": "processed",
      "column": "Processed",
      "url": "/sws/neo/assets/assets/{id}/action/processed",
      "processId": "800125",
      "processType": "classic"
    },
    {
      "entity": "assets",
      "field": "processAsset",
      "column": "Process_Asset",
      "url": "/sws/neo/assets/assets/{id}/action/processAsset",
      "processId": "85601427EAEE401FA0250FF0A6DD62EF",
      "processType": "classic"
    }
  ],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=assetsDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:AssetsPage
export default function AssetsPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:AssetsPage
  if (recordId) {
    return (
      <DetailView
        entity="assets"
        detailEntity="amortizationLine"
        Form={AssetsForm}
        DetailTable={AmortizationLineTable}
        DetailForm={AmortizationLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Assets"
        detailLabel="Asset Amortization"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'assetAcct', label: 'Accounting', Table: AssetAcctTable, Form: AssetAcctForm },
        ]}
        headerContent={(data) => <AssetsStatusBar data={data} />}
        detailSortBy="sEQNoAsset asc"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="assets"
      Table={AssetsTable}
      entityLabel="Assets"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:AssetsPage

// @sf-custom-slot section:AssetsPage-custom
