import { describe, expect, it } from "vitest";
import { apply } from "../project/commands";
import type { Project } from "../project/types";
import { PRESETS } from "./presets";
import { effectiveStyle, usedFonts } from "./style";

const base = PRESETS[0]!;
const words = ["een", "twee", "drie", "vier"].map((text, i) => ({ id: `w${i}`, text, start: i, end: i + 0.9, confidence: 1, speaker: null }));
const project = apply({ words: [], groups: [], style: { ...base, maxWordsPerGroup: 2 } }, { type: "transcribed", words });

describe("block style", () => {
  it("a bigger block keeps following the project's font family", () => {
    const bigger = apply(project, { type: "setGroupStyle", groupId: "g0", style: { font: { size: 0.08 } } });
    const renamed = apply(bigger, { type: "setStyle", style: { ...bigger.style, font: { ...bigger.style.font, family: "Anton" } } });
    expect(effectiveStyle(renamed.style, renamed.groups[0]!).font).toEqual({ ...renamed.style.font, size: 0.08 });
  });

  it("usedFonts lists every face, block exceptions included, once", () => {
    const p: Project = apply(project, { type: "setGroupStyle", groupId: "g1", style: { font: { family: "Anton", weight: 400 } } });
    expect(usedFonts(p)).toEqual([p.style.font, { ...p.style.font, family: "Anton", weight: 400 }]);
  });
});
