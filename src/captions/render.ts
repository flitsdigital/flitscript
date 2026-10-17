import type { CaptionGroup, Project, StylePreset, Word } from "../project/types";
import { findActiveIndex } from "../project/timing";
import { ANIMATIONS, exitOpacity, type AnimGroup } from "./animations";
import { layoutGroup, type GroupLayout, type Size } from "./layout";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Rect = { x: number; y: number; width: number; height: number };

const fontString = (style: StylePreset, size: number) => `${style.font.weight} ${size}px "${style.font.family}"`;

/** The project style with the block's own exceptions applied. */
export const effectiveStyle = (style: StylePreset, group: CaptionGroup): StylePreset =>
  group.override?.style ? { ...style, ...group.override.style } : style;

const wordIndexes = new WeakMap<readonly Word[], Map<string, Word>>();
function wordIndex(words: readonly Word[]): Map<string, Word> {
  let index = wordIndexes.get(words);
  if (!index) wordIndexes.set(words, (index = new Map(words.map((w) => [w.id, w]))));
  return index;
}

// Measuring text is the expensive part, so each group keeps its last layout until text, style or size changes.
const layouts = new WeakMap<CaptionGroup, { key: string; layout: GroupLayout }>();
function cachedLayout(ctx: Ctx2D, group: CaptionGroup, words: Word[], style: StylePreset, size: Size): GroupLayout {
  const key = `${size.width}x${size.height}|${JSON.stringify(style)}|${words.map((w) => w.text).join(" ")}`;
  const hit = layouts.get(group);
  if (hit?.key === key) return hit.layout;
  const layout = layoutGroup(words, style, size, (text, fontSize) => {
    ctx.font = fontString(style, fontSize);
    return ctx.measureText(text).width;
  });
  layouts.set(group, { key, layout });
  return layout;
}

/** The block on screen at `time` with its resolved style, words and layout. */
function resolve(ctx: Ctx2D, time: number, project: Project, size: Size) {
  const index = findActiveIndex(project.groups, time);
  const group = project.groups[index];
  if (!group) return null;
  const style = effectiveStyle(project.style, group);
  const byId = wordIndex(project.words);
  const words = group.wordIds.map((id) => byId.get(id)).filter((w): w is Word => w !== undefined);
  if (!words.length) return null;
  const nextStart = project.groups[index + 1]?.start ?? Infinity;
  return { group, style, words, nextStart, layout: cachedLayout(ctx, group, words, style, size) };
}

/** Where the caption at `time` sits in output pixels, for hit-testing and dragging in the editor. */
export function captionBoxAt(ctx: Ctx2D, time: number, project: Project, size: Size): { groupId: string; box: Rect } | null {
  const r = resolve(ctx, time, project, size);
  if (!r) return null;
  const pad = r.style.background ? r.style.background.padding * r.layout.fontSize : r.layout.fontSize * 0.2;
  const { box } = r.layout;
  return { groupId: r.group.id, box: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 } };
}

/**
 * Draws the captions for `time` on top of whatever is already on the canvas.
 * Pure and deterministic: same time and project, same pixels. Used by preview and export alike.
 */
export function renderCaptions(ctx: Ctx2D, time: number, project: Project, size: Size): void {
  const r = resolve(ctx, time, project, size);
  if (!r) return;
  const { group, style, words, layout, nextStart } = r;
  const { fontSize, box } = layout;
  const animation = ANIMATIONS[style.animation];
  const anim: AnimGroup = { start: group.start, end: group.end, words: words.map((w, i) => ({ start: w.start, end: w.end, index: i })) };
  const enter = animation.group(time, anim);
  const g = style.fadeOut ? { ...enter, opacity: enter.opacity * exitOpacity(time, group.start, group.end, nextStart) } : enter;
  if (g.opacity <= 0) return;

  ctx.save();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  ctx.translate(cx, cy + g.translateY * fontSize);
  ctx.scale(g.scale, g.scale);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = g.opacity;

  if (style.background) {
    const pad = style.background.padding * fontSize;
    ctx.fillStyle = style.background.color;
    ctx.beginPath();
    ctx.roundRect(box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2, style.background.radius * fontSize);
    ctx.fill();
  }

  ctx.font = fontString(style, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const accentColor = style.accentColors[0] ?? style.textColor;
  layout.items.forEach((item, i) => {
    const w = animation.word(time, anim.words[i]!, anim);
    if (w.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = g.opacity * w.opacity;
    ctx.translate(item.x + item.width / 2, item.y + w.translateY * fontSize);
    ctx.scale(w.scale, w.scale);
    const accent = w.highlight || group.accentWordIds.includes(item.wordId);
    if (accent && style.accentBox) {
      // Highlight block: the word sits on a rounded block in the accent colour, so no outline is needed.
      const pad = style.accentBox.padding * fontSize;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(-item.width / 2 - pad, -fontSize * 0.55, item.width + pad * 2, fontSize * 1.1, style.accentBox.radius * fontSize);
      ctx.fill();
      ctx.fillStyle = style.accentBox.textColor;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
      return;
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke.color;
      // Strokes are centred on the outline; double the width so the visible outside part matches the preset.
      ctx.lineWidth = style.stroke.width * fontSize * 2;
      ctx.strokeText(item.text, 0, 0);
    }
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * fontSize;
      ctx.shadowOffsetY = style.shadow.offsetY * fontSize;
    }
    ctx.fillStyle = accent ? accentColor : style.textColor;
    ctx.fillText(item.text, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}
