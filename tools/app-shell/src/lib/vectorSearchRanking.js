const RELATED_SCORE_FLOOR = 0.55;
const HIGH_SCORE_FLOOR = 0.72;
const CONCENTRATION_COEFFICIENT = 0.12;

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function statistics(scores) {
  if (scores.length === 0) return { mean: 0, deviation: 0, coefficient: 0 };
  const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
  const variance = scores.reduce((total, score) => total + ((score - mean) ** 2), 0) / scores.length;
  const deviation = Math.sqrt(variance);
  return { mean, deviation, coefficient: mean > 0 ? deviation / mean : 0 };
}

/**
 * Splits candidates using the score distribution instead of a global threshold.
 * Exact lexical matches are always promoted; concentrated high scores stay compact,
 * while dispersed scores expose a wider related set.
 */
export function rankVectorMatches(matches = [], query = '', expanded = false) {
  const normalizedQuery = normalizeSearchText(query.trim());
  const ordered = matches
    .map((match, index) => ({ match, index, score: Number(match.score) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const scores = ordered.map(({ score }) => score);
  const { mean, deviation, coefficient } = statistics(scores);
  const highScoreCount = scores.filter((score) => score >= HIGH_SCORE_FLOOR).length;
  const concentrated = highScoreCount >= Math.ceil(scores.length / 2) && coefficient <= CONCENTRATION_COEFFICIENT;
  const cutoff = concentrated
    ? Math.max(HIGH_SCORE_FLOOR, mean - deviation)
    : Math.max(RELATED_SCORE_FLOOR, mean - deviation);

  const exact = [];
  const semantic = [];
  const related = [];
  const semanticCutoff = Math.max(HIGH_SCORE_FLOOR, (scores[0] ?? 0) - 0.08);
  ordered.forEach(({ match, score }) => {
    const lexicalMatch = Object.values(match.fields || {})
      .some((value) => normalizeSearchText(value).includes(normalizedQuery));
    if (lexicalMatch) exact.push(match);
    else if (score >= semanticCutoff && score >= cutoff) semantic.push(match);
    else if (score >= RELATED_SCORE_FLOOR) related.push(match);
  });

  return {
    exact,
    semantic,
    relevant: expanded ? [...exact, ...semantic, ...related] : [...exact, ...semantic],
    related,
    concentrated,
    mean,
    deviation,
    cutoff,
  };
}
