const DEFAULT_MIN_TOKEN_LENGTH = 2;

/**
 * Tokenize human text without stripping non-Latin scripts.
 * Intl.Segmenter provides usable word boundaries for languages that do not
 * separate every word with spaces. The regex path is a safe runtime fallback.
 */
export function tokenizeUnicodeText(
  value: string,
  options?: {
    stopWords?: ReadonlySet<string>;
    minimumLength?: number;
  },
): string[] {
  const normalized = value.normalize('NFKC').toLocaleLowerCase().trim();
  if (!normalized) return [];

  const stopWords = options?.stopWords ?? new Set<string>();
  const minimumLength = options?.minimumLength ?? DEFAULT_MIN_TOKEN_LENGTH;
  const tokens: string[] = [];

  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const segment of segmenter.segment(normalized)) {
      if (!segment.isWordLike) continue;
      const token = segment.segment.trim();
      if (
        token.length >= minimumLength &&
        /[\p{L}\p{N}]/u.test(token) &&
        !stopWords.has(token)
      ) {
        tokens.push(token);
      }
    }
  } else {
    for (const match of normalized.matchAll(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)) {
      const token = match[0];
      if (token.length >= minimumLength && !stopWords.has(token)) {
        tokens.push(token);
      }
    }
  }

  return [...new Set(tokens)];
}
