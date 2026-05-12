// ── SII — _siiTab distinguishes issued vs received so sections can filter ──
// aeatsiiEstado uses 2-letter codes matching FmPrimitives STATUS_CONFIG keys
export const MOCK_SII_ROWS = [
  // issued — April 2025, customers
  { id: 's1', _siiTab: 'issued', invoiceDate: '03/04/2025', documentNo: 'EV-2025-0318', businessPartner: 'B-82345678', businessPartnerIdentifier: 'Acme Distribución S.L.',       aeatsiiClaveTipo: 'F1', grandTotalAmount: '12.100,00', aeatsiiEstado: 'CO', cdigoCSV: 'AB1CD2EF3GH4IJ' },
  { id: 's2', _siiTab: 'issued', invoiceDate: '07/04/2025', documentNo: 'EV-2025-0319', businessPartner: 'A-12345678', businessPartnerIdentifier: 'Transportes Alcántara S.A.',   aeatsiiClaveTipo: 'F1', grandTotalAmount: '3.872,50',  aeatsiiEstado: 'CO', cdigoCSV: 'KL5MN6PQ7RS8TU' },
  { id: 's3', _siiTab: 'issued', invoiceDate: '10/04/2025', documentNo: 'EV-2025-0320', businessPartner: 'B-55667788', businessPartnerIdentifier: 'Grupo Mediasur, S.L.U.',       aeatsiiClaveTipo: 'F2', grandTotalAmount: '605,00',    aeatsiiEstado: 'CO', cdigoCSV: 'VW9XY0ZA1BC2DE' },
  { id: 's4', _siiTab: 'issued', invoiceDate: '14/04/2025', documentNo: 'EV-2025-0321', businessPartner: 'A-99887766', businessPartnerIdentifier: 'Logística Norte S.A.',         aeatsiiClaveTipo: 'F1', grandTotalAmount: '28.710,00', aeatsiiEstado: 'AE', aeatsiiErrorCode: '1106', aeatsiiErrorMsg: 'Período de liquidación no coincide con el período del libro' },
  { id: 's5', _siiTab: 'issued', invoiceDate: '17/04/2025', documentNo: 'EV-2025-R001', businessPartner: 'B-82345678', businessPartnerIdentifier: 'Acme Distribución S.L.',       aeatsiiClaveTipo: 'R1', grandTotalAmount: '-1.210,00', aeatsiiEstado: 'CO', cdigoCSV: 'FG3HI4JK5LM6NO' },
  { id: 's6', _siiTab: 'issued', invoiceDate: '22/04/2025', documentNo: 'EV-2025-0322', businessPartner: 'A-34567890', businessPartnerIdentifier: 'Construcciones Almagro S.A.',  aeatsiiClaveTipo: 'F1', grandTotalAmount: '9.196,00',  aeatsiiEstado: 'IN', aeatsiiErrorCode: '3000', aeatsiiErrorMsg: 'NIF no identificado en el censo de la AEAT' },
  { id: 's7', _siiTab: 'issued', invoiceDate: '25/04/2025', documentNo: 'EV-2025-0323', businessPartner: 'NL-123456789B01', businessPartnerIdentifier: 'Tech Solutions B.V.',    aeatsiiClaveTipo: 'F1', grandTotalAmount: '4.356,00',  aeatsiiEstado: 'CO', cdigoCSV: 'PQ7RS8TU9VW0XY' },
  { id: 's8', _siiTab: 'issued', invoiceDate: '28/04/2025', documentNo: 'EV-2025-0324', businessPartner: 'B-11223344', businessPartnerIdentifier: 'Servicios Cloud E.',           aeatsiiClaveTipo: 'F1', grandTotalAmount: '1.694,00',  aeatsiiEstado: 'PE', cdigoCSV: null },
  { id: 's9', _siiTab: 'issued', invoiceDate: '30/04/2025', documentNo: 'EV-2025-0325', businessPartner: 'B-99001122', businessPartnerIdentifier: 'Distribuciones Mena S.L.',       aeatsiiClaveTipo: 'F1', grandTotalAmount: '2.541,00',  aeatsiiEstado: 'EE', aeatsiiErrorCode: '500',  aeatsiiErrorMsg: 'Error de conexión con los servidores de la AEAT' },
  // issued previous period — March 2025
  { id: 'sa1', _siiTab: 'issued-previous', invoiceDate: '05/03/2025', documentNo: 'EV-2025-0301', businessPartner: 'B-82345678', businessPartnerIdentifier: 'Acme Distribución S.L.',       aeatsiiClaveTipo: 'F1', grandTotalAmount: '8.400,00',  aeatsiiEstado: 'CO', cdigoCSV: 'MA1BC2DE3FG4HI' },
  { id: 'sa2', _siiTab: 'issued-previous', invoiceDate: '11/03/2025', documentNo: 'EV-2025-0302', businessPartner: 'A-12345678', businessPartnerIdentifier: 'Transportes Alcántara S.A.',   aeatsiiClaveTipo: 'F1', grandTotalAmount: '2.178,00',  aeatsiiEstado: 'CO', cdigoCSV: 'MA2JK5LM6NO7PQ' },
  { id: 'sa3', _siiTab: 'issued-previous', invoiceDate: '18/03/2025', documentNo: 'EV-2025-0303', businessPartner: 'A-99887766', businessPartnerIdentifier: 'Logística Norte S.A.',         aeatsiiClaveTipo: 'F1', grandTotalAmount: '15.620,00', aeatsiiEstado: 'AE', aeatsiiErrorCode: '1106', aeatsiiErrorMsg: 'Período de liquidación no coincide' },
  { id: 'sa4', _siiTab: 'issued-previous', invoiceDate: '24/03/2025', documentNo: 'EV-2025-0304', businessPartner: 'NL-123456789B01', businessPartnerIdentifier: 'Tech Solutions B.V.',    aeatsiiClaveTipo: 'F1', grandTotalAmount: '3.025,00',  aeatsiiEstado: 'CO', cdigoCSV: 'MA3RS8TU9VW0XY' },
  { id: 'sa5', _siiTab: 'issued-previous', invoiceDate: '28/03/2025', documentNo: 'EV-2025-0305', businessPartner: 'B-55667788', businessPartnerIdentifier: 'Grupo Mediasur, S.L.U.',       aeatsiiClaveTipo: 'F2', grandTotalAmount: '484,00',    aeatsiiEstado: 'IN', aeatsiiErrorCode: '3000', aeatsiiErrorMsg: 'NIF no identificado en el censo de la AEAT' },
  // received — April 2025, suppliers
  { id: 'r1', _siiTab: 'received', invoiceDate: '02/04/2025', documentNo: 'P-2025-0088', businessPartner: 'B-98765432', businessPartnerIdentifier: 'Suministros Técnicos Roca S.L.',aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '5.324,00',  aeatsiiEstado: 'CO', cdigoCSV: 'RC1AB2CD3EF4GH' },
  { id: 'r2', _siiTab: 'received', invoiceDate: '05/04/2025', documentNo: 'P-2025-0089', businessPartner: 'A-91374455', businessPartnerIdentifier: 'Iberdrola Clientes S.A.U.',    aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '842,30',    aeatsiiEstado: 'CO', cdigoCSV: 'RC2IJ5KL6MN7OP' },
  { id: 'r3', _siiTab: 'received', invoiceDate: '09/04/2025', documentNo: 'P-2025-0090', businessPartner: 'B-66554433', businessPartnerIdentifier: 'Arrendamientos Urbanos 2020',  aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '3.630,00',  aeatsiiEstado: 'CO', cdigoCSV: 'RC3QR8ST9UV0WX' },
  { id: 'r4', _siiTab: 'received', invoiceDate: '12/04/2025', documentNo: 'P-2025-0091', businessPartner: 'B-12398765', businessPartnerIdentifier: 'Consulting Iberia S.L.',       aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '11.979,00', aeatsiiEstado: 'AE', aeatsiiErrorCode: '1106', aeatsiiErrorMsg: 'Clave tipo de factura no válida para facturas recibidas' },
  { id: 'r5', _siiTab: 'received', invoiceDate: '16/04/2025', documentNo: 'P-2025-0092', businessPartner: 'A-80018001', businessPartnerIdentifier: 'Telefónica Empresas S.A.',     aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '1.210,00',  aeatsiiEstado: 'CO', cdigoCSV: 'RC4YZ1AB2CD3EF' },
  { id: 'r6', _siiTab: 'received', invoiceDate: '23/04/2025', documentNo: 'P-2025-0093', businessPartner: 'DE-123456789', businessPartnerIdentifier: 'Proveedor Internacional GmbH', aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '7.865,00',  aeatsiiEstado: 'IN', aeatsiiErrorCode: '3002', aeatsiiErrorMsg: 'Fecha de operación fuera del período declarable' },
  { id: 'r7', _siiTab: 'received', invoiceDate: '25/04/2025', documentNo: 'P-2025-0094', businessPartner: 'A-28765432', businessPartnerIdentifier: 'Seguros Generales Reunidos',   aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '2.904,50',  aeatsiiEstado: 'CO', cdigoCSV: 'RC5GH6IJ7KL8MN' },
  { id: 'r8', _siiTab: 'received', invoiceDate: '29/04/2025', documentNo: 'P-2025-0095', businessPartner: 'B-44332211', businessPartnerIdentifier: 'Mantenimientos Globales S.A.', aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '968,00',    aeatsiiEstado: 'PE', cdigoCSV: null },
  // received previous period — March 2025, suppliers
  { id: 'ra1', _siiTab: 'received-previous', invoiceDate: '04/03/2025', documentNo: 'P-2025-0081', businessPartner: 'B-98765432', businessPartnerIdentifier: 'Suministros Técnicos Roca S.L.',aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '3.872,00',  aeatsiiEstado: 'CO', cdigoCSV: 'MB1CD2EF3GH4IJ' },
  { id: 'ra2', _siiTab: 'received-previous', invoiceDate: '10/03/2025', documentNo: 'P-2025-0082', businessPartner: 'A-91374455', businessPartnerIdentifier: 'Iberdrola Clientes S.A.U.',    aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '761,40',    aeatsiiEstado: 'CO', cdigoCSV: 'MB2KL5MN6OP7QR' },
  { id: 'ra3', _siiTab: 'received-previous', invoiceDate: '17/03/2025', documentNo: 'P-2025-0083', businessPartner: 'B-12398765', businessPartnerIdentifier: 'Consulting Iberia S.L.',       aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '9.317,00',  aeatsiiEstado: 'AE', aeatsiiErrorCode: '1106', aeatsiiErrorMsg: 'Clave tipo de factura no válida para facturas recibidas' },
  { id: 'ra4', _siiTab: 'received-previous', invoiceDate: '26/03/2025', documentNo: 'P-2025-0084', businessPartner: 'A-80018001', businessPartnerIdentifier: 'Telefónica Empresas S.A.',     aeatsiiClaveTipoFc: 'F1', grandTotalAmount: '1.089,00',  aeatsiiEstado: 'CO', cdigoCSV: 'MB3ST9UV0WX1YZ' },
];

