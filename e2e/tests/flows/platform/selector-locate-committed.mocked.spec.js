// @covers tools/app-shell/src/components/contract-ui/SearchPopup.jsx
// @covers tools/app-shell/src/components/contract-ui/useLocateCommittedValue.js
// @covers tools/app-shell/src/components/contract-ui/LocatingNotice.jsx
// @covers tools/app-shell/src/components/contract-ui/AccountSelect.jsx
// @covers tools/app-shell/src/components/contract-ui/useAccountSelectorPages.js
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Account picker reopening on a committed value past its first page — real browser layout
 * (jsdom cannot measure it). Contact category > Accounting tab > "Cuenta a cobrar" opens the
 * shared SearchPopup over a mocked selector of 300 accounts, 100 per page, each page delayed.
 * The committed account sits at row 118, so it needs the second page.
 *
 * A requestAnimationFrame sampler (installed before the page boots) records every frame of the
 * popup list. The contract: the rows are never visible before the value is centred, the list does
 * not grow under the user's eyes, and the first visible frame already has the value centred and
 * `aria-selected`, with `scrollTop` never changing afterwards.
 *
 * The Accounting tab panel exists only with the `contact-category-type` flag ON, fixed when Vite
 * starts (no runtime override), so the spec skips itself unless told the server was started so:
 *   cd tools/app-shell && VITE_FEATURE_FLAGS='{"contact-category-type":true}' npx vite --port 3190
 *   cd e2e && E2E_USE_MOCK=1 BASE_URL=http://localhost:3190 E2E_CONTACT_CATEGORY_TYPE_FLAG=on \
 *     npx playwright test tests/flows/platform/selector-locate-committed.mocked.spec.js --project=mocked
 */
const FLAG_ON = process.env.E2E_CONTACT_CATEGORY_TYPE_FLAG === 'on';

const TOTAL = 300;
const COMMITTED = 118;
const PAGE_DELAY_MS = 500;
const CATEGORY = { id: 'cat-1', name: 'Clientes', etgoIscustomer: true, etgoIsvendor: false };
const ACCOUNTING_ROW = {
  id: 'acct-1',
  customerReceivablesNo: `acc-${COMMITTED}`,
  'customerReceivablesNo$_identifier': `${String(COMMITTED).padStart(4, '0')} - Account ${COMMITTED}`,
};
const FIELD_TESTID = 'bp-category-acct-customerReceivablesNo';
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const account = (n) => ({ id: `acc-${n}`, name: `${String(n).padStart(4, '0')} - Account ${n}` });

