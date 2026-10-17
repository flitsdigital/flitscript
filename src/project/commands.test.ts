import { describe, expect, it } from "vitest";
import { PRESETS } from "../captions/presets";
import { apply } from "./commands";
import { historyReducer, initHistory } from "./history";
import type { Project, Word } from "./types";

const words: Word[] = "Zonder deze vloeistof kan een vrachtauto niet rijden.".split(" ").map((text, i) => ({
  id: `w${i}`,
  text,
  start: i * 0.4,
  end: i * 0.4 + 0.35,
  confidence: 0.4,
  speaker: "s0",
}));
const empty: Project = { words: [], groups: [], style: PRESETS[0]! };
const project = apply(empty, { type: "transcribed", words });
const text = (p: Project, groupIndex: number) =>
  p.groups[groupIndex]!.wordIds.map((id) => p.words.find((w) => w.id === id)!.text).join(" ");

describe("transcribed", () => {
  it("segments the new words with the current style", () => {
    expect(project.groups.map((_, i) => text(project, i))).toEqual(["Zonder deze vloeistof", "kan een vrachtauto", "niet rijden."]);
  });
});

describe("editGroupText", () => {
  it("fixes spelling in place, keeping timings, and clears the uncertainty", () => {
    const p = apply(project, { type: "editGroupText", groupId: "g0", text: "Zonder deze vloeistoffen" });
    expect(text(p, 0)).toBe("Zonder deze vloeistoffen");
    const w = p.words.find((x) => x.id === "w2")!;
    expect([w.start, w.end, w.confidence]).toEqual([0.8, 1.15, 1]);
    expect(p.words.find((x) => x.id === "w0")!.confidence).toBe(0.4);
  });

  it("spreads a different number of words over the block's original time span", () => {
    const p = apply(project, { type: "editGroupText", groupId: "g1", text: "kan geen truck" + " meer" });
    const group = p.groups[1]!;
    const fresh = group.wordIds.map((id) => p.words.find((w) => w.id === id)!);
    expect(fresh.map((w) => w.text)).toEqual(["kan", "geen", "truck", "meer"]);
    expect(fresh[0]!.start).toBeCloseTo(1.2);
    expect(fresh[3]!.end).toBeCloseTo(2.35);
    for (let i = 1; i < fresh.length; i++) expect(fresh[i]!.start).toBeCloseTo(fresh[i - 1]!.end);
    expect(p.words.map((w) => w.text).join(" ")).toBe("Zonder deze vloeistof kan geen truck meer niet rijden.");
    expect(new Set(p.words.map((w) => w.id)).size).toBe(p.words.length);
  });

  it("deletes the block when the text is cleared", () => {
    expect(apply(project, { type: "editGroupText", groupId: "g1", text: "  " }).groups.map((g) => g.id)).toEqual(["g0", "g2"]);
  });
});

describe("toggleAccent", () => {
  it("adds and removes an accent word", () => {
    const on = apply(project, { type: "toggleAccent", groupId: "g0", wordId: "w0" });
    expect(on.groups[0]!.accentWordIds).toEqual(["w2", "w0"]);
    expect(apply(on, { type: "toggleAccent", groupId: "g0", wordId: "w2" }).groups[0]!.accentWordIds).toEqual(["w0"]);
  });
});

describe("setGroupTiming", () => {
  it("never overlaps neighbours and keeps a minimum length", () => {
    const g1 = project.groups[1]!;
    const p = apply(project, { type: "setGroupTiming", groupId: "g1", start: 0, end: 99 });
    expect(p.groups[1]!.start).toBe(project.groups[0]!.end);
    expect(p.groups[1]!.end).toBe(project.groups[2]!.start);
    const tiny = apply(project, { type: "setGroupTiming", groupId: "g1", start: g1.start, end: g1.start });
    expect(tiny.groups[1]!.end - tiny.groups[1]!.start).toBeCloseTo(0.1);
  });
});

