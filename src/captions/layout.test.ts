import { describe, expect, it } from "vitest";
import { layoutGroup, MAX_TEXT_WIDTH } from "./layout";
import { PRESETS } from "./presets";

const bold = PRESETS[0]!;
const clean = PRESETS[2]!;
const size = { width: 1080, height: 1920 };
// Monospace stand-in: every character is 0.6 em wide.
const measure = (text: string, fontSize: number) => text.length * 0.6 * fontSize;
const words = (spec: string) => spec.split(" ").map((text, i) => ({ id: `w${i}`, text }));

describe("layoutGroup", () => {
  it("centres a single line on the preset position at the preset font size", () => {
    const layout = layoutGroup(words("Dit is AdBlue"), bold, size, measure);
    expect(layout.fontSize).toBeCloseTo(0.045 * 1920);
    expect(layout.items.map((i) => i.text)).toEqual(["DIT", "IS", "ADBLUE"]);
    expect(new Set(layout.items.map((i) => i.y)).size).toBe(1);
    expect(layout.items[0]!.y).toBeCloseTo(0.65 * 1920);
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(540);
  });

  it("wraps on the character budget and stays inside the safe width", () => {
    const layout = layoutGroup(words("moderne vrachtauto rijdt"), bold, size, measure);
    expect(layout.items.map((i) => i.text)).toEqual(["MODERNE", "VRACHTAUTO", "RIJDT"]);
    expect(new Set(layout.items.map((i) => i.y)).size).toBe(3);
    for (const item of layout.items) {
      expect(item.x).toBeGreaterThanOrEqual(size.width * (1 - MAX_TEXT_WIDTH) / 2 - 0.001);
      expect(item.x + item.width).toBeLessThanOrEqual(size.width * (1 + MAX_TEXT_WIDTH) / 2 + 0.001);
    }
  });

  it("always keeps the chosen font size, adding a line instead of shrinking", () => {
    const layout = layoutGroup(words("vrachtwagenchauffeursopleiding is lang"), bold, size, measure);
    expect(layout.fontSize).toBeCloseTo(0.045 * 1920);
    expect(new Set(layout.items.map((i) => i.y)).size).toBe(2);
    const many = layoutGroup(words("een twee drie vier vijf zes zeven acht negen tien elf"), { ...bold, maxLines: 1 }, size, measure);
    expect(many.fontSize).toBeCloseTo(0.045 * 1920);
    expect(new Set(many.items.map((i) => i.y)).size).toBeGreaterThan(1);
  });

  it("keeps normal case for presets without uppercase", () => {
    expect(layoutGroup(words("Dit is AdBlue"), clean, size, measure).items.map((i) => i.text)).toEqual(["Dit", "is", "AdBlue"]);
  });

  it("scales with output size, so preview and 4K export match", () => {
    const small = layoutGroup(words("Dit is AdBlue"), bold, { width: 540, height: 960 }, measure);
    const big = layoutGroup(words("Dit is AdBlue"), bold, { width: 2160, height: 3840 }, measure);
    expect(big.fontSize / small.fontSize).toBeCloseTo(4);
    expect(big.items[1]!.x / small.items[1]!.x).toBeCloseTo(4);
  });

  it("places the block at the style position on both axes", () => {
    const layout = layoutGroup(words("hoi"), { ...bold, positionX: 0.3, positionY: 0.2 }, size, measure);
    expect(layout.items[0]!.y).toBeCloseTo(0.2 * 1920);
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(0.3 * 1080);
  });
});
