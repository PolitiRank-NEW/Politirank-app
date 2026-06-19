/**
 * Sentiment analysis utility for Brazilian Portuguese comments.
 * Rule-based implementation focused on high performance and zero external dependencies.
 */

export const SENTIMENT_SCORES = {
  POSITIVE: 1.0,
  NEUTRAL: 0.0,
  NEGATIVE: -1.0
} as const;

export type SentimentFactor = typeof SENTIMENT_SCORES[keyof typeof SENTIMENT_SCORES];

const POSITIVE_KEYWORDS = [
  'linda', 'maravilhosa', 'perfeita', 'amei', 'parabens', 'parabéns', 
  'voto', 'melhor', 'ganhou', 'top', 'show', 'diva', 'gata', 'amada',
  'lindo', 'excelente', 'avante', 'sucesso', 'amando', 'querida', 'querido',
  'orgulho', 'brilha', 'abencoada', 'abençoada', 'deus', 'amor', 'coracao', 'coração',
  '🙌', '👏', '🔥', '❤️', '😍', '🔝', '🚀', '✅', '🙏'
];

const NEGATIVE_KEYWORDS = [
  'lixo', 'pessimo', 'péssimo', 'horrivel', 'horrível', 'mentira', 'falso',
  'corrupto', 'ladrao', 'ladrão', 'crime', 'vergonha', 'ridiculo', 'ridículo',
  'odio', 'ódio', 'odeio', 'triste', 'decepcionada', 'decepcionado', 'traidor',
  'traicao', 'traição', 'covarde', 'hipocrita', 'hipócrita', 'fora', 'tchau',
  '🤮', '💩', '🤡', '👎', '😡', '🤬'
];

/**
 * Analyzes the sentiment of a text based on keyword hits.
 * Returns a number from -1.0 to 1.0
 */
export function analyzeSentiment(text: string): number {
  if (!text) return SENTIMENT_SCORES.NEUTRAL;

  const lowerText = text.toLowerCase();
  
  let positiveScore = 0;
  let negativeScore = 0;

  POSITIVE_KEYWORDS.forEach(word => {
    if (lowerText.includes(word)) positiveScore++;
  });

  NEGATIVE_KEYWORDS.forEach(word => {
    if (lowerText.includes(word)) negativeScore++;
  });

  if (positiveScore > negativeScore) return SENTIMENT_SCORES.POSITIVE;
  if (negativeScore > positiveScore) return SENTIMENT_SCORES.NEGATIVE;
  
  return SENTIMENT_SCORES.NEUTRAL;
}

/**
 * Calculates a weight multiplier for the leadership ranking score
 * based on the sentiment score.
 */
export function getSentimentWeight(sentiment: number): number {
  if (sentiment > 0) return 2.0; // Positive engagement counts double
  if (sentiment < 0) return 0.5; // Negative engagement is deprioritized
  return 1.0; // Standard engagement
}
