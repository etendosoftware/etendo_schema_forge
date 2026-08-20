import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import ProductTable from './ProductTable';
import ProductForm from './ProductForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import ProductAdditionalInfoPanel from '@/windows/custom/product/ProductAdditionalInfoPanel';
import { AttachmentsTab } from '@/components/attachments';
import ProductPriceBar from '@/windows/custom/product/ProductPriceBar';
import catalogs from './mockCatalogs';
import ProductGallery from '@/windows/custom/product/ProductGallery';
import ProductSidebar from '@/windows/custom/product/ProductSidebar';

const breadcrumb = 'Inventory / Product';


// @sf-generated-start summary:product
const summary = [

];

const statusField = null;
// @sf-generated-end summary:product

// @sf-generated-start extraBadges:product
const extraBadges = [

];
// @sf-generated-end extraBadges:product

// @sf-generated-start processes:product
const processes = [

];
// @sf-generated-end processes:product

// @sf-generated-start draftMode:product
const draftMode = null;
// @sf-generated-end draftMode:product

// @sf-generated-start requiredHeaderFields:product
const requiredHeaderFields = ['searchKey', 'name', 'uOM', 'productCategory', 'taxCategory', 'purchase', 'sale', 'productType', 'stocked', 'active', 'returnable'];
// @sf-generated-end requiredHeaderFields:product



