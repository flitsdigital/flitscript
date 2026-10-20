import type { CaptionGroup, Project, StyleOverride, StylePreset } from "../project/types";

/** `base` with `patch` on top; `font` merges per field, so changing only the size keeps the family. */
export const mergeStyle = (base: StylePreset, patch: StyleOverride): StylePreset => ({ ...base, ...patch, font: { ...base.font, ...patch.font } });

/** The project style with the block's own exceptions applied. */
export const effectiveStyle = (style: StylePreset, group: CaptionGroup): StylePreset => (group.override?.style ? mergeStyle(style, group.override.style) : style);

/** Every font face the captions draw with, block exceptions included: what preview and export must load first. */
export function usedFonts(project: Project): StylePreset["font"][] {
  const fonts = new Map<string, StylePreset["font"]>();
  for (const style of [project.style, ...project.groups.map((g) => effectiveStyle(project.style, g))]) {
    fonts.set(`${style.font.family}|${style.font.weight}`, style.font);
  }
  return [...fonts.values()];
}
