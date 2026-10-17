import { describe, expect, it } from "vitest";
import type { Word } from "../project/types";
import { countLines, pickAccent, segmentWords } from "./segment";

/** Words 0.3 s long with 0.05 s gaps unless a gap is given. */
function makeWords(spec: string, gaps: Record<number, number> = {}): Word[] {
  let t = 0;
  return spec.split(" ").map((text, i) => {
    t += gaps[i] ?? (i === 0 ? 0 : 0.05);
    const word = { id: `w${i}`, text, start: t, end: t + 0.3, confidence: 1, speaker: null };
    t += 0.3;
    return word;
  });
}

const limits = { maxWordsPerGroup: 3, maxCharsPerLine: 16, maxLines: 2 };
const texts = (words: Word[], groups: ReturnType<typeof segmentWords>) =>
  groups.map((g) => g.wordIds.map((id) => words.find((w) => w.id === id)!.text).join(" "));

describe("segmentWords", () => {
  it("respects the maximum words per group", () => {
    const words = makeWords("een twee drie vier vijf zes zeven");
    expect(texts(words, segmentWords(words, limits))).toEqual(["een twee drie", "vier vijf zes", "zeven"]);
  });

  it("breaks after punctuation", () => {
    const words = makeWords("En nee, het is geen olie. Dit is AdBlue.");
    expect(texts(words, segmentWords(words, limits))).toEqual(["En nee,", "het is geen", "olie.", "Dit is AdBlue."]);
  });

  it("breaks on pauses longer than 250 ms", () => {
    const words = makeWords("hallo daar wereld", { 2: 0.4 });
    expect(texts(words, segmentWords(words, limits))).toEqual(["hallo daar", "wereld"]);
  });

  it("breaks when the text no longer fits the line budget", () => {
    const words = makeWords("vrachtwagenchauffeur transportbedrijf diesel");
    expect(texts(words, segmentWords(words, limits))).toEqual(["vrachtwagenchauffeur transportbedrijf", "diesel"]);
  });

  it("never leaves a one-letter word alone", () => {
    const words = makeWords("een twee drie u ziet het");
    expect(texts(words, segmentWords(words, limits))).toEqual(["een twee drie", "u ziet het"]);
    const tail = makeWords("ik zie het. U");
    expect(texts(tail, segmentWords(tail, limits))).toEqual(["ik zie het. U"]);
  });

  it("is deterministic and keeps groups contiguous and non-overlapping", () => {
    const words = makeWords("Zonder deze vloeistof kan een moderne vrachtauto niet meer rijden.");
    const a = segmentWords(words, limits);
    expect(segmentWords(words, limits)).toEqual(a);
    expect(a.flatMap((g) => g.wordIds)).toEqual(words.map((w) => w.id));
    for (let i = 1; i < a.length; i++) expect(a[i]!.start).toBeGreaterThanOrEqual(a[i - 1]!.end);
  });

  it("lingers 0.5 s after the last word but never overlaps the next group", () => {
    const words = makeWords("een twee drie vier", { 3: 2 });
    const [first, second] = segmentWords(words, limits);
    expect(first!.end).toBeCloseTo(words[2]!.end + 0.5);
    expect(second!.start).toBe(words[3]!.start);
    const tight = makeWords("een twee drie vier");
    expect(segmentWords(tight, limits)[0]!.end).toBe(tight[3]!.start);
  });
});

describe("countLines", () => {
  it("packs words greedily", () => {
    expect(countLines(["een", "twee", "drie"], 16)).toBe(1);
    expect(countLines(["vrachtwagenchauffeur", "ja"], 16)).toBe(2);
    expect(countLines([], 16)).toBe(0);
  });
});

describe("pickAccent", () => {
  it("picks the word with most letters, ignoring punctuation", () => {
    expect(pickAccent(makeWords("Dit is AdBlue."))).toBe("w2");
  });
});
