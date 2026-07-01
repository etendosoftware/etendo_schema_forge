import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'orderReference', column: 'POReference', type: 'text', label: 'RMA vendor ref.', section: 'principal' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'cReturnReasonID', column: 'C_Return_Reason_ID', type: 'selector', label: 'Return Reason', section: 'other', reference: 'Return_Reason', inputMode: 'selector' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true, section: 'other', reference: 'Warehouse', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'other', reference: 'Paymentmethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', required: true, section: 'other', reference: 'PaymentTerm', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', label: 'Price List', required: true, section: 'other', reference: 'PriceList', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'documentStatus', column: 'DocStatus', type: 'select', label: 'Document Status', required: true, readOnly: true, section: 'other', options: [{ value: 'AE', label: 'Automatic Evaluation', labels: {"es_ES":"Evaluación Automática"} }, { value: 'CO', label: 'Booked', labels: {"es_ES":"Registrado"} }, { value: 'CL', label: 'Closed', labels: {"es_ES":"Cerrado"} }, { value: 'ETGO_CI', label: 'Closed - Invoice Created', labels: {"es_ES":"Closed - Invoice Created"} }, { value: 'CA', label: 'Closed - Order Created', labels: {"es_ES":"Cerrado - Pedido creado"} }, { value: 'CJ', label: 'Closed - Rejected', labels: {"es_ES":"Cerrado - Rechazado"} }, { value: 'DR', label: 'Draft', labels: {"es_ES":"Borrador"} }, { value: 'ME', label: 'Manual Evaluation', labels: {"es_ES":"Evaluación Manual"} }, { value: 'NA', label: 'Not Accepted', labels: {"es_ES":"No aprobado"} }, { value: 'NC', label: 'Not Confirmed', labels: {"es_ES":"No Confirmado"} }, { value: 'WP', label: 'Not Paid', labels: {"es_ES":"Pendiente de Pago"} }, { value: 'RE', label: 'Re-Opened', labels: {"es_ES":"Reabierto"} }, { value: 'TMP', label: 'Temporal', labels: {"es_ES":"Temporal"} }, { value: 'UE', label: 'Under Evaluation', labels: {"es_ES":"Bajo evaluación"} }, { value: 'IP', label: 'Under Way', labels: {"es_ES":"En curso"} }, { value: '??', label: 'Unknown', labels: {"es_ES":"Desconocido"} }, { value: 'VO', label: 'Voided', labels: {"es_ES":"Anulado"} }], defaultValue: 'DR' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'other' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', label: 'Total Net Amount', required: true, readOnly: true, section: 'other' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@' },
  { key: 'deliveryNotes', column: 'Deliverynotes', type: 'textarea', label: 'Delivery notes', section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === 'Y' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', section: 'other', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === 'Y' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', section: 'other', reference: 'User1', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === 'Y' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', section: 'other', reference: 'User2', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === 'Y' },
  { key: 'delivered', column: 'IsDelivered', type: 'checkbox', label: 'Delivered', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:HeaderForm
