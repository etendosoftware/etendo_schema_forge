// Vitest tests for FmCatalogPage's ETP-5187 IAE-activity reminder trigger:
// `toggleModel` calls `showIaeActivityReminder` ONLY on Modelo 303's
// inactive → active transition — never on deactivation, never for any other
// model. See FmCatalogPage.jsx's own comment above `toggleModel`.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  X: () => null,
  Check: () => null,
  Star: () => null,
}));
vi.mock('../FmOverlays.jsx', () => ({
  ConfigDrawer: () => null,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../fiscalModelsUtils.js', () => ({
  showIaeActivityReminder: vi.fn(),
}));

import FmCatalogPage from '../FmCatalogPage.jsx';
import { showIaeActivityReminder } from '../fiscalModelsUtils.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// Re-sorting on every toggle (active models first) makes switch INDEX unstable
// across clicks — always look up the switch by which card (badge text) it
// belongs to, never by position.
function switchFor(container, modelId) {
  const card = Array.from(container.querySelectorAll('.fm-catalog-card'))
    .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === modelId);
  return card.querySelector('[role="switch"]');
}

describe('FmCatalogPage — IAE activity reminder trigger', () => {
  it('fires when toggling 303 from inactive to active', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    fireEvent.click(switchFor(container, '303'));
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when toggling 303 from active to inactive (deactivation)', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(switchFor(container, '303'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('does NOT fire when toggling a different model (349) active', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': true, '349': false }} />
    );
    fireEvent.click(switchFor(container, '349'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('does NOT fire when toggling 349 off then back on (349 is never the trigger)', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    fireEvent.click(switchFor(container, '349')); // 349 off
    fireEvent.click(switchFor(container, '349')); // 349 back on
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('fires exactly once per activation, even if 303 is toggled off and back on again in the same session', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    fireEvent.click(switchFor(container, '303')); // 303 on
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);

    fireEvent.click(switchFor(container, '303')); // 303 off
    fireEvent.click(switchFor(container, '303')); // 303 on again
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(2);
  });

  it('passes the i18n translate function and navigate through to showIaeActivityReminder', () => {
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    fireEvent.click(switchFor(container, '303'));
    const [t, navigate] = showIaeActivityReminder.mock.calls[0];
    expect(typeof t).toBe('function');
    expect(typeof navigate).toBe('function');
  });
});
