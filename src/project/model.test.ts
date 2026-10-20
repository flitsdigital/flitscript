import { describe, expect, it } from "vitest";
import { PRESETS } from "../captions/presets";
import { apply, newGroupId, type Command } from "./commands";
import { normalize } from "./model";
import type { Project, Word } from "./types";

const words: Word[] = "Zonder deze vloeistof kan een vrachtauto echt niet rijden, zegt eh de monteur.".split(" ").map((text, i) => ({
  id: `w${i}`,
  text,
  start: i * 0.4,
  end: i * 0.4 + 0.35,
  confidence: 0.5,
  speaker: null,
}));
const start = apply({ words: [], groups: [], style: PRESETS[0]! }, { type: "transcribed", words, maxEnd: 6 });

/** The caption-data rules every command result must satisfy. */
function violations(p: Project): string[] {
  const out: string[] = [];
  const wordIds = new Set(p.words.map((w) => w.id));
  if (wordIds.size !== p.words.length) out.push("duplicate word ids");
  if (new Set(p.groups.map((g) => g.id)).size !== p.groups.length) out.push("duplicate group ids");
  p.words.forEach((w, i) => i && w.start < p.words[i - 1]!.start && out.push(`words out of order at ${w.id}`));
  const claimed = p.groups.flatMap((g) => g.wordIds);
  if (new Set(claimed).size !== claimed.length) out.push("word in two blocks");
  if (claimed.length !== p.words.length || claimed.some((id) => !wordIds.has(id))) out.push("uncaptioned or missing words");
  p.groups.forEach((g, i) => {
    if (!g.wordIds.length) out.push(`${g.id} empty`);
    if (g.accentWordIds.some((id) => !g.wordIds.includes(id))) out.push(`${g.id} accent outside block`);
    const next = p.groups[i + 1];
    if (next && g.end > next.start + 1e-9) out.push(`${g.id} overlaps ${next.id}`);
  });
  return out;
}

// Small deterministic PRNG, so a failure always reproduces.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCommand(p: Project, r: () => number): Command {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const g = pick(p.groups);
  const t = r() * 6;
  const options: (() => Command)[] = [
    () => ({ type: "editGroupText", groupId: g.id, text: pick(["Een", "twee woorden", "drie vier vijf zes", " "]) }),
    () => ({ type: "toggleAccent", groupId: g.id, wordId: pick(p.words).id }),
    () => ({ type: "setGroupTiming", groupId: g.id, start: g.start + (r() - 0.5) * 2, end: g.end + (r() - 0.5) * 2 }),
    () => ({ type: "splitGroup", groupId: g.id, time: t }),
    () => ({ type: "mergeWithNext", groupId: g.id }),
    () => ({ type: "deleteGroup", groupId: g.id }),
    () => ({ type: "addGroup", id: newGroupId(p), time: t, maxEnd: 6 }),
    () => ({ type: "setStyle", style: { ...p.style, maxWordsPerGroup: pick([2, 3, 5]), accentRate: pick([0, 0.5, 1]) } }),
    () => ({ type: "setGroupStyle", groupId: g.id, style: { font: { size: 0.05 } } }),
    () => ({ type: "removeFillers" }),
    () => ({ type: "replaceWord", find: "niet", replace: "nooit" }),
    () => ({ type: "clearAccents" }),
  ];
  return pick(options)();
}

describe("caption-data rules", () => {
  it("hold after any sequence of commands", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      let p = start;
      for (let step = 0; step < 40 && p.groups.length; step++) {
        const command = randomCommand(p, r);
        p = apply(p, command);
        expect(violations(p), `seed ${seed}, step ${step}: ${JSON.stringify(command)}`).toEqual([]);
      }
    }
  });

  it("normalize repairs broken data and leaves valid data untouched", () => {
    expect(normalize(start)).toBe(start);
    const broken: Project = {
      ...start,
      groups: [
        { ...start.groups[1]!, accentWordIds: ["w0", ...start.groups[1]!.wordIds] },
        { ...start.groups[0]!, end: 99, wordIds: [...start.groups[0]!.wordIds, start.groups[1]!.wordIds[0]!] },
        { id: "empty", wordIds: ["nope"], start: 50, end: 51, accentWordIds: [] },
      ],
    };
    expect(violations(normalize(broken))).toEqual([]);
  });
});
