import { describe, expect, it } from "vitest";
import { ANIMATIONS, type AnimGroup } from "./animations";

const group: AnimGroup = {
  start: 1,
  end: 2.5,
  words: [
    { start: 1, end: 1.3, index: 0 },
    { start: 1.4, end: 1.8, index: 1 },
    { start: 1.9, end: 2.2, index: 2 },
  ],
};
const [w0, w1, w2] = group.words as [AnimGroup["words"][0], AnimGroup["words"][0], AnimGroup["words"][0]];

describe("pop", () => {
  const { group: g } = ANIMATIONS.pop;
  it("grows from 0.8 to 1.0 with an overshoot", () => {
    expect(g(1, group).scale).toBeCloseTo(0.8);
    expect(g(1, group).opacity).toBe(0);
    const peak = Math.max(...Array.from({ length: 20 }, (_, i) => g(1 + i * 0.01, group).scale));
    expect(peak).toBeGreaterThan(1);
    expect(g(1.5, group)).toEqual({ opacity: 1, scale: 1, translateY: 0 });
  });
});

describe("word-by-word", () => {
  const { word } = ANIMATIONS["word-by-word"];
  it("hides words until their own start time", () => {
    expect(word(1.2, w1, group).opacity).toBe(0);
    expect(word(1.44, w1, group).opacity).toBeCloseTo(0.5);
    expect(word(1.6, w1, group).opacity).toBe(1);
    expect(word(1.6, w0, group).opacity).toBe(1);
  });
});

describe("word-pop", () => {
  const { word } = ANIMATIONS["word-pop"];
  it("pops each word in from 0.8 at its own start, with an overshoot", () => {
    expect(word(1.3, w1, group).opacity).toBe(0);
    expect(word(1.4, w1, group).scale).toBeCloseTo(0.8);
    const peak = Math.max(...Array.from({ length: 20 }, (_, i) => word(1.4 + i * 0.01, w1, group).scale));
    expect(peak).toBeGreaterThan(1);
    expect(word(1.7, w1, group)).toEqual({ opacity: 1, scale: 1, translateY: 0, highlight: false });
    expect(word(1.7, w0, group).scale).toBe(1);
  });
});

describe("karaoke", () => {
  const { word } = ANIMATIONS.karaoke;
  it("highlights exactly one word at a time, bridging gaps until the next word", () => {
    const active = (t: number) => group.words.filter((w) => word(t, w, group).highlight).map((w) => w.index);
    expect(active(1.1)).toEqual([0]);
    expect(active(1.35)).toEqual([0]);
    expect(active(1.4)).toEqual([1]);
    expect(active(2.4)).toEqual([2]);
    expect(active(0.9)).toEqual([]);
  });
});

describe("bounce", () => {
  const { word } = ANIMATIONS.bounce;
  it("lifts the active word briefly and lands it again", () => {
    expect(word(1.9, w2, group).translateY).toBeCloseTo(0);
    expect(word(2.025, w2, group).translateY).toBeCloseTo(-0.18);
    expect(word(2.2, w2, group).translateY).toBeCloseTo(0);
    expect(word(1.5, w2, group).translateY).toBeCloseTo(0);
  });
});

describe("slide-up", () => {
  const { group: g } = ANIMATIONS["slide-up"];
  it("slides in from below and settles", () => {
    expect(g(1, group)).toEqual({ opacity: 0, scale: 1, translateY: 0.6 });
    expect(g(1.1, group).translateY).toBeGreaterThan(0);
    expect(g(1.1, group).translateY).toBeLessThan(0.6);
    expect(g(1.3, group)).toEqual({ opacity: 1, scale: 1, translateY: 0 });
  });
});

describe("all animations", () => {
  it("are pure: same input, same output", () => {
    for (const anim of Object.values(ANIMATIONS)) {
      for (const t of [0.5, 1, 1.07, 1.5, 2.4]) {
        expect(anim.group(t, group)).toEqual(anim.group(t, group));
        expect(anim.word(t, w1, group)).toEqual(anim.word(t, w1, group));
      }
    }
  });
});

describe("exitOpacity", () => {
  it("fades out over the last 0.25 s when silence follows", async () => {
    const { exitOpacity } = await import("./animations");
    expect(exitOpacity(1.0, 0, 2, Infinity)).toBe(1);
    expect(exitOpacity(1.875, 0, 2, Infinity)).toBeCloseTo(0.5);
    expect(exitOpacity(2, 0, 2, Infinity)).toBe(0);
  });

  it("does not fade when the next caption follows straight away, and stays short for short blocks", async () => {
    const { exitOpacity } = await import("./animations");
    expect(exitOpacity(1.99, 0, 2, 2)).toBe(1);
    expect(exitOpacity(0.25, 0, 0.3, 5)).toBeCloseTo(0.5);
  });
});
