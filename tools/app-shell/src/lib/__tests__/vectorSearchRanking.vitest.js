// @covers tools/app-shell/src/lib/vectorSearchRanking.js
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

  describe('noise detection (no text match and a flat score distribution)', () => {
    const invoice = (score, documentNo) => ({ score, fields: { documentNo } });

    it('treats gibberish as noise: ten near-identical scores and no text match show nothing', () => {
      const flat = [0.80, 0.80, 0.79, 0.79, 0.79, 0.79, 0.78, 0.78, 0.78, 0.78]
        .map((score, i) => invoice(score, `F-${i}`));
      const result = rankVectorMatches(flat, 'zzzz');

      expect(result.exact).toEqual([]);
      expect(result.semantic).toEqual([]);
      expect(result.related).toEqual([]);
      expect(result.relevant).toEqual([]);
    });

    it('keeps a text match and the remaining candidates under the usual rules when one result stands out', () => {
      const result = rankVectorMatches([
        { score: 0.86, fields: { Name: 'Britney Spears', Value: 'T-1' } },
        { score: 0.74, fields: { Name: 'Otro tercero', Value: 'T-2' } },
        { score: 0.70, fields: { Name: 'Tercero tres', Value: 'T-3' } },
      ], 'Britney');

      expect(result.exact.map(({ fields }) => fields.Name)).toEqual(['Britney Spears']);
      expect(result.semantic).toEqual([]);
      expect(result.related.map(({ fields }) => fields.Name)).toEqual(['Otro tercero', 'Tercero tres']);
    });

    it('keeps a semantic search without text match when the top result clearly stands out', () => {
      const result = rankVectorMatches([
        match(0.88, 'Bebida vegetal'),
        match(0.70, 'Pan integral'),
        match(0.69, 'Salmón'),
        match(0.66, 'Carne'),
      ], 'leche de soja');

      expect(result.exact).toEqual([]);
      expect(result.semantic.map(({ fields }) => fields.name)).toEqual(['Bebida vegetal']);
    });

    it('does not apply flat detection to fewer than three candidates', () => {
      expect(rankVectorMatches([], 'zzzz').relevant).toEqual([]);
      const one = rankVectorMatches([match(0.80, 'Algo')], 'zzzz');
      expect(one.semantic).toHaveLength(1);
      const two = rankVectorMatches([match(0.80, 'Algo'), match(0.79, 'Otro')], 'zzzz');
      expect(two.semantic.length + two.related.length).toBe(2);
    });

    it('never discards a text match even when every score is flat', () => {
      const flat = [0.80, 0.79, 0.79, 0.78].map((score, i) => match(score, i === 3 ? 'Zzzz SL' : `F-${i}`));
      const result = rankVectorMatches(flat, 'zzzz');

      expect(result.exact.map(({ fields }) => fields.name)).toEqual(['Zzzz SL']);
    });
  });
});
