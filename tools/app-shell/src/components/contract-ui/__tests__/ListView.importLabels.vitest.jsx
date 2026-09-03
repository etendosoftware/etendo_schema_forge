import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ETP-4669: ListView is the functional side of the two-repo import contract — it builds the
// nested `labels` object (shape owned by app-shell-core's ImportDialog) from useUI() and passes
// it plus `translate={ui}`. These tests mock ImportDialog to capture exactly what ListView
// hands it, so a missing slice, a wrong key, or a dropped translator is caught here rather than
// only surfacing as untranslated UI at runtime.

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

// Richer than the sibling ListView.import.vitest.jsx mock: echoes the key, and when params are
// supplied returns `key(values)` so the (n) => string labels can be asserted to actually thread
// their count through, not just return a constant.
const ui = (key, params) => (params ? `${key}(${Object.values(params).join(',')})` : key);
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  useUI: () => ui,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
    items: [], loading: false, loadingMore: false, hasMore: false,
    refresh: vi.fn(), loadMore: vi.fn(),
    sortColumn: 'creationDate', sortDirection: 'desc',
    setSortColumn: vi.fn(), setSortDirection: vi.fn(),
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));
vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

const captured = vi.hoisted(() => ({}));
vi.mock('@etendosoftware/app-shell-core/components/import/ImportDialog.jsx', () => ({
  ImportDialog: (props) => {
    captured.props = props;
    return props.open ? <div data-testid="ImportDialog__mock" /> : null;
  },
}));

import { ListView } from '../ListView.jsx';

function MockTable() {
  return <table data-testid="mock-table"><tbody /></table>;
}

const defaultProps = {
  entity: 'testEntity',
  Table: MockTable,
  entityLabel: 'Test Entity',
  windowName: 'test-entity',
  token: 'fake-token',
  apiBaseUrl: 'http://localhost/api',
  import: { enabled: true, spec: 'contacts', fields: [] },
};

function openImport() {
  render(<ListView {...defaultProps} />);
  fireEvent.click(screen.getByTestId('ListView__importButton'));
  return captured.props;
}

describe('ListView — import labels + translator forwarded to ImportDialog', () => {
  it('passes a labels object with every documented sub-slice and the ui translator', () => {
    const { labels, translate } = openImport();
    // Root chrome.
    expect(labels.title).toBe('importDialogTitle');
    expect(labels.revalidating).toBe('importRevalidating');
    expect(labels.downloadTemplate).toBe('importDownloadTemplate');
    // Every child sub-slice present.
    for (const slice of ['dropzone', 'progress', 'mapping', 'confirm', 'fileError', 'reviewQueue', 'systemError']) {
      expect(labels[slice], `missing slice: ${slice}`).toBeTypeOf('object');
    }
    // The translator handed to the send pipeline is the same useUI function.
    expect(translate).toBe(ui);
  });

  it('resolves each child sub-slice key through useUI (including generic keys reused per the i18n guide)', () => {
    const { labels } = openImport();
    expect(labels.dropzone.dropHere).toBe('importDropHere');
    // ETP-4997: the hint carries a {formats} placeholder that ImportDropzone fills from the
    // window's own `formats` declaration, so it can no longer name formats the input rejects.
    expect(labels.dropzone.dropHint).toBe('importDropHintFormats');
    expect(labels.progress.title).toBe('importProgressTitle');
    expect(labels.mapping.notImported).toBe('importNotImported');
    // Reused generic keys — not import-prefixed, per the "reuse before adding" rule.
    expect(labels.mapping.save).toBe('save');
    expect(labels.mapping.cancel).toBe('cancel');
    expect(labels.fileError.retry).toBe('retry');
    expect(labels.confirm.confirm).toBe('importConfirmButton');
    expect(labels.reviewQueue.filterAll).toBe('importFilterAll');
    expect(labels.reviewQueue.retry).toBe('retry');
    expect(labels.systemError.title).toBe('importSystemErrorTitle');
    expect(labels.systemError.close).toBe('close');
  });

  it('builds the count-templated labels as functions that thread their argument through the translator', () => {
    const { labels } = openImport();
    expect(labels.importButton).toBeTypeOf('function');
    expect(labels.importButton(5)).toBe('importButtonCount(5)');
    expect(labels.confirm.willImport(3)).toBe('importWillImport(3)');
    expect(labels.confirm.willSkip(2)).toBe('importWillSkip(2)');
  });
});
