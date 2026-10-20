import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/captions/presets";
import { apply } from "../src/project/commands";
import type { Project, Word } from "../src/project/types";
import type { RefineInput } from "../src/project/types";
import { buildPrompt, validateRefinement } from "./refine";

const texts = ["Heb", "je", "nou", "ook", "een", "truck", "vraag?", "Ad", "blu", "is", "geen", "brandstof."];
const words: Word[] = texts.map((text, i) => ({ id: `w${i}`, text, start: i * 0.4, end: i * 0.4 + 0.3, confidence: 0.9, speaker: null }));
const input: RefineInput = {
  words: words.map(({ id, text }) => ({ id, text })),
  groups: [
    { id: "g0", wordIds: ["w0", "w1", "w2", "w3"] },
    { id: "g1", wordIds: ["w4", "w5", "w6"] },
    { id: "g2", wordIds: ["w7", "w8", "w9", "w10", "w11"] },
  ],
  glossary: ["AdBlue"],
};
const empty = { corrections: [], merges: [], accents: [], notes: [] };

describe("buildPrompt", () => {
  it("numbers words and describes groups as index ranges", () => {
    const prompt = buildPrompt(input);
    expect(prompt).toContain("<glossary>\nAdBlue\n</glossary>");
    expect(prompt).toContain("5: truck");
    expect(prompt).toContain("<groups>\n0: 0-3\n1: 4-6\n2: 7-11\n</groups>");
  });
});

describe("validateRefinement", () => {
  it("maps valid edits to word ids", () => {
    const r = validateRefinement(
      {
        corrections: [{ index: 2, text: "nu" }],
        merges: [{ indexes: [5, 6], text: "truckvraag?" }, { indexes: [7, 8], text: "AdBlue" }],
        accents: [{ group: 1, indexes: [6] }, { group: 2, indexes: [11] }],
        notes: [" Let op: 'nou' is spreektaal. "],
      },
      input,
    );
    expect(r).toEqual({
      corrections: [{ wordId: "w2", text: "nu" }],
      merges: [
        { wordIds: ["w5", "w6"], text: "truckvraag?" },
        { wordIds: ["w7", "w8"], text: "AdBlue" },
      ],
      // An accent on the second half of a merge points at the merged word (first id).
      accents: [
        { groupId: "g1", wordIds: ["w5"] },
        { groupId: "g2", wordIds: ["w11"] },
      ],
      notes: ["Let op: 'nou' is spreektaal."],
    });
  });

  it("drops edits that would split words, cross groups, overlap or point nowhere", () => {
    const r = validateRefinement(
      {
        corrections: [
          { index: 0, text: "Heb je" }, // would split
          { index: 99, text: "x" }, // missing index
          { index: 5, text: "trucks" }, // part of a merge
          { index: 1, text: "je" }, // unchanged
        ],
        merges: [
          { indexes: [3, 4], text: "ookeen" }, // crosses g0/g1
          { indexes: [5, 6], text: "truckvraag?" },
          { indexes: [6, 7], text: "x" }, // overlaps and crosses
          { indexes: [9, 11], text: "x" }, // not consecutive
        ],
        accents: [{ group: 0, indexes: [5] }, { group: 7, indexes: [0] }],
        notes: [],
      },
      input,
    );
    expect(r.corrections).toEqual([]);
    expect(r.merges).toEqual([{ wordIds: ["w5", "w6"], text: "truckvraag?" }]);
    expect(r.accents).toEqual([]);
  });

  it("rejects a malformed answer outright so the transcript stays untouched", () => {
    expect(() => validateRefinement({ corrections: "oops" }, input)).toThrow();
    expect(validateRefinement(empty, input)).toEqual(empty);
  });
});

describe("refined command", () => {
  it("applies corrections, merges with real timing, and accents", () => {
    const project: Project = { words, groups: input.groups.map((g) => ({ ...g, start: 0, end: 5, accentWordIds: [g.wordIds[0]!] })), style: PRESETS[0]! };
    const r = validateRefinement(
      { corrections: [{ index: 2, text: "nu" }], merges: [{ indexes: [5, 6], text: "truckvraag?" }], accents: [{ group: 1, indexes: [5] }], notes: [] },
      input,
    );
    const next = apply(project, { type: "refined", refinement: r });
    expect(next.words.map((w) => w.text).slice(0, 7)).toEqual(["Heb", "je", "nu", "ook", "een", "truckvraag?", "Ad"]);
    const merged = next.words.find((w) => w.id === "w5")!;
    expect([merged.start, merged.end]).toEqual([words[5]!.start, words[6]!.end]);
    expect(next.groups[1]!.wordIds).toEqual(["w4", "w5"]);
    expect(next.groups[1]!.accentWordIds).toEqual(["w5"]);
    expect(next.groups[0]!.accentWordIds).toEqual(["w0"]);
  });
});
