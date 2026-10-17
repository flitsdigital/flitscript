import { describe, expect, it } from "vitest";
import { findActiveIndex } from "./timing";

const word = (start: number, end: number) => ({ start, end });
const words = [word(0, 0.5), word(0.5, 1), word(1.5, 2)];

describe("findActiveIndex", () => {
  it("returns the word whose [start, end) contains the time", () => {
    expect(findActiveIndex(words, 0)).toBe(0);
    expect(findActiveIndex(words, 0.5)).toBe(1);
    expect(findActiveIndex(words, 1.99)).toBe(2);
  });

  it("returns -1 in gaps and outside the transcript", () => {
    expect(findActiveIndex(words, 1.2)).toBe(-1);
    expect(findActiveIndex(words, 2)).toBe(-1);
    expect(findActiveIndex(words, -1)).toBe(-1);
    expect(findActiveIndex([], 0)).toBe(-1);
  });
});

describe("showTime", () => {
  it("lands just after the entry animation, inside short blocks too", async () => {
    const { showTime } = await import("./timing");
    expect(showTime({ start: 1, end: 3 })).toBeCloseTo(1.2);
    expect(showTime({ start: 1, end: 1.2 })).toBeCloseTo(1.1);
  });
});
