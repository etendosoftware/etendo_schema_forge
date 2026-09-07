import { describe, expect, it } from 'vitest';
import { rankVectorMatches } from '../vectorSearchRanking.js';

const match = (score, name) => ({ score, fields: { name } });

describe('rankVectorMatches', () => {
  it('keeps a concentrated high-score cluster compact', () => {
    const result = rankVectorMatches([
      match(0.84, 'Pan artesano'),
      match(0.82, 'Pan integral'),
      match(0.81, 'Pan de centeno'),
      match(0.80, 'Pan brioche'),
      match(0.79, 'Pan rallado'),
    ], 'pan');

    expect(result.concentrated).toBe(true);
    expect(result.relevant).toHaveLength(5);
    expect(result.exact).toHaveLength(5);
    expect(result.related).toHaveLength(0);
  });

  it('exposes a wider band when scores are dispersed', () => {
    const result = rankVectorMatches([
      match(0.82, 'Salmón atlántico'),
      match(0.68, 'Trucha ahumada'),
      match(0.63, 'Filete de pescado'),
      match(0.58, 'Marisco congelado'),
      match(0.52, 'Carne de ternera'),
    ], 'salmon');

    expect(result.concentrated).toBe(false);
    expect(result.exact).toHaveLength(1);
    expect(result.relevant).toHaveLength(1);
    expect(result.related.length).toBeGreaterThan(1);
    expect(result.related.some(({ fields }) => fields.name === 'Marisco congelado')).toBe(true);
    expect(result.related.some(({ fields }) => fields.name === 'Carne de ternera')).toBe(false);
  });

  it('promotes an exact lexical match even with a lower vector score', () => {
    const result = rankVectorMatches([
      match(0.80, 'Bebida de avena'),
      match(0.48, 'Pan'),
    ], 'pan');

    expect(result.relevant.map(({ fields }) => fields.name)).toContain('Pan');
  });

  it('separates a strong partial text match from a related semantic match', () => {
    const result = rankVectorMatches([
      match(0.81, 'Claras pasteurizadas 500ml'),
      match(0.74, 'Bebida de avena 1L'),
    ], 'claras pasteurizadas 250ml');

    expect(result.exact.map(({ fields }) => fields.name)).toEqual(['Claras pasteurizadas 500ml']);
    expect(result.semantic.map(({ fields }) => fields.name)).toEqual(['Bebida de avena 1L']);
  });
});
