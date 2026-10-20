import type { CaptionGroup, Project, Word } from "./types";

/** Blocks never get shorter than this, in seconds. */
export const MIN_DURATION = 0.1;

const indexes = new WeakMap<readonly Word[], Map<string, Word>>();
/** Word lookup by id, built once per `words` array (projects are immutable, so a new edit means a new array). */
export function wordIndex(words: readonly Word[]): Map<string, Word> {
  let index = indexes.get(words);
  if (!index) indexes.set(words, (index = new Map(words.map((w) => [w.id, w]))));
  return index;
}

/** The block's words in order. */
export function groupWords(words: readonly Word[], group: Pick<CaptionGroup, "wordIds">): Word[] {
  const byId = wordIndex(words);
  return group.wordIds.map((id) => byId.get(id)).filter((w): w is Word => w !== undefined);
}

export const groupText = (words: readonly Word[], group: Pick<CaptionGroup, "wordIds">) =>
  groupWords(words, group)
    .map((w) => w.text)
    .join(" ");

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const byStart = (a: { start: number }, b: { start: number }) => a.start - b.start;

/**
 * Restores the caption-data rules after any edit, so commands only have to describe what changes:
 * - every block has at least one word, each word in at most one block, in time order;
 * - accents are words of their own block, without duplicates;
 * - blocks are sorted and never overlap (an end past the next start is cut back to it);
 * - `words` holds only captioned words, sorted by start.
 * Unchanged blocks keep their object identity, so render caches survive edits elsewhere.
 */
export function normalize(project: Project): Project {
  const byId = wordIndex(project.words);
  const claimed = new Set<string>();
  const sorted = project.groups.every((g, i, all) => i === 0 || all[i - 1]!.start <= g.start) ? project.groups : [...project.groups].sort(byStart);
  const cleaned = sorted.flatMap((g) => {
    const wordIds = g.wordIds.filter((id) => {
      if (!byId.has(id) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    if (!wordIds.length) return [];
    wordIds.sort((a, b) => byId.get(a)!.start - byId.get(b)!.start);
    const accentWordIds = [...new Set(g.accentWordIds)].filter((id) => wordIds.includes(id));
    return sameList(wordIds, g.wordIds) && sameList(accentWordIds, g.accentWordIds) ? [g] : [{ ...g, wordIds, accentWordIds }];
  });
  const groups = cleaned.map((g, i) => {
    const next = cleaned[i + 1];
    return next && g.end > next.start ? { ...g, end: Math.max(next.start, g.start) } : g;
  });
  const kept = project.words.filter((w) => claimed.has(w.id));
  const inOrder = kept.every((w, i) => i === 0 || kept[i - 1]!.start <= w.start);
  const words = kept.length === project.words.length && inOrder ? project.words : inOrder ? kept : kept.sort(byStart);
  const groupsSame = groups.length === project.groups.length && groups.every((g, i) => g === project.groups[i]);
  return words === project.words && groupsSame ? project : { ...project, words, groups: groupsSame ? project.groups : groups };
}