describe("splitGroup", () => {
  it("splits at the playhead between words", () => {
    const p = apply(project, { type: "splitGroup", groupId: "g0", time: 0.78 });
    expect(p.groups.map((g) => g.id)).toEqual(["g0", "g3", "g1", "g2"]);
    expect(text(p, 0)).toBe("Zonder deze");
    expect(text(p, 1)).toBe("vloeistof");
    expect(p.groups[0]!.end).toBe(0.78);
    expect(p.groups[1]!.start).toBe(0.78);
    expect(p.groups[1]!.accentWordIds).toEqual(["w2"]);
    expect(p.groups[0]!.accentWordIds).toEqual(["w0"]);
  });

  it("does nothing outside the block or for a single word", () => {
    expect(apply(project, { type: "splitGroup", groupId: "g0", time: 5 })).toBe(project);
    const single = apply(project, { type: "splitGroup", groupId: "g0", time: 0.4 });
    expect(apply(single, { type: "splitGroup", groupId: "g0", time: 0.1 })).toBe(single);
  });
});

describe("mergeWithNext", () => {
  it("joins two blocks and keeps both accents", () => {
    const p = apply(project, { type: "mergeWithNext", groupId: "g0" });
    expect(p.groups.length).toBe(2);
    expect(text(p, 0)).toBe("Zonder deze vloeistof kan een vrachtauto");
    expect(p.groups[0]!.end).toBe(project.groups[1]!.end);
    expect(p.groups[0]!.accentWordIds).toEqual(["w2", "w5"]);
    expect(apply(p, { type: "mergeWithNext", groupId: "g2" })).toBe(p);
  });
});

describe("setStyle", () => {
  it("re-cuts blocks only when the block limits change, keeping chosen accents and deleted blocks out", () => {
    const edited = apply(apply(project, { type: "toggleAccent", groupId: "g0", wordId: "w0" }), { type: "deleteGroup", groupId: "g2" });
    const recoloured = apply(edited, { type: "setStyle", style: { ...edited.style, textColor: "#FF0000" } });
    expect(recoloured.groups).toBe(edited.groups);
    const longer = apply(edited, { type: "setStyle", style: { ...edited.style, maxWordsPerGroup: 6, maxCharsPerLine: 30 } });
    expect(longer.groups.map((_, i) => text(longer, i))).toEqual(["Zonder deze vloeistof kan een vrachtauto"]);
    expect(longer.groups[0]!.accentWordIds).toEqual(["w0", "w2", "w5"]);
  });
});

describe("history", () => {
  it("undoes and redoes commands", () => {
    let h = initHistory(project);
    h = historyReducer(h, { type: "do", command: { type: "deleteGroup", groupId: "g0" } });
    expect(h.present.groups.length).toBe(2);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(project);
    h = historyReducer(h, { type: "redo" });
    expect(h.present.groups.length).toBe(2);
  });

  it("merges one drag gesture into a single undo step", () => {
    let h = initHistory(project);
    for (let i = 1; i <= 5; i++) {
      h = historyReducer(h, { type: "do", command: { type: "setGroupTiming", groupId: "g2", start: 2.4, end: 3 + i * 0.1 }, gesture: "drag:g2", at: i * 16 });
    }
    expect(h.past.length).toBe(1);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(project);
  });

  it("ignores commands that change nothing", () => {
    const h = initHistory(project);
    expect(historyReducer(h, { type: "do", command: { type: "deleteGroup", groupId: "nope" } })).toBe(h);
  });
});

