import type { AnimationId } from "../project/types";

export type AnimWord = { start: number; end: number; index: number };
export type AnimGroup = { start: number; end: number; words: readonly AnimWord[] };
/** `translateY` is in font sizes (em) so motion scales with the caption. */
export type Transform = { opacity: number; scale: number; translateY: number };
export type WordTransform = Transform & { highlight: boolean };

export type Animation = {
  label: string;
  group: (t: number, group: AnimGroup) => Transform;
  word: (t: number, word: AnimWord, group: AnimGroup) => WordTransform;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const progress = (t: number, start: number, duration: number) => clamp01((t - start) / duration);
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

const STILL: Transform = { opacity: 1, scale: 1, translateY: 0 };
const PLAIN: WordTransform = { ...STILL, highlight: false };
const fadeIn = (t: number, group: AnimGroup): Transform => ({ ...STILL, opacity: progress(t, group.start, 0.06) });

/**
 * Fade-out multiplier for a block's last moments. Only when the block isn't followed straight away by another,
 * otherwise back-to-back captions would flicker.
 */
export function exitOpacity(t: number, start: number, end: number, nextStart: number): number {
  if (nextStart - end < 0.05) return 1;
  const duration = Math.min(0.25, (end - start) / 3);
  return clamp01((end - t) / duration);
}

/** A word stays "active" until the next word starts, so short gaps don't flicker. */
const isActive = (t: number, word: AnimWord, group: AnimGroup) =>
  t >= word.start && t < (group.words[word.index + 1]?.start ?? group.end);

export const ANIMATIONS: Record<AnimationId, Animation> = {
  none: { label: "Geen", group: () => STILL, word: () => PLAIN },
  pop: {
    label: "Pop",
    group: (t, g) => ({
      opacity: progress(t, g.start, 0.06),
      scale: 0.8 + 0.2 * easeOutBack(progress(t, g.start, 0.2)),
      translateY: 0,
    }),
    word: () => PLAIN,
  },
  "word-by-word": {
    label: "Woord voor woord",
    group: () => STILL,
    word: (t, w) => ({ ...PLAIN, opacity: progress(t, w.start, 0.08) }),
  },
  "word-pop": {
    label: "Woord voor woord pop",
    group: () => STILL,
    word: (t, w) => ({
      ...PLAIN,
      opacity: progress(t, w.start, 0.06),
      scale: 0.8 + 0.2 * easeOutBack(progress(t, w.start, 0.2)),
    }),
  },
  karaoke: {
    label: "Karaoke",
    group: fadeIn,
    word: (t, w, g) => ({ ...PLAIN, highlight: isActive(t, w, g) }),
  },
  bounce: {
    label: "Bounce",
    group: fadeIn,
    word: (t, w) => ({ ...PLAIN, translateY: -0.18 * Math.sin(Math.PI * progress(t, w.start, 0.25)) }),
  },
  "slide-up": {
    label: "Slide-up",
    group: (t, g) => {
      const p = easeOutCubic(progress(t, g.start, 0.25));
      return { opacity: p, scale: 1, translateY: 0.6 * (1 - p) };
    },
    word: () => PLAIN,
  },
};
