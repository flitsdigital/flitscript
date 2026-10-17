import { describe, expect, it } from "vitest";
import { mapElevenLabsWords } from "./elevenlabs";
import { sanitizeKeyterms } from "./transcription";

describe("sanitizeKeyterms", () => {
  it("trims, dedupes and drops terms ElevenLabs rejects", () => {
    expect(
      sanitizeKeyterms([" Flits Digital ", "Flits  Digital", "", "a b c d e f", "x".repeat(50), "bad{term}", "Lelystad"]),
    ).toEqual(["Flits Digital", "Lelystad"]);
  });
});

describe("mapElevenLabsWords", () => {
  it("keeps only timed words and converts logprob to confidence", () => {
    const words = mapElevenLabsWords({
      language_code: "nld",
      text: "Hallo wereld",
      words: [
        { text: "Hallo", type: "word", logprob: 0, start: 0.1, end: 0.4, speaker_id: "speaker_0" },
        { text: " ", type: "spacing", logprob: 0, start: 0.4, end: 0.5 },
        { text: "(gelach)", type: "audio_event", logprob: 0, start: 0.5, end: 0.6 },
        { text: "wereld", type: "word", logprob: Math.log(0.5), start: 0.5, end: 0.9, speaker_id: null },
      ],
    });
    expect(words).toEqual([
      { id: "w0", text: "Hallo", start: 0.1, end: 0.4, confidence: 1, speaker: "speaker_0" },
      { id: "w1", text: "wereld", start: 0.5, end: 0.9, confidence: 0.5, speaker: null },
    ]);
  });

  it("rejects malformed responses", () => {
    expect(() => mapElevenLabsWords({ words: [{ text: 1 }] })).toThrow();
  });
});