export const api = {
  "specName": "product",
  "baseUrl": "/sws/neo/product",
  "crud": {
    "product": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/product",
      "detailUrl": "/sws/neo/product/product/{id}",
      "supportedFilters": [
        "searchKey",
        "name",
        "productCategory",
        "productType",
        "uPCEAN"
      ]
    },
    "price": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/price",
      "detailUrl": "/sws/neo/product/price/{id}",
      "supportedFilters": []
    },
    "priceRuleVersion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/priceRuleVersion",
      "detailUrl": "/sws/neo/product/priceRuleVersion/{id}",
      "supportedFilters": []
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/product/accounting",
      "detailUrl": "/sws/neo/product/accounting/{id}",
      "supportedFilters": []
    },
    "billOfMaterials": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/billOfMaterials",
      "detailUrl": "/sws/neo/product/billOfMaterials/{id}",
      "supportedFilters": []
    },
    "costing": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/costing",
      "detailUrl": "/sws/neo/product/costing/{id}",
      "supportedFilters": []
    },
    "transactionAdjustments": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/transactionAdjustments",
      "detailUrl": "/sws/neo/product/transactionAdjustments/{id}",
      "supportedFilters": []
    },
    "transactions": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/transactions",
      "detailUrl": "/sws/neo/product/transactions/{id}",
      "supportedFilters": []
    },
    "productCharacteristic": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/productCharacteristic",
      "detailUrl": "/sws/neo/product/productCharacteristic/{id}",
      "supportedFilters": []
    },
    "stock": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/stock",
      "detailUrl": "/sws/neo/product/stock/{id}",
      "supportedFilters": []
    },
    "categoryPriceRuleVersion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/categoryPriceRuleVersion",
      "detailUrl": "/sws/neo/product/categoryPriceRuleVersion/{id}",
      "supportedFilters": []
    },
    "alternateUom": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/alternateUom",
      "detailUrl": "/sws/neo/product/alternateUom/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "product",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "search",
      "url": "/sws/neo/product/product/selectors/uOM"
    },
    {
      "entity": "product",
      "field": "productCategory",
      "column": "M_Product_Category_ID",
      "reference": "ProductCategory",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/productCategory"
    },
    {
      "entity": "product",
      "field": "taxCategory",
      "column": "C_TaxCategory_ID",
      "reference": "TaxCategory",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/taxCategory"
    },
    {
      "entity": "product",
      "field": "uOMForWeight",
      "column": "C_Uom_Weight_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/uOMForWeight"
    },
    {
      "entity": "product",
      "field": "attributeSet",
      "column": "M_AttributeSet_ID",
      "reference": "AttributeSet",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/attributeSet"
    },
    {
      "entity": "product",
      "field": "brand",
      "column": "M_Brand_ID",
      "reference": "Brand",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/brand"
    },
    {
      "entity": "product",
      "field": "mProductStatusID",
      "column": "M_Product_Status_ID",
      "reference": "ProductStatus",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/mProductStatusID"
    },
    {
      "entity": "price",
      "field": "priceListVersion",
      "column": "M_PriceList_Version_ID",
      "reference": "PriceListVersion",
      "inputMode": "selector",
      "url": "/sws/neo/product/price/selectors/priceListVersion"
    },
    {
      "entity": "priceRuleVersion",
      "field": "servicePriceRule",
      "column": "M_Servicepricerule_ID",
      "reference": "ServicePriceRule",
      "inputMode": "selector",
      "url": "/sws/neo/product/priceRuleVersion/selectors/servicePriceRule"
    },
    {
      "entity": "accounting",
      "field": "fixedAsset",
      "column": "P_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product/accounting/selectors/fixedAsset"
    },
    {
      "entity": "accounting",
      "field": "productExpense",
      "column": "P_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product/accounting/selectors/productExpense"
    },
    {
      "entity": "accounting",
      "field": "productRevenue",
      "column": "P_Revenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product/accounting/selectors/productRevenue"
    },
    {
      "entity": "accounting",
      "field": "productCOGS",
      "column": "P_Cogs_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product/accounting/selectors/productCOGS"
    },
    {
      "entity": "billOfMaterials",
      "field": "bOMProduct",
      "column": "M_ProductBOM_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/product/billOfMaterials/selectors/bOMProduct"
    },
    {
      "entity": "costing",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/product/costing/selectors/warehouse"
    },
    {
      "entity": "costing",
      "field": "cCurrencyID",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/product/costing/selectors/cCurrencyID"
    },
    {
      "entity": "transactionAdjustments",
      "field": "cCurrencyID",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactionAdjustments/selectors/cCurrencyID"
    },
    {
      "entity": "transactionAdjustments",
      "field": "costAdjustmentLine",
      "column": "M_Costadjustmentline_ID",
      "reference": "Costadjustmentline",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactionAdjustments/selectors/costAdjustmentLine"
    },
    {
      "entity": "transactions",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Organization",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/organization"
    },
    {
      "entity": "transactions",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/storageBin"
    },
    {
      "entity": "transactions",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/uOM"
    },
    {
      "entity": "productCharacteristic",
      "field": "characteristic",
      "column": "M_Characteristic_ID",
      "reference": "Characteristic",
      "inputMode": "selector",
      "url": "/sws/neo/product/productCharacteristic/selectors/characteristic"
    },
    {
      "entity": "productCharacteristic",
      "field": "characteristicSubset",
      "column": "M_Ch_Subset_ID",
      "reference": "CharacteristicSubset",
      "inputMode": "selector",
      "url": "/sws/neo/product/productCharacteristic/selectors/characteristicSubset"
    },
    {
      "entity": "stock",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/stock/selectors/storageBin"
    },
    {
      "entity": "stock",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/stock/selectors/uOM"
    },
    {
      "entity": "categoryPriceRuleVersion",
      "field": "servicePriceRule",
      "column": "M_Servicepricerule_ID",
      "reference": "ServicePriceRule",
      "inputMode": "selector",
      "url": "/sws/neo/product/categoryPriceRuleVersion/selectors/servicePriceRule"
    },
    {
      "entity": "alternateUom",
      "field": "uOM",
      "column": "C_Uom_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/alternateUom/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "product",
      "field": "manageVariants",
      "column": "ManageVariants",
      "url": "/sws/neo/product/product/{id}/action/manageVariants",
      "processId": "FE3A8C134D41488DB3A69837BD54B56A",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/product/product/{id}/action/processNow",
      "processId": "136",
      "processType": "classic"
    },
    {
      "entity": "product",
      "field": "createVariants",
      "column": "CreateVariants",
      "url": "/sws/neo/product/product/{id}/action/createVariants",
      "processId": "3C386BC12832466790E50F2F8C5EBD85",
      "processType": "classic"
    },
    {
      "entity": "product",
      "field": "updateInvariants",
      "column": "Updateinvariants",
      "url": "/sws/neo/product/product/{id}/action/updateInvariants",
      "processId": "7DC2C8DC186B4C1DB18E147911950861",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodcattoservice",
      "column": "Relateprodcattoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattoservice",
      "processId": "8E5996F1F3154B498468938B5341A0CB",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodtoservice",
      "column": "Relateprodtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodtoservice",
      "processId": "E66C669B0B01498C8EB3F99CD371CF9A",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodcattaxtoservice",
      "column": "Relateprodcattaxtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattaxtoservice",
      "processId": "E0870062F05F4DC88E589ABC6A45DF4C",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "copyservicemodifytaxconfig",
      "column": "Copyservicemodifytaxconfig",
      "url": "/sws/neo/product/product/{id}/action/copyservicemodifytaxconfig",
      "processId": "CBBD7BB6BDFE4705B68DD3D9FF788D4E",
      "processType": "obuiapp"
    },
    {
      "entity": "transactions",
      "field": "manualcostadjustment",
      "column": "Manualcostadjustment",
      "url": "/sws/neo/product/transactions/{id}/action/manualcostadjustment",
      "processId": "D395B727675C45C98320F8A40E0768E7",
      "processType": "obuiapp"
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "inventory"
  },
  "labelOverrides": {
    "en_US": {
      "M_Product_Category_ID": "Category",
      "ProductType": "Type"
    },
    "es_ES": {
      "M_Product_Category_ID": "Categoría",
      "ProductType": "Tipo"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:ProductPage
export default function ProductPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('140');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="140" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="product"
        Form={ProductForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Product"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'accounting', label: 'Accounting', Table: AccountingTable, Form: AccountingForm, addLineFields: { entry: [
          { key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Product Asset', reference: 'ValidCombination', inputMode: 'selector' },
          { key: 'productExpense', column: 'P_Expense_Acct', type: 'selector', required: true, label: 'Product Expense', reference: 'ValidCombination', inputMode: 'selector' },
          { key: 'productRevenue', column: 'P_Revenue_Acct', type: 'selector', required: true, label: 'Product Revenue', reference: 'ValidCombination', inputMode: 'selector' },
          { key: 'productCOGS', column: 'P_Cogs_Acct', type: 'selector', label: 'Product COGS', reference: 'ValidCombination', inputMode: 'selector' },
          ], derived: [], hidden: [] }, requireSavedRecord: true, maxDetailLines: 1, tabOrder: 1000 },
        ]}
        primaryTabs={[
          { key: 'general', label: 'General' },
          { key: 'additionalInfo', label: 'Additional Info', Panel: ProductAdditionalInfoPanel },
        ]}
        hidePrint
        hideMoreMenu
        noHeaderBorder
        toolbarBorderBottom
        compactSidebarPadding
        whiteFormBackground
        autoSaveOnBlur
        sidebarClassName="w-[30%] shrink-0 overflow-y-auto pt-2 pl-0 pr-4 pb-5 border-l border-border-subtle"
        tabsBarPaddingX="px-2"
        primaryTabsVariant="pill"
        toolbarPaddingX="px-2"
        contentBg="bg-card"
        formCardPadding="px-2"
        customTabs={[{ key: 'pricing', labelKey: 'price', Component: ProductPriceBar, placement: 'tab' }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_Product", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
        sidebarContent={(data) => (
          <ProductSidebar
            recordId={recordId}
            data={data}
            token={props.token}
            apiBaseUrl={props.apiBaseUrl}
          />
        )}
      />
      </>
    );
  }

  return (
    <ListView
      entity="product"
      Table={ProductTable}
      entityLabel="Product"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      galleryRenderer={(gProps) => <ProductGallery {...gProps} />}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideMoreMenu
      hideLink
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      import={{"enabled":true,"spec":"product","entity":"product","descriptor":"product","formats":["csv","txt"],"limit":{"maxRows":5000,"concurrency":4},"dedupe":{"scope":"file","key":["searchKey"]},"fields":[{"target":"searchKey","aliases":["codigo","código","sku"],"label":"Search Key","required":true,"type":"string"},{"target":"name","aliases":["nombre"],"label":"Name","required":true,"type":"string"},{"target":"description","aliases":["descripcion","descripción"],"label":"Description","required":false,"type":"textarea"},{"required":false,"type":"string","target":"price","aliases":["precio"],"label":"Price"},{"required":false,"type":"string","target":"categoryCode","aliases":["codigocategoria","códigocategoría","codigo_categoria","código_categoría","category_code"],"label":"Category Code"},{"required":false,"type":"string","target":"categoryName","aliases":["nombrecategoria","nombrecategoría","nombre_categoria","nombre_categoría","category_name"],"label":"Category Name"},{"required":false,"type":"string","target":"category","aliases":["categoria","categoría"],"label":"Category"}]}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:ProductPage
