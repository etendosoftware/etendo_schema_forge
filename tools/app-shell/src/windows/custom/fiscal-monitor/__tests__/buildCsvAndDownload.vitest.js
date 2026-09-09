// Mock heavy FmPrimitives dependencies before importing the module.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildCsvAndDownload } from '../FmPrimitives.jsx';

// ------------------------------------------------------------------
// DOM stubs — reinstalled before every test so tests are independent
// ------------------------------------------------------------------

let anchorStub;
let blobContents;

function installDomMocks() {
  anchorStub = { click: vi.fn(), href: '', download: '' };

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') return anchorStub;
    // Fall back to real implementation for anything else
    return document.createElement.wrappedJSObject
      ? document.createElement.wrappedJSObject(tag)
      : Object.assign(document.createElement.original(tag), {});
  });

  vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

  // Capture Blob contents
  blobContents = null;
  const OriginalBlob = globalThis.Blob;
  vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts, opts) {
    blobContents = parts;
    return new OriginalBlob(parts, opts);
  });
}

const COLS = [
  { label: 'Name',   get: r => r.name },
  { label: 'Amount', get: r => r.amount },
];

describe('buildCsvAndDownload — CSV format', () => {
  beforeEach(installDomMocks);
  afterEach(() => vi.restoreAllMocks());

  it('starts with a UTF-8 BOM character', () => {
    buildCsvAndDownload('test', COLS, [{ name: 'Alice', amount: '100' }]);
    const csv = blobContents[0];
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('header row contains quoted column labels', () => {
    buildCsvAndDownload('test', COLS, []);
    const csv = blobContents[0];
    expect(csv).toContain('"Name"');
    expect(csv).toContain('"Amount"');
  });

  it('header columns are joined by commas', () => {
    buildCsvAndDownload('test', COLS, []);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('"Name","Amount"');
  });

  it('data rows are serialized using get functions', () => {
    buildCsvAndDownload('test', COLS, [{ name: 'Alice', amount: '100' }]);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[1]).toBe('"Alice","100"');
  });

  it('multiple rows each appear on their own line', () => {
    const rows = [
      { name: 'Alice', amount: '100' },
      { name: 'Bob',   amount: '200' },
    ];
    buildCsvAndDownload('test', COLS, rows);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('quotes inside values are escaped as double-quotes', () => {
    buildCsvAndDownload('test', COLS, [{ name: 'He said "hi"', amount: '0' }]);
    const csv = blobContents[0];
    expect(csv).toContain('"He said ""hi"""');
  });

  it('null get result becomes an empty quoted cell', () => {
    const colsWithNull = [{ label: 'X', get: () => null }];
    buildCsvAndDownload('test', colsWithNull, [{}]);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[1]).toBe('""');
  });

  it('undefined get result becomes an empty quoted cell', () => {
    const colsWithUndef = [{ label: 'X', get: () => undefined }];
    buildCsvAndDownload('test', colsWithUndef, [{}]);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[1]).toBe('""');
  });
});

describe('buildCsvAndDownload — filename handling', () => {
  beforeEach(installDomMocks);
  afterEach(() => vi.restoreAllMocks());

  it('appends .csv when the filename has no extension', () => {
    buildCsvAndDownload('my_export', COLS, []);
    expect(anchorStub.download).toBe('my_export.csv');
  });

  it('does not double-append .csv when filename already ends with .csv', () => {
    buildCsvAndDownload('my_export.csv', COLS, []);
    expect(anchorStub.download).toBe('my_export.csv');
  });
});

describe('buildCsvAndDownload — browser download mechanics', () => {
  beforeEach(installDomMocks);
  afterEach(() => vi.restoreAllMocks());

  it('sets the anchor href to the object URL', () => {
    buildCsvAndDownload('test', COLS, []);
    expect(anchorStub.href).toBe('blob:mock');
  });

  it('appends the anchor to document.body', () => {
    buildCsvAndDownload('test', COLS, []);
    expect(document.body.appendChild).toHaveBeenCalledWith(anchorStub);
  });

  it('calls click() on the anchor to trigger the download', () => {
    buildCsvAndDownload('test', COLS, []);
    expect(anchorStub.click).toHaveBeenCalledOnce();
  });

  it('removes the anchor from document.body after click', () => {
    buildCsvAndDownload('test', COLS, []);
    expect(document.body.removeChild).toHaveBeenCalledWith(anchorStub);
  });

  it('revokes the object URL after click', () => {
    buildCsvAndDownload('test', COLS, []);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

// ETP-5032 / SEC-04 — these exports carry AEAT-returned free text (error reasons,
// `descripcionOperacion`, invoice descriptions), so a value starting with a formula
// trigger would evaluate in the recipient's spreadsheet (CWE-1236). The POLICY is the
// shared `neutralizeSpreadsheetCell`; the always-quote style, LF line ending and BOM are
// this path's own observable format and the suite above pins them unchanged.
describe('buildCsvAndDownload — spreadsheet formula neutralization', () => {
  beforeEach(installDomMocks);
  afterEach(() => vi.restoreAllMocks());

  /** The data line of a one-row, one-column export of `value`. */
  function exportedCell(value) {
    buildCsvAndDownload('test', [{ label: 'X', get: () => value }], [{}]);
    return blobContents[0].replace(/^﻿/, '').split('\n')[1];
  }

  it.each([
    ['equals', '=1+1', '"\'=1+1"'],
    ['plus', '+SUM(A1:A2)', '"\'+SUM(A1:A2)"'],
    ['minus', '-CMD', '"\'-CMD"'],
    ['at sign', '@SUM(A1:A2)', '"\'@SUM(A1:A2)"'],
    ['DDE payload', "+cmd|' /C calc'!A0", '"\'+cmd|\' /C calc\'!A0"'],
    ['marker behind spaces', '   =1+1', '"\'   =1+1"'],
    ['standalone TAB', '\tText', '"\'\tText"'],
    ['full-width equals', '＝1+1', '"\'＝1+1"'],
    ['negative number', '-500.00', '"\'-500.00"'],
    ['already neutralized', "'=1+1", '"\'=1+1"'],
    ['plain text', 'Normal Value', '"Normal Value"'],
  ])('neutralizes %s', (_label, input, expected) => {
    expect(exportedCell(input)).toBe(expected);
  });

  it('neutralizes the HYPERLINK payload and doubles its quotes inside one cell', () => {
    expect(exportedCell('=HYPERLINK("http://example.com","Click")'))
      .toBe('"\'=HYPERLINK(""http://example.com"",""Click"")"');
  });

  it('neutralizes a formula-shaped column label too', () => {
    buildCsvAndDownload('test', [{ label: '=1+1', get: () => 'v' }], []);
    expect(blobContents[0].replace(/^﻿/, '').split('\n')[0]).toBe('"\'=1+1"');
  });

  it('never double-prefixes an already neutralized value', () => {
    expect(exportedCell("'=1+1")).not.toContain("''");
  });
});

describe('buildCsvAndDownload — edge cases', () => {
  beforeEach(installDomMocks);
  afterEach(() => vi.restoreAllMocks());

  it('does not crash when rows is an empty array', () => {
    expect(() => buildCsvAndDownload('test', COLS, [])).not.toThrow();
  });

  it('produces only the header line for an empty rows array', () => {
    buildCsvAndDownload('test', COLS, []);
    const csv = blobContents[0];
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(1);
  });

  it('does not crash when a get function returns a number', () => {
    const numCols = [{ label: 'Qty', get: r => r.qty }];
    expect(() => buildCsvAndDownload('test', numCols, [{ qty: 42 }])).not.toThrow();
    const csv = blobContents[0];
    expect(csv).toContain('"42"');
  });
});
