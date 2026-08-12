import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'selector', label: 'Transaction Document', required: true, section: 'principal', reference: 'DocumentType', inputMode: 'selector', readOnlyLogic: (record) => !!record.id },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true, section: 'principal', readOnlyLogic: (record) => record['posted'] === true || (record['processed'] === true && (record['documentStatus'] !== 'VO')) },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', required: true, section: 'principal', reference: 'PaymentTerm', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', label: 'Total Net Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', label: 'Price List', required: true, section: 'principal', reference: 'PriceList', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'principal', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', section: 'principal', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'etvfacVerifacDesc', column: 'EM_Etvfac_Verifac_Desc', type: 'text', label: 'Descripción Operación', section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'aeatsiiDescripcionSii', column: 'EM_Aeatsii_Descripcion_Sii', type: 'text', label: 'SII Description', section: 'principal', defaultValue: '@SQL=\n	SELECT\n		CASE\n			WHEN\n				(\n					(\n						SELECT c.insiisystem\n						FROM aeatsii_config c\n						WHERE c.ad_org_id = (\n							SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\')\n							FROM dual\n						)\n					)=\'Y\'\n				)\n			THEN\n				(\n					SELECT\n						(\n							CASE\n								WHEN(@issotrx@ = \'Y\')\n								THEN (\n									SELECT description\n									FROM aeatsii_description\n									WHERE isdefault = \'Y\'\n									AND issales = \'Y\'\n									AND ad_org_id = @AD_Org_ID@\n									AND ad_client_id = @ad_client_id@\n								) ELSE (\n									SELECT description\n									FROM aeatsii_description\n									WHERE isdefault = \'Y\'\n									AND ispurchase = \'Y\'\n									AND ad_org_id = @AD_Org_ID@\n									AND ad_client_id = @ad_client_id@\n								)\n							END\n						)\n					FROM dual\n				)\n			ELSE null\n		END\n	FROM dual', readOnlyLogic: (record) => (record['em_aeatsii_estado'] === 'CO' || record['em_aeatsii_estado'] === 'AE' || (record['documentStatus'] === 'VO' && record['em_aeatsii_issent'] === 'Y')) && record['processed'] === true },
  { key: 'aeatsiiErrorRegistral', column: 'EM_Aeatsii_Error_Registral', type: 'checkbox', label: 'Register Error Modified', required: true, section: 'principal', readOnlyLogic: (record) => (record['em_aeatsii_estado'] !== 'CO' && record['em_aeatsii_estado'] !== 'AE') || record['em_aeatsii_modified'] === 'Y' || record['documentStatus'] === 'VO' },
  { key: 'aeatsiiFechaRegCont', column: 'EM_Aeatsii_Fecha_Reg_Cont', type: 'date', label: 'EM_Aeatsii_Fecha_Reg_Cont', section: 'principal', defaultValue: '@SQL=SELECT CASE WHEN ((SELECT c.insiisystem FROM aeatsii_config c WHERE c.ad_org_id = (SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\') FROM dual))=\'Y\' AND (SELECT c.posted_invoices FROM aeatsii_config c WHERE c.ad_org_id = (SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\') FROM dual))=\'Y\') THEN null ELSE now() END FROM dual', readOnlyLogic: (record) => record['aEATSII_InSIIAndPostedInvoices'] === 'Y' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:HeaderForm
