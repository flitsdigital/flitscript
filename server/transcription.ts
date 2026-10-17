import type { Word } from "../src/project/types";

export type TranscribeOptions = { language: string; keyterms: string[] };

/** Seam for swapping speech-to-text vendors. Word times are relative to the start of the audio blob. */
export interface TranscriptionProvider {
  transcribe(audio: Blob, options: TranscribeOptions): Promise<Word[]>;
}

const FORBIDDEN = /[<>{}[\]\\]/;

/** Applies ElevenLabs keyterm rules (<50 chars, ≤5 words, no brackets, max 1000) and drops duplicates. */
export function sanitizeKeyterms(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const term of raw) {
    const clean = term.trim().replace(/\s+/g, " ");
    if (!clean || clean.length >= 50 || clean.split(" ").length > 5 || FORBIDDEN.test(clean)) continue;
    seen.add(clean);
  }
  return [...seen].slice(0, 1000);
}