/** Samples the popup list on every animation frame into `window.__frames`. */
function installSampler(page, popupTestId) {
  return page.addInitScript((testId) => {
    window.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      const popup = document.querySelector(`[data-testid="${testId}"]`);
      const list = popup?.querySelector('[role="listbox"]');
      if (list) {
        const options = [...list.querySelectorAll('[role="option"]')];
        const committed = list.querySelector('[data-testid$="-option-acc-118"]');
        const listRect = list.getBoundingClientRect();
        const optRect = committed?.getBoundingClientRect();
        window.__frames.push({
          t: Math.round(performance.now() - t0),
          rows: options.length,
          visibleRows: options.filter((o) => getComputedStyle(o).visibility !== 'hidden').length,
          overflowY: getComputedStyle(list).overflowY,
          scrollHeight: list.scrollHeight,
          clientHeight: list.clientHeight,
          scrollTop: Math.round(list.scrollTop),
          selected: committed?.getAttribute('aria-selected') ?? null,
          centreOffset: optRect ? Math.round((optRect.top - listRect.top) + optRect.height / 2 - list.clientHeight / 2) : null,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, popupTestId);
}

test.describe('Account picker — locating the committed value (real layout)', () => {
  test.skip(!FLAG_ON, 'The Accounting panel needs contact-category-type ON (E2E_CONTACT_CATEGORY_TYPE_FLAG=on)');

  test('rows stay hidden until the committed value is centred, then never move', async ({ page }) => {
    const selectorRequests = [];
    await installSampler(page, `${FIELD_TESTID}-popup`);
    await login(page);
    await page.route('**/sws/neo/business-partner-category/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/sws/neo/business-partner-category', '');
      if (path.startsWith('/accounting/selectors/')) {
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset') || 0);
        selectorRequests.push({ path, limit, offset });
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        const items = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, i) => account(offset + i));
        return json(route, { items, hasMore: offset + limit < TOTAL });
      }
      if (path.startsWith('/accounting')) return json(route, { response: { data: [ACCOUNTING_ROW], totalRows: 1 } });
      if (path.startsWith('/businessPartnerCategory/cat-1')) return json(route, { response: { data: [CATEGORY], totalRows: 1 } });
      if (path.endsWith('/evaluate-display') || path.endsWith('/defaults')) return json(route, { response: { data: [] } });
      return route.fallback();
    });

    await page.goto('/business-partner-category/cat-1');
    const trigger = page.getByTestId(`field-${FIELD_TESTID}`);
    // The Accounting tab is the default one; open it only if the strip starts elsewhere.
    if (!(await trigger.isVisible().catch(() => false))) await page.getByRole('button', { name: /Contabilidad/ }).click();
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const popup = page.getByTestId(`${FIELD_TESTID}-popup`);
    await expect(popup).toBeVisible();
    const selected = popup.getByTestId(`${FIELD_TESTID}-popup-option-acc-${COMMITTED}`);
    await expect(selected).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
    await expect(popup.getByTestId(`${FIELD_TESTID}-popup-locating`)).toHaveCount(0);
    await page.waitForTimeout(1500); // keep sampling: nothing may move after the reveal

    const frames = await page.evaluate(() => window.__frames);
    const withRows = frames.filter((f) => f.rows > 0);
    const firstVisible = withRows.findIndex((f) => f.visibleRows > 0);
    const timeline = withRows.filter((f, i) => i === 0 || i === firstVisible || f.scrollHeight !== withRows[i - 1].scrollHeight || f.visibleRows !== withRows[i - 1].visibleRows || f.scrollTop !== withRows[i - 1].scrollTop)
      .map((f) => `t=${f.t} rows=${f.rows} visible=${f.visibleRows} overflowY=${f.overflowY} scrollH=${f.scrollHeight} scrollTop=${f.scrollTop} sel=${f.selected} centreOffset=${f.centreOffset}`);
    console.log(`REQUESTS ${JSON.stringify(selectorRequests)}\nTIMELINE (${frames.length} frames)\n${timeline.join('\n')}`);

    // Requests: 100-row pages (the picker's own size is 30); the walk's last page is trimmed to the
    // walk total of 6 x 30 = 180 rows, so the second page asks for 80.
    expect(selectorRequests.map((r) => r.offset)).toEqual([0, 100]);
    expect(selectorRequests.map((r) => r.limit)).toEqual([100, 80]);

    // Rows were laid out (so they could be measured) but invisible before the reveal.
    expect(firstVisible).toBeGreaterThan(0);
    const held = withRows.slice(0, firstVisible);
    expect(held.every((f) => f.visibleRows === 0)).toBe(true);
    // The scrollbar is hidden for the whole hold: a list growing from 100 to 200 rows never shows.
    expect(held.every((f) => f.overflowY === 'hidden')).toBe(true);

    // The first visible frame already has the value centred and marked; nothing moves after it.
    const reveal = withRows[firstVisible];
    expect(reveal.selected).toBe('true');
    expect(Math.abs(reveal.centreOffset)).toBeLessThanOrEqual(4);
    expect(reveal.rows).toBeGreaterThan(100); // the second page had landed
    const after = withRows.slice(firstVisible);
    expect(after.every((f) => f.visibleRows === f.rows)).toBe(true);
    expect(after.every((f) => Math.abs(f.scrollTop - reveal.scrollTop) <= 1)).toBe(true);
    expect(after.every((f) => f.scrollHeight === reveal.scrollHeight)).toBe(true);
  });
});