// ── TBAI — Basque Country, May 2025, shorter document series ─────────────────
// invoice = raw FK id from API; invoiceIdentifier = human-readable document number
export const MOCK_TBAI_ROWS = [
  { id: 't1', invoiceDate: '05/05/2025', invoice: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', invoiceIdentifier: '2025/A/0041', descripcion: 'Consultoría digital: auditoría UX',          estado: 'Recibido'  },
  { id: 't2', invoiceDate: '06/05/2025', invoice: 'B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7', invoiceIdentifier: '2025/A/0042', descripcion: 'Suministro mobiliario oficina Bilbao',        estado: 'Recibido'  },
  { id: 't3', invoiceDate: '08/05/2025', invoice: 'C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8', invoiceIdentifier: '2025/A/0043', descripcion: 'Mantenimiento preventivo maquinaria',         estado: 'Recibido'  },
  { id: 't4', invoiceDate: '09/05/2025', invoice: 'D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9', invoiceIdentifier: '2025/A/0044', descripcion: 'Formación PRL — 12 empleados',                estado: 'Rechazado' },
  { id: 't5', invoiceDate: '12/05/2025', invoice: 'E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0', invoiceIdentifier: '2025/A/0045', descripcion: 'Licencias ERP anual (renovación)',            estado: 'Recibido'  },
  { id: 't6', invoiceDate: '14/05/2025', invoice: 'F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1', invoiceIdentifier: '2025/A/0046', descripcion: 'Transporte mercancía Donostia-Madrid',        estado: 'Error'     },
  { id: 't7', invoiceDate: '16/05/2025', invoice: 'G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2', invoiceIdentifier: '2025/A/0047', descripcion: 'Asesoría fiscal Q2 — Hacienda Foral Bizkaia', estado: 'Recibido'  },
  { id: 't8', invoiceDate: '19/05/2025', invoice: 'H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3', invoiceIdentifier: '2025/A/0048', descripcion: 'Servicio custodia documental mensual',        estado: 'Rechazado' },
  { id: 't9', invoiceDate: '21/05/2025', invoice: 'I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4', invoiceIdentifier: '2025/A/0049', descripcion: 'Consultoría técnica sistemas ERP',             estado: 'Pendiente' },
  { id: 't10',invoiceDate: '23/05/2025', invoice: 'J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5', invoiceIdentifier: '2025/A/0050', descripcion: 'Servicio limpieza oficinas mayo',              estado: 'Pendiente' },
];

// ── Verifactu — AEAT mainland, March 2025, SHA fingerprints, four status types ─
export const MOCK_VF_ROWS = [
  { id: 'v1', invoiceDate: '2025-04-01', invoice: 'SV-2025-1001', issuerTaxID: 'B28912345', typeOperation: 'F1', cSV: 'VFT-8A3F-KL02', verifactuSendingStatus: 'accepted',          codeError: null,   errorReason: null },
  { id: 'v2', invoiceDate: '2025-04-03', invoice: 'SV-2025-1002', issuerTaxID: 'B28912345', typeOperation: 'F1', cSV: 'VFT-9C1D-MN07', verifactuSendingStatus: 'accepted',          codeError: null,   errorReason: null },
  { id: 'v3', invoiceDate: '2025-04-07', invoice: 'SV-2025-1003', issuerTaxID: 'A91234567', typeOperation: 'F2', cSV: 'VFT-2E7G-QR14', verifactuSendingStatus: 'accepted',          codeError: null,   errorReason: null },
  { id: 'v4', invoiceDate: '2025-04-10', invoice: 'SV-2025-1004', issuerTaxID: 'B28912345', typeOperation: 'F1', cSV: 'VFT-5H8J-ST21', verifactuSendingStatus: 'accepted',          codeError: null,   errorReason: null },
  { id: 'v5', invoiceDate: '2025-04-14', invoice: 'SV-2025-1005', issuerTaxID: 'B76543210', typeOperation: 'F1', cSV: 'VFT-3K6L-UV28', verifactuSendingStatus: 'partiallyAccepted', codeError: '1001', errorReason: 'Importe fuera del rango máximo permitido para el tipo de operación' },
  { id: 'v6', invoiceDate: '2025-04-17', invoice: 'SV-2025-1006', issuerTaxID: 'A91234567', typeOperation: 'F3', cSV: null,             verifactuSendingStatus: 'partiallyAccepted', codeError: '1108', errorReason: 'Descripción de la operación no coincide con el tipo declarado' },
  { id: 'v7', invoiceDate: '2025-04-22', invoice: 'SV-2025-1007', issuerTaxID: 'B99887766', typeOperation: 'F1', cSV: null,             verifactuSendingStatus: 'rejected',           codeError: '3005', errorReason: 'NIF del emisor no registrado en el sistema Verifactu' },
  { id: 'v8', invoiceDate: '2025-04-25', invoice: 'SV-2025-1008', issuerTaxID: 'C55443322', typeOperation: 'F1', cSV: null,             verifactuSendingStatus: 'invalid',            codeError: '4002', errorReason: 'Estructura del registro no válida: campo «FechaExpedicion» ausente' },
];

// ── KPI counts consumed by computeKpis ────────────────────────────────────────
// Counts match the mock rows above so KPI cards stay consistent with table data.
export const MOCK_MONITOR_DATA = {
  sii: {
    issued:          { totalCount: 9 },
    received:        { totalCount: 8 },
    issuedPrevious:  { totalCount: 5 },
    receivedPrevious:{ totalCount: 4 },
  },
  tbai: {
    totalCount: 10, receivedCount: 5, rejectedCount: 2, errorCount: 1, pendingCount: 2,
  },
  verifactu: {
    accepted:         { totalCount: 4 },
    partiallyAccepted:{ totalCount: 2 },
    rejected:         { totalCount: 1 },
    invalid:          { totalCount: 1 },
  },
};
