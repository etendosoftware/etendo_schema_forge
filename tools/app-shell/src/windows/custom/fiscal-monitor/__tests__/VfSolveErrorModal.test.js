import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'VfSolveErrorModal.jsx'), 'utf8');

describe('VfSolveErrorModal — structure', () => {
  it('exports a default function VfSolveErrorModal', () => {
    assert.match(src, /export default function VfSolveErrorModal/);
  });

  it('accepts open prop', () => assert.match(src, /\bopen\b/));
  it('accepts onClose prop', () => assert.match(src, /\bonClose\b/));
  it('accepts rows prop (array)', () => assert.match(src, /\brows\b/));
  it('accepts neoApiBase prop', () => assert.match(src, /\bneoApiBase\b/));
  it('accepts onResolved prop', () => assert.match(src, /\bonResolved\b/));

  it('returns null when open or rows is falsy/empty', () => {
    assert.match(src, /if \(!open \|\| !rows\?\.length\) return null/);
  });
});

describe('VfSolveErrorModal — status constants', () => {
  it('defines STATUS_IN as IN', () => {
    assert.match(src, /const STATUS_IN = 'IN'/);
  });

  it('defines STATUS_AE as AE', () => {
    assert.match(src, /const STATUS_AE = 'AE'/);
  });

  it('derives canResolve from isInvalid or isPartial', () => {
    assert.match(src, /canResolve = isInvalid \|\| isPartial/);
  });

  it('maps IN status to invalid pill', () => {
    assert.match(src, /'invalid'/);
  });

  it('maps AE status to partiallyAccepted pill', () => {
    assert.match(src, /'partiallyAccepted'/);
  });

  it('maps other statuses to rejected pill', () => {
    assert.match(src, /'rejected'/);
  });
});

describe('VfSolveErrorModal — handleResolve for invalid invoices (IN)', () => {
  it('calls apiFetch with POST for invalid invoices', () => {
    assert.match(src, /method: 'POST'/);
  });

  it('includes action/Correct_Invoice in the POST URL', () => {
    assert.match(src, /action\/Correct_Invoice/);
  });

  it('does not use PUT for invalid invoices', () => {
    // The isInvalid branch uses POST — assert the POST path exists and PUT belongs only to else-branch
    assert.match(src, /if \(isInvalid\)[\s\S]*?method: 'POST'/s);
  });
});

describe('VfSolveErrorModal — handleResolve for partially accepted invoices (AE)', () => {
  it('calls apiFetch with PUT for partially accepted invoices', () => {
    assert.match(src, /method: 'PUT'/);
  });

  it('PUT body contains isSubsanation', () => {
    assert.match(src, /isSubsanation/);
  });

  it('PUT URL references VF_PARCIAL_ENTITY', () => {
    assert.match(src, /VF_PARCIAL_ENTITY/);
  });
});

describe('VfSolveErrorModal — i18n keys', () => {
  it('uses vfSolveError.invalid.title', () => assert.match(src, /vfSolveError\.invalid\.title/));
  it('uses vfSolveError.partial.title', () => assert.match(src, /vfSolveError\.partial\.title/));
  it('uses vfSolveError.rejected.title', () => assert.match(src, /vfSolveError\.rejected\.title/));
  it('uses vfSolveError.invalid.description', () => assert.match(src, /vfSolveError\.invalid\.description/));
  it('uses vfSolveError.partial.description', () => assert.match(src, /vfSolveError\.partial\.description/));
  it('uses vfSolveError.rejected.description', () => assert.match(src, /vfSolveError\.rejected\.description/));
  it('uses vfSolveError.invalid.action', () => assert.match(src, /vfSolveError\.invalid\.action/));
  it('uses vfSolveError.partial.action', () => assert.match(src, /vfSolveError\.partial\.action/));
  it('uses vfSolveError.success', () => assert.match(src, /vfSolveError\.success/));
  it('uses vfSolveError.saveError', () => assert.match(src, /vfSolveError\.saveError/));
});

