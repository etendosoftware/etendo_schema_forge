import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');

let builtArtifacts = null;

function readBuiltArtifacts() {
  if (!builtArtifacts) {
    execFileSync('npm', ['run', 'build', '--workspace=@schema-forge/app-shell'], {
      cwd: resolve(APP_SHELL, '..', '..'),
      stdio: 'pipe',
    });
    builtArtifacts = {
      indexHtml: readFileSync(resolve(APP_SHELL, 'dist/index.html'), 'utf8'),
      sw: readFileSync(resolve(APP_SHELL, 'dist/sw.js'), 'utf8'),
    };
  }

  return builtArtifacts;
}

describe('PWA configuration', () => {
  it('vite-plugin-pwa is listed in devDependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(APP_SHELL, 'package.json'), 'utf8'));
    assert.ok(pkg.devDependencies['vite-plugin-pwa'], 'vite-plugin-pwa should be a devDependency');
  });

  it('vite.config.js imports and configures VitePWA', () => {
    const config = readFileSync(resolve(APP_SHELL, 'vite.config.js'), 'utf8');
    assert.ok(config.includes("import { VitePWA } from 'vite-plugin-pwa'"), 'should import VitePWA');
    assert.ok(config.includes("registerType: 'autoUpdate'"), 'should use autoUpdate register type');
    assert.ok(config.includes("cleanupOutdatedCaches: true"), 'should enable cache cleanup');
  });

  it('service worker navigation fallback excludes backend and discovery routes', () => {
    const config = readFileSync(resolve(APP_SHELL, 'vite.config.js'), 'utf8');
    assert.ok(config.includes('navigateFallbackDenylist'), 'should configure a navigation fallback denylist');
    assert.ok(config.includes('/^\\/etendo\\//'), 'should denylist backend /etendo routes');
    assert.ok(config.includes('/^\\/mcp(?:\\/|$)/'), 'should denylist the public MCP endpoint');
    assert.ok(config.includes('/^\\/\\.well-known\\//'), 'should denylist OAuth/MCP discovery metadata');
    assert.ok(!config.includes('/^\\/authorize'), 'should keep the SPA /authorize route cacheable');
  });

  it('manifest includes required PWA fields', () => {
    const config = readFileSync(resolve(APP_SHELL, 'vite.config.js'), 'utf8');
    assert.ok(config.includes("name: 'Etendo'"), 'manifest should have name');
    assert.ok(config.includes("display: 'standalone'"), 'manifest should use standalone display');
    assert.ok(config.includes("theme_color: '#1863DC'"), 'manifest should have theme color');
  });

  it('useServiceWorker hook exists and exports expected functions', () => {
    const hookPath = resolve(APP_SHELL, 'src/hooks/useServiceWorker.js');
    assert.ok(existsSync(hookPath), 'useServiceWorker.js should exist');
    const content = readFileSync(hookPath, 'utf8');
    assert.ok(content.includes('export function useServiceWorker'), 'should export useServiceWorker');
    assert.ok(content.includes('clearCacheAndReload'), 'should provide clearCacheAndReload');
    assert.ok(content.includes('checkForUpdate'), 'should provide checkForUpdate');
    assert.ok(content.includes('controllerchange'), 'should listen for controllerchange');
  });

  it('UpdateToast component exists and exports showUpdateToast', () => {
    const toastPath = resolve(APP_SHELL, 'src/components/UpdateToast.jsx');
    assert.ok(existsSync(toastPath), 'UpdateToast.jsx should exist');
    const content = readFileSync(toastPath, 'utf8');
    assert.ok(content.includes('export function showUpdateToast'), 'should export showUpdateToast');
    assert.ok(content.includes('duration: Infinity'), 'toast should be persistent');
  });

  it('OnboardingPage clears SW caches on environment login', () => {
    const onboardingPath = resolve(APP_SHELL, 'src/pages/OnboardingPage.jsx');
    const content = readFileSync(onboardingPath, 'utf8');
    assert.ok(content.includes('caches.keys()'), 'should enumerate caches');
    assert.ok(content.includes('caches.delete'), 'should delete caches');
  });

  it('App.jsx wires ServiceWorkerManager with route-based update checks', () => {
    const appPath = resolve(APP_SHELL, 'src/App.jsx');
    const content = readFileSync(appPath, 'utf8');
    assert.ok(content.includes('ServiceWorkerManager'), 'should include ServiceWorkerManager');
    assert.ok(content.includes('useServiceWorker'), 'should use the SW hook');
    assert.ok(content.includes('location.pathname'), 'should check updates on route change');
  });

  it('main.jsx renders Toaster from sonner', () => {
    const mainPath = resolve(APP_SHELL, 'src/main.jsx');
    const content = readFileSync(mainPath, 'utf8');
    assert.ok(content.includes("import { Toaster } from 'sonner'"), 'should import Toaster from sonner');
    assert.ok(content.includes('<Toaster'), 'should render Toaster');
  });

  it('production build fingerprints assets so immutable caching stays correct', () => {
    const { indexHtml, sw } = readBuiltArtifacts();

    assert.match(
      indexHtml,
      /assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.js/
    );
    assert.match(
      indexHtml,
      /assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.css/
    );
    assert.ok(
      !sw.includes('url:"assets/index.js",revision:null'),
      'service worker should not precache a stable /assets/index.js URL'
    );
    assert.ok(
      !sw.includes('url:"assets/index.css",revision:null'),
      'service worker should not precache a stable /assets/index.css URL'
    );
  });

  it('production service worker does not fallback backend routes to index.html', () => {
    const { sw } = readBuiltArtifacts();

    assert.match(sw, /denylist:\[[^\]]*\/\^\\\/etendo\\\//, 'SW should denylist /etendo navigations');
    assert.match(sw, /denylist:\[[^\]]*\/\^\\\/mcp/, 'SW should denylist /mcp navigations');
    assert.match(sw, /denylist:\[[^\]]*\/\^\\\/\\\.well-known\\\//, 'SW should denylist /.well-known navigations');
    assert.doesNotMatch(sw, /\/\^\\\/authorize/, 'SW should not denylist the SPA /authorize route');
  });

  it('favicon.png exists in public/ for the PWA icon', () => {
    const iconPath = resolve(APP_SHELL, 'public/favicon.png');
    assert.ok(existsSync(iconPath), 'favicon.png should exist for PWA icon');
  });
});
