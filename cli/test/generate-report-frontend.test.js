import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  generateReportFormComponent,
  generateReportIndex,
  generateAllReport,
} from '../src/generate-frontend.js';

const mockContract = {
  type: 'report',
  process: { name: 'Invoice Report', specName: 'invoice-report', uiPattern: 'S' },
  parameters: [
    { name: 'dateFrom', column: 'DateFrom', type: 'date', tsType: 'string', inputMode: 'date-picker', required: true, defaultValue: '@#Date@' },
    { name: 'dateTo', column: 'DateTo', type: 'date', tsType: 'string', inputMode: 'date-picker', required: true },
    { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', tsType: 'string', inputMode: 'search', required: false, referenceValueId: 'BPartnerRef' },
    { name: 'includeVoided', column: 'IncludeVoided', type: 'boolean', tsType: 'boolean', inputMode: 'checkbox', required: false },
  ],
  apiPrediction: { specName: 'invoice-report', baseUrl: '/sws/neo/invoice-report' },
};

describe('generateReportFormComponent', () => {
  const code = generateReportFormComponent(mockContract);

  it('imports ReportForm from contract-ui', () => {
    assert.ok(code.includes("import { ReportForm } from '@/components/contract-ui'"));
  });

  it('uses correct component name (PascalCase + Report)', () => {
    assert.ok(code.includes('InvoiceReportReport'));
    assert.ok(code.includes('export default function InvoiceReportReport'));
  });

  it('includes all parameter keys', () => {
    assert.ok(code.includes("key: 'dateFrom'"));
    assert.ok(code.includes("key: 'dateTo'"));
    assert.ok(code.includes("key: 'businessPartner'"));
    assert.ok(code.includes("key: 'includeVoided'"));
  });

  it('includes required flag for required params', () => {
    assert.ok(code.includes("required: true"));
  });

  it('includes defaultValue when present', () => {
    assert.ok(code.includes("defaultValue: '@#Date@'"));
  });

  it('includes inputMode as type', () => {
    assert.ok(code.includes("type: 'date-picker'"));
    assert.ok(code.includes("type: 'search'"));
    assert.ok(code.includes("type: 'checkbox'"));
  });

  it('includes reference for FK params with referenceValueId', () => {
    assert.ok(code.includes("reference: 'BPartnerRef'"));
  });

  it('includes reportConfig with generateUrl targeting generateReport endpoint', () => {
    assert.ok(code.includes("generateUrl: '/sws/neo/invoice-report/generateReport'"));
  });

  it('includes reportConfig with specName', () => {
    assert.ok(code.includes("specName: 'invoice-report'"));
  });

  it('includes supportedFormats array', () => {
    assert.ok(code.includes("supportedFormats: ['PDF', 'XLS', 'XLSX', 'HTML', 'CSV']"));
  });

  it('renders ReportForm with report prop instead of process prop', () => {
    assert.ok(code.includes('report={reportConfig}'));
    assert.ok(!code.includes('process={processConfig}'));
  });
});

describe('generateReportIndex', () => {
  const code = generateReportIndex(mockContract);

  it('imports the report component', () => {
    assert.ok(code.includes("import InvoiceReportReport from './InvoiceReportReport'"));
  });

  it('exports App as default', () => {
    assert.ok(code.includes('export default function App'));
  });

  it('passes token and apiBaseUrl props', () => {
    assert.ok(code.includes('token={token}'));
    assert.ok(code.includes('apiBaseUrl={apiBaseUrl}'));
  });

  it('includes reportMeta instead of processMeta', () => {
    assert.ok(code.includes('reportMeta'));
    assert.ok(code.includes("name: 'Invoice Report'"));
    assert.ok(code.includes("specName: 'invoice-report'"));
  });

  it('passes report prop instead of process prop', () => {
    assert.ok(code.includes('report={reportMeta}'));
    assert.ok(!code.includes('process={processMeta}'));
  });
});

describe('generateAllReport', () => {
  const files = generateAllReport(mockContract);

  it('returns correct filenames', () => {
    const keys = Object.keys(files);
    assert.ok(keys.includes('InvoiceReportReport.jsx'));
    assert.ok(keys.includes('index.jsx'));
  });

  it('returns exactly 2 files', () => {
    assert.equal(Object.keys(files).length, 2);
  });

  it('form component file contains ReportForm import', () => {
    assert.ok(files['InvoiceReportReport.jsx'].includes('ReportForm'));
  });

  it('form component file does NOT contain ProcessForm import', () => {
    assert.ok(!files['InvoiceReportReport.jsx'].includes('ProcessForm'));
  });

  it('index file imports the report component', () => {
    assert.ok(files['index.jsx'].includes('InvoiceReportReport'));
  });
});
