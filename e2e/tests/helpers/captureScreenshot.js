const truthyValues = new Set(['1', 'true', 'yes']);

export const captureScreenshots = truthyValues.has(
  String(process.env.E2E_CAPTURE_SCREENSHOTS || '').toLowerCase(),
);

export async function captureScreenshot(page, options) {
  if (!captureScreenshots) return;
  await page.screenshot(options);
}
