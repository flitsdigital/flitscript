import { describe, expect, it } from "vitest";
import { PRESETS } from "../captions/presets";
import type { Project } from "../project/types";
import { toSrt, toVtt } from "./subtitles";

const project: Project = {
  style: PRESETS[0]!,
  words: [
    { id: "a", text: "Dit", start: 0.5, end: 0.7, confidence: 1, speaker: null },
    { id: "b", text: "is", start: 0.7, end: 0.9, confidence: 1, speaker: null },
    { id: "c", text: "AdBlue.", start: 3661.2, end: 3662.0004, confidence: 1, speaker: null },
  ],
  groups: [
    { id: "g0", wordIds: ["a", "b"], start: 0.5, end: 1.25, accentWordIds: [] },
    { id: "g1", wordIds: ["c"], start: 3661.2, end: 3662.0004, accentWordIds: ["c"] },
  ],
};

describe("subtitles", () => {
  it("writes SRT with comma milliseconds and numbered cues", () => {
    expect(toSrt(project)).toBe(
      "1\n00:00:00,500 --> 00:00:01,250\nDit is\n\n2\n01:01:01,200 --> 01:01:02,000\nAdBlue.\n",
    );
  });

  it("writes WebVTT with a header and dot milliseconds", () => {
    expect(toVtt(project)).toBe("WEBVTT\n\n00:00:00.500 --> 00:00:01.250\nDit is\n\n01:01:01.200 --> 01:01:02.000\nAdBlue.\n");
  });
});
