import { describe, expect, it } from "vitest";
import { stepFrameTime, summarizeFrameTiming } from "./frame-timing";

describe("summarizeFrameTiming", () => {
  it("detects constant frame rate regardless of decode order", () => {
    const ts = Array.from({ length: 100 }, (_, i) => i / 50);
    const shuffled = [...ts].reverse();
    const timing = summarizeFrameTiming(shuffled);
    expect(timing.averageFps).toBeCloseTo(50);
    expect(timing.isVfr).toBe(false);
  });

  it("tolerates 29.97 timescale jitter", () => {
    // NTSC timestamps rounded to a 600 timescale: alternating 20/20/20/... with tiny drift
    const ts = Array.from({ length: 300 }, (_, i) => Math.round((i * 1001) / 30000 * 600) / 600);
    const timing = summarizeFrameTiming(ts);
    expect(timing.averageFps).toBeCloseTo(29.97, 1);
    expect(timing.isVfr).toBe(false);
  });

  it("flags variable frame rate when frames slow down", () => {
    const ts = [0, 1 / 30, 2 / 30, 3 / 30, 3 / 30 + 1 / 24, 3 / 30 + 2 / 24, 3 / 30 + 3 / 24];
    const timing = summarizeFrameTiming(ts);
    expect(timing.isVfr).toBe(true);
    expect(timing.minFps).toBeCloseTo(24);
    expect(timing.maxFps).toBeCloseTo(30);
  });

  it("handles empty and single-frame input", () => {
    expect(summarizeFrameTiming([]).averageFps).toBe(0);
    expect(summarizeFrameTiming([1]).isVfr).toBe(false);
  });
});

describe("stepFrameTime", () => {
  it("moves to the middle of the next and previous frame", () => {
    expect(stepFrameTime(0, 50, 1, 10)).toBeCloseTo(1.5 / 50);
    expect(stepFrameTime(1.5 / 50, 50, 1, 10)).toBeCloseTo(2.5 / 50);
    expect(stepFrameTime(2.5 / 50, 50, -1, 10)).toBeCloseTo(1.5 / 50);
  });

  it("treats a time exactly on a frame boundary as that frame", () => {
    expect(stepFrameTime(0.1, 50, 1, 10)).toBeCloseTo(6.5 / 50);
  });

  it("clamps to the first and last frame", () => {
    expect(stepFrameTime(0, 50, -1, 10)).toBeCloseTo(0.5 / 50);
    expect(stepFrameTime(9.99, 50, 1, 10)).toBeCloseTo(499.5 / 50);
  });
});
