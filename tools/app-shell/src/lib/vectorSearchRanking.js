const RELATED_SCORE_FLOOR = 0.55;
const HIGH_SCORE_FLOOR = 0.72;
const CONCENTRATION_COEFFICIENT = 0.12;
// Noise detection. A vector index always returns its nearest neighbours, even for gibberish
// ("zzzz" scores 0.78-0.80 across ten rows), so no fixed score floor separates noise from a
// real query. What differs is the shape: a real query has a head that stands out from the pack
// (e.g. 0.86 vs a 0.74 runner-up), noise is a plateau. With at least MIN candidates and no text
// match, the result is noise when best - median < FLAT_DISTRIBUTION_MARGIN.
const FLAT_DISTRIBUTION_MIN_CANDIDATES = 3;
const FLAT_DISTRIBUTION_MARGIN = 0.06;

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hasLexicalMatch(fields, query) {
  const normalizedFields = Object.values(fields || {}).map(normalizeSearchText);
  if (normalizedFields.some((value) => value.includes(query))) return true;
  const tokens = query.split(/\s+/).filter((token) => token.length > 2);
  if (tokens.length < 2) return false;
  const matchedTokens = tokens.filter((token) => normalizedFields.some((value) => value.includes(token)));
  return matchedTokens.length >= Math.ceil(tokens.length * 0.6);
}

function statistics(scores) {
  if (scores.length === 0) return { mean: 0, deviation: 0, coefficient: 0 };
  const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
  const variance = scores.reduce((total, score) => total + ((score - mean) ** 2), 0) / scores.length;
  const deviation = Math.sqrt(variance);
  return { mean, deviation, coefficient: mean > 0 ? deviation / mean : 0 };
}

function median(sortedDescending) {
  const middle = Math.floor(sortedDescending.length / 2);
  return sortedDescending.length % 2
    ? sortedDescending[middle]
    : (sortedDescending[middle - 1] + sortedDescending[middle]) / 2;
}

/**
 * Splits candidates using the score distribution instead of a global threshold.
 * Exact lexical matches are always promoted; concentrated high scores stay compact,
 * while dispersed scores expose a wider related set. When nothing matches textually and the
 * scores form a plateau (see FLAT_DISTRIBUTION_MARGIN) the candidates are noise: semantic and
 * related come back empty so the caller can show its empty state.
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
  const hasTextMatch = ordered.some(({ match }) => hasLexicalMatch(match.fields, normalizedQuery));
  const flat = !hasTextMatch
    && scores.length >= FLAT_DISTRIBUTION_MIN_CANDIDATES
    && scores[0] - median(scores) < FLAT_DISTRIBUTION_MARGIN;
  const semanticCutoff = Math.max(HIGH_SCORE_FLOOR, (scores[0] ?? 0) - 0.08);
  ordered.forEach(({ match, score }) => {
    const lexicalMatch = hasLexicalMatch(match.fields, normalizedQuery);
    if (flat) return;
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
