function approximateTokenCount(text: string): number {
  return Math.floor(text.split(/\s+/).filter(Boolean).length * 1.3);
}

function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function wordsForTokens(tokenCount: number): number {
  return Math.max(1, Math.floor(tokenCount / 1.3));
}

function getOverlapTail(
  sentences: string[],
  overlapTokens: number
): { sentences: string[]; tokenCount: number } {
  const tail: string[] = [];
  let tokenCount = 0;

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index];
    const sentenceTokens = approximateTokenCount(sentence);
    if (tokenCount + sentenceTokens > overlapTokens) {
      break;
    }
    tail.unshift(sentence);
    tokenCount += sentenceTokens;
  }

  return { sentences: tail, tokenCount };
}

export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 100
): string[] {
  if (!text.trim()) {
    return [];
  }

  const sentences = splitSentences(text);
  if (!sentences.length) {
    return [];
  }

  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = approximateTokenCount(sentence);

    if (sentenceTokens > chunkSize) {
      if (currentSentences.length) {
        chunks.push(currentSentences.join(" "));
        const overlapTail = getOverlapTail(currentSentences, overlap);
        currentSentences = overlapTail.sentences;
        currentTokens = overlapTail.tokenCount;
      }

      const words = sentence.split(/\s+/).filter(Boolean);
      let wordChunk: string[] = [];
      let wordTokens = 0;

      for (const word of words) {
        const nextWordTokens = approximateTokenCount(word);
        if (wordTokens + nextWordTokens > chunkSize && wordChunk.length) {
          chunks.push(wordChunk.join(" "));
          wordChunk = wordChunk.slice(-wordsForTokens(overlap));
          wordTokens = approximateTokenCount(wordChunk.join(" "));
        }

        wordChunk.push(word);
        wordTokens += nextWordTokens;
      }

      if (wordChunk.length) {
        currentSentences = [wordChunk.join(" ")];
        currentTokens = approximateTokenCount(currentSentences[0]);
      }
      continue;
    }

    if (currentTokens + sentenceTokens > chunkSize && currentSentences.length) {
      chunks.push(currentSentences.join(" "));
      const overlapTail = getOverlapTail(currentSentences, overlap);
      currentSentences = overlapTail.sentences;
      currentTokens = overlapTail.tokenCount;
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentSentences.length) {
    chunks.push(currentSentences.join(" "));
  }

  return chunks;
}

export { approximateTokenCount };
