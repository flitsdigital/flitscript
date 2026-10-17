import type { StylePreset } from "../project/types";

export type Size = { width: number; height: number };
export type LayoutItem = { wordId: string; text: string; x: number; y: number; width: number };
/** Positions in output pixels; `x` is the left edge, `y` the vertical middle of the line. */
export type GroupLayout = { fontSize: number; items: LayoutItem[]; box: { x: number; y: number; width: number; height: number } };
export type Measure = (text: string, fontSize: number) => number;

/** Line width limit: captions keep clear of the outer 15% on both sides (the right edge holds the app's buttons). */
export const MAX_TEXT_WIDTH = 0.7;
const LINE_HEIGHT = 1.15;

export function displayText(text: string, style: Pick<StylePreset, "uppercase">): string {
  return style.uppercase ? text.toLocaleUpperCase("nl") : text;
}

function wrap(widths: number[], texts: string[], space: number, maxWidth: number, maxChars: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let width = 0;
  let chars = 0;
  widths.forEach((w, i) => {
    const length = texts[i]!.length;
    if (line.length && (width + space + w > maxWidth || chars + 1 + length > maxChars)) {
      lines.push(line);
      line = [];
    }
    width = line.length ? width + space + w : w;
    chars = line.length ? chars + 1 + length : length;
    line.push(i);
  });
  if (line.length) lines.push(line);
  return lines;
}

/** Lays out one caption group at the preset font size, wrapping on the safe width and character budget. */
export function layoutGroup(
  words: readonly { id: string; text: string }[],
  style: StylePreset,
  size: Size,
  measure: Measure,
): GroupLayout {
  const texts = words.map((w) => displayText(w.text, style));
  const maxWidth = size.width * MAX_TEXT_WIDTH;
  // The chosen size is always honoured: a block that doesn't fit gets an extra line, never smaller letters.
  const fontSize = style.font.size * size.height;
  const widths = texts.map((t) => measure(t, fontSize));
  const space = measure(" ", fontSize);
  const lines = wrap(widths, texts, space, maxWidth, style.maxCharsPerLine);

  const lineHeight = fontSize * LINE_HEIGHT;
  const height = lines.length * lineHeight;
  const top = size.height * style.positionY - height / 2;
  const centerX = size.width * style.positionX;
  const items: LayoutItem[] = [];
  let boxWidth = 0;
  lines.forEach((line, row) => {
    const lineWidth = line.reduce((sum, i) => sum + widths[i]!, 0) + space * (line.length - 1);
    boxWidth = Math.max(boxWidth, lineWidth);
    let x = centerX - lineWidth / 2;
    for (const i of line) {
      items.push({ wordId: words[i]!.id, text: texts[i]!, x, y: top + lineHeight * (row + 0.5), width: widths[i]! });
      x += widths[i]! + space;
    }
  });
  return { fontSize, items, box: { x: centerX - boxWidth / 2, y: top, width: boxWidth, height } };
}