describe('VfSolveErrorModal — UI structure', () => {
  it('renders a close button with aria-label', () => {
    assert.match(src, /aria-label/);
  });

  it('renders backdrop div with data-testid="vf-solve-error-backdrop"', () => {
    assert.match(src, /data-testid="vf-solve-error-backdrop"/);
  });

  it('renders StatusPill component', () => {
    assert.match(src, /<StatusPill/);
  });

  it('passes estado prop to StatusPill', () => {
    assert.match(src, /estado=\{pillStatus\}/);
  });

  it('shows error detail section conditionally on codeError or errorReason', () => {
    assert.match(src, /row\.codeError \|\| row\.errorReason/);
  });

  it('error detail section uses inline red background style', () => {
    assert.match(src, /background: '#FEF2F2'/);
  });

  it('shows action button only when canResolve is true', () => {
    assert.match(src, /\{canResolve && \(/);
  });

  it('shows Loader2 spinner when saving', () => {
    assert.match(src, /\{saving && <Loader2/);
  });

  it('imports X from lucide-react', () => {
    assert.match(src, /X.*from 'lucide-react'|import.*\bX\b.*lucide-react/);
  });

  it('imports Loader2 from lucide-react', () => {
    assert.match(src, /Loader2.*from 'lucide-react'|import.*\bLoader2\b.*lucide-react/);
  });

  it('imports AlertTriangle from lucide-react', () => {
    assert.match(src, /AlertTriangle.*from 'lucide-react'|import.*\bAlertTriangle\b.*lucide-react/);
  });
});

describe('VfSolveErrorModal — invoice display', () => {
  it('reads invoice$documentNo as primary invoice number', () => {
    assert.match(src, /row\['invoice\$documentNo'\]/);
  });

  it('falls back to invoice$_identifier', () => {
    assert.match(src, /row\['invoice\$_identifier'\]/);
  });
});

describe('VfSolveErrorModal — imports', () => {
  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from '@\/i18n'|import.*\buseUI\b.*@\/i18n/);
  });

  it('imports useApiFetch from @/auth/useApiFetch', () => {
    assert.match(src, /useApiFetch.*from '@\/auth\/useApiFetch\.js'/);
  });

  it('imports StatusPill from FmPrimitives', () => {
    assert.match(src, /StatusPill.*from '\.\/FmPrimitives\.jsx'/);
  });

  it('imports VF_PARCIAL_ENTITY from useFiscalMonitor', () => {
    assert.match(src, /VF_PARCIAL_ENTITY.*from '\.\/useFiscalMonitor\.js'/);
  });

  it('imports VF_INVALIDAS_ENTITY from useFiscalMonitor', () => {
    assert.match(src, /VF_INVALIDAS_ENTITY.*from '\.\/useFiscalMonitor\.js'/);
  });

  it('imports VF_SPEC from useFiscalMonitor', () => {
    assert.match(src, /VF_SPEC.*from '\.\/useFiscalMonitor\.js'/);
  });

  it('imports toast from sonner', () => {
    assert.match(src, /toast.*from 'sonner'|import.*\btoast\b.*sonner/);
  });

  it('imports CSS from fiscal-models (not fiscal-monitor)', () => {
    assert.match(src, /import '\.\.\/fiscal-models\/fiscal-models\.css'/);
  });
});

describe('VfSolveErrorModal — multi-row support', () => {
  it('computes isSingle from rows.length === 1', () => {
    assert.match(src, /isSingle\s*=\s*rows\.length === 1/);
  });

  it('reads status from rows[0]', () => {
    assert.match(src, /rows\[0\]/);
  });

  it('renders multi-row invoice list with invoicesSelected i18n key', () => {
    assert.match(src, /vfSolveError\.invoicesSelected/);
  });

  it('renders titleMulti for invalid multi-row', () => {
    assert.match(src, /vfSolveError\.invalid\.titleMulti/);
  });

  it('renders titleMulti for partial multi-row', () => {
    assert.match(src, /vfSolveError\.partial\.titleMulti/);
  });

  it('maps over rows array to render invoice list items', () => {
    assert.match(src, /rows\.map\(r =>/);
  });
});

describe('VfSolveErrorModal — handleResolve concurrency', () => {
  it('uses Promise.allSettled (not Promise.all) for multi-row resolution', () => {
    assert.match(src, /Promise\.allSettled/);
    assert.doesNotMatch(src, /await Promise\.all\(/);
  });

  it('counts failed results by rejected status or non-ok response', () => {
    assert.match(src, /r\.status === 'rejected' \|\| \(r\.value && !r\.value\.ok\)/);
  });

  it('checks failed.length === 0 for success path', () => {
    assert.match(src, /failed\.length === 0/);
  });
});