describe("accent rate", () => {
  it("0% gives no automatic accents, 100% one per block, in between the strongest blocks", () => {
    const none = apply(project, { type: "setStyle", style: { ...project.style, accentRate: 0 } });
    expect(none.groups.map((g) => g.accentWordIds)).toEqual([[], [], []]);
    const all = apply(none, { type: "setStyle", style: { ...none.style, accentRate: 1 } });
    expect(all.groups.map((g) => g.accentWordIds)).toEqual([["w2"], ["w5"], ["w7"]]);
    // "vloeistof" (9) and "vrachtauto" (10) beat "rijden." (6).
    const some = apply(none, { type: "setStyle", style: { ...none.style, accentRate: 0.67 } });
    expect(some.groups.map((g) => g.accentWordIds)).toEqual([["w2"], ["w5"], []]);
  });

  it("clearAccents removes every accent, and splitting a block without accent adds none", () => {
    const cleared = apply(project, { type: "clearAccents" });
    expect(cleared.groups.every((g) => g.accentWordIds.length === 0)).toBe(true);
    const split = apply(cleared, { type: "splitGroup", groupId: "g0", time: 0.78 });
    expect(split.groups.every((g) => g.accentWordIds.length === 0)).toBe(true);
    const edited = apply(cleared, { type: "editGroupText", groupId: "g0", text: "Zonder vloeistof" });
    expect(edited.groups[0]!.accentWordIds).toEqual([]);
  });
});

describe("addGroup", () => {
  it("adds a placeholder caption in a gap, up to 1.5 s and never into the next block", () => {
    const gapProject = apply(project, { type: "deleteGroup", groupId: "g1" });
    const p = apply(gapProject, { type: "addGroup", id: "g9", time: 1.3, maxEnd: 10 });
    const added = p.groups.find((g) => g.id === "g9")!;
    expect(p.groups.map((g) => g.id)).toEqual(["g0", "g9", "g2"]);
    expect(added.start).toBe(1.3);
    expect(added.end).toBe(project.groups[2]!.start);
    expect(added.wordIds.map((id) => p.words.find((w) => w.id === id)!.text)).toEqual(["Nieuwe", "caption"]);
    const starts = p.words.map((w) => w.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("does nothing inside an existing block or without room", () => {
    expect(apply(project, { type: "addGroup", id: "g9", time: 0.5, maxEnd: 10 })).toBe(project);
    expect(apply(project, { type: "addGroup", id: "g9", time: 9.95, maxEnd: 10 })).toBe(project);
  });
});

describe("setGroupStyle", () => {
  it("merges per-block overrides and removes them with null", () => {
    const a = apply(project, { type: "setGroupStyle", groupId: "g1", style: { positionY: 0.3 } });
    const b = apply(a, { type: "setGroupStyle", groupId: "g1", style: { textColor: "#FF0000" } });
    expect(b.groups[1]!.override).toEqual({ style: { positionY: 0.3, textColor: "#FF0000" } });
    expect(apply(b, { type: "setGroupStyle", groupId: "g1", style: null }).groups[1]!.override).toBeUndefined();
  });
});

describe("fillers and find/replace", () => {
  const withFillers = apply(empty, {
    type: "transcribed",
    words: ["Eh,", "dit", "is", "uhm", "adblue", "Adblue."].map((text, i) => ({ id: `w${i}`, text, start: i * 0.4, end: i * 0.4 + 0.3, confidence: 0.3, speaker: null })),
  });

  it("removes hesitation sounds from words and blocks", () => {
    const p = apply(withFillers, { type: "removeFillers" });
    expect(p.words.map((w) => w.text)).toEqual(["dit", "is", "adblue", "Adblue."]);
    expect(p.groups.flatMap((g) => g.wordIds)).toEqual(["w1", "w2", "w4", "w5"]);
    expect(apply(p, { type: "removeFillers" })).toBe(p);
  });

  it("replaces a word everywhere, ignoring case and keeping punctuation", () => {
    const p = apply(withFillers, { type: "replaceWord", find: "ADBLUE", replace: "AdBlue" });
    expect(p.words.slice(4).map((w) => [w.text, w.confidence])).toEqual([["AdBlue", 1], ["AdBlue.", 1]]);
    expect(apply(withFillers, { type: "replaceWord", find: "nope", replace: "x" })).toBe(withFillers);
  });
});
