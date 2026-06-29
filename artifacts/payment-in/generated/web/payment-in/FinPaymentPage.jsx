import { ListView, DetailView } from '@/components/contract-ui';
import FinPaymentTable from '../../../custom/PaymentHeaderTable';
import FinPaymentForm from './FinPaymentForm';
import PaymentActivityToggle from '../../../custom/PaymentActivityToggle';
import PaymentDetailSidebar from '../../../custom/PaymentDetailSidebar';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finanzas / Cobro';


// @sf-generated-start summary:finPayment
const summary = [

];

const statusField = 'status';
// @sf-generated-end summary:finPayment

// @sf-generated-start extraBadges:finPayment
const extraBadges = [
  { key: 'conciliado', labelKey: 'conciliado', field: 'reconciled', condition: (data) => data?.reconciled === 'Y', style: 'info' },
];
// @sf-generated-end extraBadges:finPayment

// @sf-generated-start processes:finPayment
const processes = [
  { name: 'etblkpBulkposting', label: 'Bulk Posting', style: 'positive',
    displayLogicRaw: "@Status@!'RPAE' & @Status@!'RPVOID' & @Processed@='Y' & @#ShowAcct@='Y'" },
  { name: 'etprReactivatePayment', label: 'Advanced Reactivation', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @Status@!'RPVOID'" },
  { name: 'eTPRRemovePayment', label: 'Remove Payment', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @Status@!'RPVOID'" },
  { name: 'aPRMProcessPayment', label: 'Process Payment', style: 'positive', columnName: 'aPRMProcessPayment',
    displayLogicRaw: "@status@='RPAP'" },
];
// @sf-generated-end processes:finPayment

// @sf-generated-start draftMode:finPayment
const draftMode = null;
// @sf-generated-end draftMode:finPayment

// @sf-generated-start requiredHeaderFields:finPayment
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:finPayment



export const api = {
  "specName": "payment-in",
  "baseUrl": "/sws/neo/payment-in",
  "crud": {
    "finPayment": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/finPayment",
      "detailUrl": "/sws/neo/payment-in/finPayment/{id}",
      "supportedFilters": [
        "documentNo",
        "paymentDate",
        "businessPartner"
      ]
    },
    "finPaymentScheduleDetail": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/finPaymentScheduleDetail",
      "detailUrl": "/sws/neo/payment-in/finPaymentScheduleDetail/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "finPayment",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPayment/selectors/businessPartner"
    },
    {
      "entity": "finPayment",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPayment/selectors/paymentMethod"
    },
    {
      "entity": "finPayment",
      "field": "account",
      "column": "Fin_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "dependent",
      "url": "/sws/neo/payment-in/finPayment/selectors/account",
      "context": {
        "required": [
          {
            "param": "Fin_Paymentmethod_ID",
            "source": "field",
            "field": "paymentMethod"
          }
        ]
      }
    },
    {
      "entity": "finPayment",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "dependent",
      "url": "/sws/neo/payment-in/finPayment/selectors/currency",
      "context": {
        "required": [
          {
            "param": "FIN_Financial_Account_ID",
            "source": "field",
            "field": "account"
          }
        ]
      }
    },
    {
      "entity": "finPaymentScheduleDetail",
      "field": "invoicePaymentSchedule",
      "column": "FIN_Payment_Schedule_Invoice",
      "reference": "Payment_Schedule",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPaymentScheduleDetail/selectors/invoicePaymentSchedule"
    }
  ],
  "actions": [
    {
      "entity": "finPayment",
      "field": "aPRMAddScheduledpayments",
      "column": "EM_Aprm_Add_Scheduledpayments",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMAddScheduledpayments",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/posted"
    },
    {
      "entity": "finPayment",
      "field": "aPRMProcessPayment",
      "column": "EM_APRM_Process_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMProcessPayment",
      "processId": "6255BE488882480599C81284B70CD9B3",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aprmExecutepayment",
      "column": "EM_Aprm_Executepayment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aprmExecutepayment",
      "processId": "E011F492B0814A74B63CD1F3B9FF0526",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReversePayment",
      "column": "EM_APRM_ReversePayment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMReversePayment",
      "processId": "29D17F515727436DBCE32BC6CA28382B",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReconcilePayment",
      "column": "EM_APRM_Reconcile_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMReconcilePayment"
    },
    {
      "entity": "finPayment",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aeatsiiSend",
      "processId": "EA02D79CA1DE4B46909EA6EF64A66B53",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "etprReactivatePayment",
      "column": "EM_Etpr_Reactivate_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/etprReactivatePayment",
      "processId": "84628BC70CDB49B58054E80C20BCBFEE",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "eTPRRemovePayment",
      "column": "em_etpr_remove_payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/eTPRRemovePayment",
      "processId": "FB79E902A5384754990AD145F6CAC9FB",
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
    "category": "finance"
  }
};

function DirBadge({ data }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: '#DDFAEB', flexShrink: 0 }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#17663A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
      </span>
      <span style={{ font: '700 15px/20px Inter', color: '#19191D' }}>{data?.documentNo}</span>
    </span>
  );
}

// @sf-generated-start component:FinPaymentPage
export default function FinPaymentPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="finPayment"
        Form={FinPaymentForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={[]}
        catalogs={catalogs}
        entityLabel="Fin Payment"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        api={api}
        hideDeleteWhenComplete
        noHeaderBorder
        formCardPadding="p-0"
        topbarExtra={DirBadge}
        topbarRight={PaymentActivityToggle}
        sidePanel={PaymentDetailSidebar}
        menuActions={({ status }) => [
          { key: 'reverse', label: 'Reverse Payment', destructive: true, visible: ["RPPC","RPR","RDNC"].includes(status), columnName: 'aPRMReversePayment' }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        sendDocument
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="finPayment"
      Table={FinPaymentTable}
      entityLabel="Payment In"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="paymentDate"
      rowQuickActions={{}}
      sendDocument
      {...props}
    />
  );
}
// @sf-generated-end component:FinPaymentPage
