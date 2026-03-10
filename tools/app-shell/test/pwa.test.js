import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');

describe('PWA configuration', () => {
  it('vite-plugin-pwa is listed in devDependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(APP_SHELL, 'package.json'), 'utf8'));
    assert.ok(pkg.devDependencies['vite-plugin-pwa'], 'vite-plugin-pwa should be a devDependency');
  });

  it('vite.config.js imports and configures VitePWA', () => {
    const config = readFileSync(resolve(APP_SHELL, 'vite.config.js'), 'utf8');
    assert.ok(config.includes("import { VitePWA } from 'vite-plugin-pwa'"), 'should import VitePWA');
    assert.ok(config.includes("registerType: 'prompt'"), 'should use prompt register type');
    assert.ok(config.includes("cleanupOutdatedCaches: true"), 'should enable cache cleanup');
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
    assert.ok(content.includes('applyUpdate'), 'should provide applyUpdate');
    assert.ok(content.includes('clearCacheAndReload'), 'should provide clearCacheAndReload');
    assert.ok(content.includes('checkForUpdate'), 'should provide checkForUpdate');
  });

  it('UpdateToast component exists and exports showUpdateToast', () => {
    const toastPath = resolve(APP_SHELL, 'src/components/UpdateToast.jsx');
    assert.ok(existsSync(toastPath), 'UpdateToast.jsx should exist');
    const content = readFileSync(toastPath, 'utf8');
    assert.ok(content.includes('export function showUpdateToast'), 'should export showUpdateToast');
    assert.ok(content.includes('duration: Infinity'), 'toast should be persistent');
  });

  it('LoginPage clears caches on login', () => {
    const loginPath = resolve(APP_SHELL, 'src/auth/LoginPage.jsx');
    const content = readFileSync(loginPath, 'utf8');
    assert.ok(content.includes('caches.keys()'), 'should enumerate caches');
    assert.ok(content.includes('caches.delete'), 'should delete caches');
  });

  it('App.jsx wires ServiceWorkerManager with route-based update checks', () => {
    const appPath = resolve(APP_SHELL, 'src/App.jsx');
    const content = readFileSync(appPath, 'utf8');
    assert.ok(content.includes('ServiceWorkerManager'), 'should include ServiceWorkerManager');
    assert.ok(content.includes('useServiceWorker'), 'should use the SW hook');
    assert.ok(content.includes('showUpdateToast'), 'should show update toast');
    assert.ok(content.includes('location.pathname'), 'should check updates on route change');
  });

  it('main.jsx renders Toaster from sonner', () => {
    const mainPath = resolve(APP_SHELL, 'src/main.jsx');
    const content = readFileSync(mainPath, 'utf8');
    assert.ok(content.includes("import { Toaster } from 'sonner'"), 'should import Toaster from sonner');
    assert.ok(content.includes('<Toaster'), 'should render Toaster');
  });

  it('favicon.png exists in public/ for the PWA icon', () => {
    const iconPath = resolve(APP_SHELL, 'public/favicon.png');
    assert.ok(existsSync(iconPath), 'favicon.png should exist for PWA icon');
  });
});
