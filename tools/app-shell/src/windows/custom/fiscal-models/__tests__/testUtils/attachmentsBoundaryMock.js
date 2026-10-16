/**
 * Boundary stub for `@/components/attachments`, for FmModel page suites that do not
 * test the receipt ("Justificante") tab.
 *
 * Usage, in the test file (vi.mock must stay there to be hoisted):
 *   vi.mock('@/components/attachments', () => import('<rel>/testUtils/attachmentsBoundaryMock.js'));
 *
 * Why a boundary stub instead of the real tab: AttachmentsTab renders the generic
 * DataTable (ETP-5526), whose import graph pulls icons and hooks that these suites'
 * closed `lucide-react` / `@/i18n` mocks do not list, so the files failed at import
 * time. The receipt tab keeps its integrated coverage in
 * `models/349/__tests__/FmModel349Page.receiptTab.realAttachments.vitest.jsx` and its
 * mocked coverage in the `*.receiptTab.vitest.jsx` suites.
 *
 * The page reads `{ upload, count }` from useAttachments; `count` is left undefined so
 * the page's own `= null` default applies, as when the real hook had nothing to report.
 */
import { vi } from 'vitest';

export const AttachmentsTab = () => null;
export const useAttachments = () => ({ upload: vi.fn() });
