export type Word = {
  id: string;
  text: string;
  /** Seconds on the source video timeline. */
  start: number;
  end: number;
  /** 0..1 */
  confidence: number;
  speaker: string | null;
};

export type CaptionGroup = {
  id: string;
  wordIds: string[];
  /** Seconds; the group is on screen during [start, end). */
  start: number;
  end: number;
  accentWordIds: string[];
  /** Per-block exceptions on top of the project style, e.g. a caption dragged elsewhere. */
  override?: { style?: StyleOverride };
};

export type AnimationId = "none" | "pop" | "word-by-word" | "word-pop" | "karaoke" | "bounce" | "slide-up";

/** Sizes are relative so a preset looks the same at preview and 4K export: `font.size` to video height, the rest to font size. */
export type StylePreset = {
  id: string;
  name: string;
  font: { family: string; weight: number; size: number };
  uppercase: boolean;
  textColor: string;
  accentColors: string[];
  /** Share of blocks (0..1) that get an automatic accent word; 0 = only manual accents. */
  accentRate: number;
  /** Draw accent (and karaoke) words on a rounded block in the accent colour instead of colouring the text. */
  accentBox: { textColor: string; padding: number; radius: number } | null;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number; offsetY: number } | null;
  background: { color: string; padding: number; radius: number } | null;
  /** Centre of the caption block as a fraction of the frame: 0 = left/top, 1 = right/bottom. */
  positionX: number;
  positionY: number;
  maxWordsPerGroup: number;
  maxCharsPerLine: number;
  maxLines: number;
  animation: AnimationId;
  /** Fade a caption out at its end when silence follows. */
  fadeOut: boolean;
};

/** Only the fields a block changes; `font` too, so a block that is just bigger still follows the project's font family. */
export type StyleOverride = Partial<Omit<StylePreset, "font">> & { font?: Partial<StylePreset["font"]> };

export type Project = {
  words: Word[];
  groups: CaptionGroup[];
  style: StylePreset;
};

/** What the Claude correction pass gets: ids and text only. Shared by client and server. */
export type RefineInput = {
  words: { id: string; text: string }[];
  groups: { id: string; wordIds: string[] }[];
  glossary: string[];
};

/** Validated, ID-based result. A merged word keeps the id of its first word. */
export type Refinement = {
  corrections: { wordId: string; text: string }[];
  merges: { wordIds: string[]; text: string }[];
  accents: { groupId: string; wordIds: string[] }[];
  notes: string[];
};
