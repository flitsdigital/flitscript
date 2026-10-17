import type { CaptionGroup, StylePreset, Word } from "../project/types";

const PAUSE = 0.25;
/** How long a group stays up after its last word when nothing follows straight away. */
const LINGER = 0.5;
const ENDS_CLAUSE = /[.!?,;:…]["'”’)]*$/;

type Limits = Pick<StylePreset, "maxWordsPerGroup" | "maxCharsPerLine" | "maxLines"> & Partial<Pick<StylePreset, "accentRate">>;

/** Greedy line packing by character count; a word longer than a line gets a line of its own. */
export function countLines(texts: readonly string[], maxChars: number): number {
  let lines = 0;
  let length = Infinity;
  for (const text of texts) {
    if (length + 1 + text.length <= maxChars) length += 1 + text.length;
    else {
      lines++;
      length = text.length;
    }
  }
  return lines;
}

const isOrphan = (chunk: Word[]) => chunk.length === 1 && chunk[0]!.text.replace(/[^\p{L}\p{N}]/gu, "").length <= 1;

const letters = (w: Word) => w.text.replace(/[^\p{L}\p{N}]/gu, "").length;

/** Placeholder for real judgement: the longest word carries the most meaning often enough. */
export function pickAccent(chunk: readonly Word[]): string {
  return chunk.reduce((best, w) => (letters(w) > letters(best) ? w : best)).id;
}

/**
 * Accent words for `rate` (0..1) of the blocks: the blocks whose longest word is longest win,
 * ties go to the earlier block. 0 means no automatic accents at all (fully manual).
 */
export function autoAccents(chunks: readonly (readonly Word[])[], rate: number): string[][] {
  const count = Math.round(Math.min(Math.max(rate, 0), 1) * chunks.length);
  const ranked = chunks
    .map((chunk, i) => ({ i, score: Math.max(...chunk.map(letters)) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count);
  const chosen = new Set(ranked.map((r) => r.i));
  return chunks.map((chunk, i) => (chosen.has(i) ? [pickAccent(chunk)] : []));
}

/** Deterministically cuts a transcript into caption groups. */
export function segmentWords(words: readonly Word[], limits: Limits): CaptionGroup[] {
  const chunks: Word[][] = [];
  let current: Word[] = [];
  for (const word of words) {
    const prev = current[current.length - 1];
    if (
      prev &&
      (current.length >= limits.maxWordsPerGroup ||
        ENDS_CLAUSE.test(prev.text) ||
        word.start - prev.end > PAUSE ||
        countLines([...current, word].map((w) => w.text), limits.maxCharsPerLine) > limits.maxLines)
    ) {
      chunks.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) chunks.push(current);

  // A lone one-letter word reads as a glitch; fold it into a neighbour even if that exceeds the limits by one word.
  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1 && isOrphan(chunks[i]!)) {
      if (i + 1 < chunks.length) chunks[i + 1]!.unshift(...chunks[i]!);
      else chunks[i - 1]!.push(...chunks[i]!);
      chunks.splice(i, 1);
      i--;
    }
  }

  const accents = autoAccents(chunks, limits.accentRate ?? 1);
  return chunks.map((chunk, i) => {
    const last = chunk[chunk.length - 1]!;
    const nextStart = chunks[i + 1]?.[0]!.start ?? Infinity;
    return {
      id: `g${i}`,
      wordIds: chunk.map((w) => w.id),
      start: chunk[0]!.start,
      end: Math.min(last.end + LINGER, nextStart),
      accentWordIds: accents[i]!,
    };
  });
}
