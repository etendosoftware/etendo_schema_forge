import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OnboardingWizard.jsx'), 'utf8');

describe('OnboardingWizard — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OnboardingWizard/);
  });

  it('imports useUI and useLocaleSwitch from @/i18n', () => {
    assert.match(src, /useUI.*useLocaleSwitch.*from.*@\/i18n/);
  });

  it('imports buildOnboardingPayloads and resolveSystem from fiscalConfig.utils', () => {
    assert.match(src, /buildOnboardingPayloads/);
    assert.match(src, /resolveSystem/);
    assert.match(src, /from.*fiscalConfig\.utils/);
  });

  it('composes SiiSection, TbaiSection, VerifactuSection via refs', () => {
    assert.match(src, /SiiSection/);
    assert.match(src, /TbaiSection/);
    assert.match(src, /VerifactuSection/);
    assert.match(src, /siiRef/);
    assert.match(src, /tbaiRef/);
    assert.match(src, /verifactuRef/);
  });
});

describe('OnboardingWizard — territory metadata', () => {
  it('defines TERRITORY_META with all 7 Spanish territories', () => {
    assert.match(src, /navarra/);
    assert.match(src, /alava/);
    assert.match(src, /bizkaia/);
    assert.match(src, /gipuzkoa/);
    assert.match(src, /baleares/);
    assert.match(src, /canarias/);
    assert.match(src, /ceuta/);
  });

  it('groups territories into 3 regimes: sii_foral, tbai, siiver', () => {
    assert.match(src, /sii_foral/);
    assert.match(src, /['"]tbai['"]/);
    assert.match(src, /siiver/);
  });

  it('resolves territory display names via ui() to stay i18n-safe', () => {
    assert.match(src, /ui\(['"]fiscal\.territory\.navarra['"]\)/);
    assert.match(src, /ui\(['"]fiscal\.territory\.alava['"]\)/);
  });
});

describe('OnboardingWizard — wizard steps', () => {
  it('starts on the territory step', () => {
    assert.match(src, /useState\(['"]territory['"]\)/);
  });

  it('has confirm, detail, applied, skipped, manual and subquestion steps', () => {
    assert.match(src, /step === ['"]confirm['"]/);
    assert.match(src, /step === ['"]detail['"]/);
    assert.match(src, /step === ['"]applied['"]/);
    assert.match(src, /step === ['"]skipped['"]/);
    assert.match(src, /step === ['"]manual['"]/);
    assert.match(src, /step === ['"]subquestion['"]/);
  });

  it('renders the territory title on the territory step', () => {
    assert.match(src, /fiscal\.onboarding\.territory\.title/);
  });

  it('renders the confirm title on the confirm step', () => {
    assert.match(src, /fiscal\.onboarding\.confirm\.title/);
  });
});

describe('OnboardingWizard — territory selection', () => {
  it('resets sub-questions when territory changes', () => {
    assert.match(src, /setAlsoNational\(null\)/);
    assert.match(src, /setVolume\(null\)/);
    assert.match(src, /setLowChoice\(null\)/);
  });

  it('uses canContinueSubQ to guard the Continue button for territories with sub-questions', () => {
    assert.match(src, /canContinueSubQ/);
    assert.match(src, /askNational/);
    assert.match(src, /askVolume/);
  });
});

describe('OnboardingWizard — system resolution', () => {
  it('resolves system from regime + sub-question answers', () => {
    assert.match(src, /resolveSystem\(\{.*regime/s);
  });

  it('allows manual system override', () => {
    assert.match(src, /manualSystem/);
    assert.match(src, /manualSystem \?\? resolveSystem/);
  });

  it('supports SII, TBAI, SII+TBAI and VERIFACTU system IDs', () => {
    assert.match(src, /['"]SII['"]/);
    assert.match(src, /['"]TBAI['"]/);
    assert.match(src, /['"]SII\+TBAI['"]/);
    assert.match(src, /['"]VERIFACTU['"]/);
  });
});

describe('OnboardingWizard — record creation', () => {
  it('creates records by POSTing to each fiscal config endpoint', () => {
    assert.match(src, /sii-config/);
    assert.match(src, /tbai-config/);
    assert.match(src, /verifactu-config/);
  });

  it('advances to the detail step after successful record creation', () => {
    assert.match(src, /goTo\(['"]detail['"]\)/);
  });

  it('uses buildOnboardingPayloads to compute the POST bodies', () => {
    assert.match(src, /buildOnboardingPayloads\(sys, terrId\)/);
  });
});

describe('OnboardingWizard — detail step save', () => {
  it('calls siiRef.save() for SII system', () => {
    assert.match(src, /siiRef\.current\?\.save\(\)/);
  });

  it('calls both siiRef and tbaiRef for SII+TBAI system', () => {
    assert.match(src, /Promise\.allSettled/);
  });

  it('advances to the applied step after detail save', () => {
    assert.match(src, /goTo\(['"]applied['"]\)/);
  });
});

describe('OnboardingWizard — certificate upload', () => {
  it('opens a CertModal when cert upload is triggered', () => {
    assert.match(src, /CertModal/);
    assert.match(src, /certModalOpen/);
    assert.match(src, /setCertModalOpen/);
  });

  it('uses getCertificateContext to determine which cert context to show', () => {
    assert.match(src, /getCertificateContext/);
  });
});

describe('OnboardingWizard — navigation', () => {
  it('provides a Continue button (fiscal.onboarding.continue)', () => {
    assert.match(src, /fiscal\.onboarding\.continue/);
  });

  it('provides a Back button (fiscal.onboarding.back)', () => {
    assert.match(src, /fiscal\.onboarding\.back/);
  });

  it('calls onComplete or onGoHome on final step', () => {
    assert.match(src, /onComplete/);
    assert.match(src, /onGoHome/);
  });
});

// Guards: applied step auto-checks cert status so "Upload certificate [PENDING]" is not
// shown as pending when the user already uploaded it during the detail step.
describe('OnboardingWizard — cert status fetch on applied step', () => {
  it('imports useEffect', () => {
    assert.match(src, /useEffect/);
  });

  it('fetches certificate status when step is applied', () => {
    assert.match(src, /step.*applied[\s\S]*?certificate|certificate[\s\S]*?step.*applied/);
  });

  it('calls setCert with the loaded cert data when the API returns exists: true', () => {
    assert.match(src, /data\?\.exists[\s\S]*?setCert|setCert[\s\S]*?data\?\.exists/);
  });

  it('fetches certificate via apiFetch with orgId query param', () => {
    assert.match(src, /apiFetch\(`\/certificate\?\$\{new URLSearchParams\(\{ orgId \}\)\}`\)/);
  });
});

// Guards: wizard summary (applied step) must not include removed placeholder items
describe('OnboardingWizard — applied step NextItems', () => {
  it('does not include "Schedule first test submission" text in the source', () => {
    assert.doesNotMatch(src, /Schedule first test/);
  });

  it('does not include "Ask Copilot" text in the source', () => {
    assert.doesNotMatch(src, /Ask Copilot/);
  });
});
