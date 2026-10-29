// @covers tools/app-shell/src/windows/custom/fiscal-models/catalogAvailability.js
// The split of the fiscal models catalog answer into active models and the models the backend
// marks unavailable (backend-only flag `fiscal-model-390`): the `_unavailable` marker is metadata,
// never a model, and with no answer at all the 390 stays hidden.

import {
  UNAVAILABLE_KEY,
  splitCatalogAnswer,
  filterAvailableModels,
  unavailableWithoutAnswer,
} from '../catalogAvailability.js';

describe('splitCatalogAnswer', () => {
  it('splits the marker off: activeModels holds only models, unavailableModels lists the ids', () => {
    expect(splitCatalogAnswer({ 303: true, 349: false, [UNAVAILABLE_KEY]: ['390'] })).toEqual({
      activeModels: { 303: true, 349: false },
      unavailableModels: ['390'],
    });
  });

  it('uses "_unavailable" as the marker key', () => {
    expect(UNAVAILABLE_KEY).toBe('_unavailable');
  });

  it('removes a listed id from activeModels even when the answer also sends it as active', () => {
    const { activeModels, unavailableModels } = splitCatalogAnswer({ 303: true, 390: true, _unavailable: ['390'] });
    expect(activeModels).toEqual({ 303: true });
    expect('390' in activeModels).toBe(false);
    expect(unavailableModels).toEqual(['390']);
  });

  it('normalises the listed ids to strings', () => {
    expect(splitCatalogAnswer({ 390: true, _unavailable: [390] })).toEqual({
      activeModels: {},
      unavailableModels: ['390'],
    });
  });

  it('answers the plain catalog and no unavailable model when there is no marker (flag on)', () => {
    expect(splitCatalogAnswer({ 303: true, 390: true })).toEqual({
      activeModels: { 303: true, 390: true },
      unavailableModels: [],
    });
  });

  it('ignores a marker that is not an array', () => {
    expect(splitCatalogAnswer({ 303: true, _unavailable: '390' })).toEqual({
      activeModels: { 303: true },
      unavailableModels: [],
    });
  });

  it('does not mutate the answer it is given', () => {
    const answer = { 303: true, 390: true, _unavailable: ['390'] };
    splitCatalogAnswer(answer);
    expect(answer).toEqual({ 303: true, 390: true, _unavailable: ['390'] });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', '{"303":true}'],
    ['a number', 42],
    ['a boolean', true],
  ])('answers an empty split for %s', (_name, body) => {
    expect(splitCatalogAnswer(body)).toEqual({ activeModels: {}, unavailableModels: [] });
  });

  it('answers an empty split for an empty catalog {}', () => {
    expect(splitCatalogAnswer({})).toEqual({ activeModels: {}, unavailableModels: [] });
  });

  it('never surfaces array indices as models for an array body', () => {
    const { activeModels, unavailableModels } = splitCatalogAnswer(['303', '390']);
    expect(Object.values(activeModels)).not.toContain(true);
    expect(unavailableModels).toEqual([]);
  });
});

describe('filterAvailableModels', () => {
  const MODELS = [{ id: '303' }, { id: '349' }, { id: '390' }];

  it('drops the models marked unavailable, keeping the order of the rest', () => {
    expect(filterAvailableModels(MODELS, ['390']).map(m => m.id)).toEqual(['303', '349']);
  });

  it('returns the same array when nothing is unavailable', () => {
    expect(filterAvailableModels(MODELS, [])).toBe(MODELS);
    expect(filterAvailableModels(MODELS)).toBe(MODELS);
  });

  it('ignores unavailable ids that are not in the registry', () => {
    expect(filterAvailableModels(MODELS, ['999']).map(m => m.id)).toEqual(['303', '349', '390']);
  });

  it('does not mutate the registry list', () => {
    filterAvailableModels(MODELS, ['303', '390']);
    expect(MODELS.map(m => m.id)).toEqual(['303', '349', '390']);
  });
});

describe('unavailableWithoutAnswer', () => {
  it('hides the 390 while there is no catalog answer (fail hidden)', () => {
    expect(unavailableWithoutAnswer()).toEqual(['390']);
  });

  it('returns a fresh, mutable array on every call', () => {
    const first = unavailableWithoutAnswer();
    const second = unavailableWithoutAnswer();
    expect(first).not.toBe(second);
    first.push('303');
    expect(unavailableWithoutAnswer()).toEqual(['390']);
  });
});
