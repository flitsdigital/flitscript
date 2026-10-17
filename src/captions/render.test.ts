import { describe, expect, it } from "vitest";
import type { Project, StylePreset, Word } from "../project/types";
import { PRESETS } from "./presets";
import { captionBoxAt, renderCaptions, type Ctx2D } from "./render";

/** Records the text draws with the fill colour and opacity in effect, which is what reaches the pixels. */
function recordingContext() {
  const draws: { text: string; fill: string; alpha: number }[] = [];
  const boxes: string[] = [];
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    measureText: (text: string) => ({ width: text.length * 10 }),
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    roundRect() {},
    fill() {
      boxes.push(String(this.fillStyle));
    },
    strokeText() {},
    fillText(text: string) {
      draws.push({ text, fill: String(this.fillStyle), alpha: this.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as Ctx2D, draws, boxes };
}

const words: Word[] = ["Dit", "is", "AdBlue."].map((text, i) => ({
  id: `w${i}`,
  text,
  start: 1 + i * 0.4,
  end: 1.3 + i * 0.4,
  confidence: 1,
  speaker: null,
}));
const project = (preset: number | StylePreset, override?: Partial<StylePreset>): Project => ({
  words,
  groups: [{ id: "g0", wordIds: ["w0", "w1", "w2"], start: 1, end: 2.5, accentWordIds: ["w2"], override: override && { style: override } }],
  style: typeof preset === "number" ? PRESETS[preset]! : preset,
});
const size = { width: 1080, height: 1920 };

function drawAt(time: number, preset = 0) {
  const { ctx, draws } = recordingContext();
  renderCaptions(ctx, time, project(preset), size);
  return draws;
}

describe("renderCaptions", () => {
  it("draws nothing outside the group's time range", () => {
    expect(drawAt(0.5)).toEqual([]);
    expect(drawAt(2.5)).toEqual([]);
  });

  it("draws the group's words with the accent word in the accent colour", () => {
    expect(drawAt(2)).toEqual([
      { text: "DIT", fill: "#FFFFFF", alpha: 1 },
      { text: "IS", fill: "#FFFFFF", alpha: 1 },
      { text: "ADBLUE.", fill: "#FFD400", alpha: 1 },
    ]);
  });

  it("is deterministic for the same time", () => {
    expect(drawAt(1.07)).toEqual(drawAt(1.07));
  });

  it("karaoke highlights the spoken word", () => {
    expect(drawAt(1.5, 1).map((d) => d.fill)).toEqual(["#FFFFFF", "#2EE66B", "#2EE66B"]);
  });

  it("word-by-word only shows words that have started", () => {
    expect(drawAt(1.5, 2).map((d) => d.text)).toEqual(["Dit", "is"]);
  });

  it("draws accent words on a block in the accent colour with the box text colour", () => {
    const style = { ...PRESETS[0]!, accentBox: { textColor: "#111111", padding: 0.1, radius: 0.2 } };
    const { ctx, draws, boxes } = recordingContext();
    renderCaptions(ctx, 2, project(style), size);
    expect(boxes).toEqual(["#FFD400"]);
    expect(draws.map((d) => d.fill)).toEqual(["#FFFFFF", "#FFFFFF", "#111111"]);
  });

  it("applies a block's own style override", () => {
    expect(drawAtWith(2, { textColor: "#00FF00" }).map((d) => d.fill)).toEqual(["#00FF00", "#00FF00", "#FFD400"]);
  });
});

function drawAtWith(time: number, override: Partial<StylePreset>) {
  const { ctx, draws } = recordingContext();
  renderCaptions(ctx, time, project(0, override), size);
  return draws;
}

describe("captionBoxAt", () => {
  it("returns the on-screen box of the active caption and follows a moved block", () => {
    const { ctx } = recordingContext();
    expect(captionBoxAt(ctx, 0.5, project(0), size)).toBeNull();
    const centre = (p: Project) => {
      const { box } = captionBoxAt(ctx, 2, p, size)!;
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    const [x, y] = centre(project(0));
    expect(x).toBeCloseTo(540);
    expect(y).toBeCloseTo(0.65 * 1920);
    const [mx, my] = centre(project(0, { positionX: 0.25, positionY: 0.3 }));
    expect(mx).toBeCloseTo(0.25 * 1080);
    expect(my).toBeCloseTo(0.3 * 1920);
  });
});
