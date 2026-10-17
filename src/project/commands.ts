import type { Refinement } from "../../server/refine";
import { autoAccents, pickAccent, segmentWords } from "../captions/segment";
import type { CaptionGroup, Project, StylePreset, Word } from "./types";

export type Command =
  /** `maxEnd` (video duration) keeps the last caption, and its fade-out, inside the video. */
  | { type: "transcribed"; words: Word[]; maxEnd?: number }
  | { type: "setStyle"; style: StylePreset }
  | { type: "editGroupText"; groupId: string; text: string }
  | { type: "toggleAccent"; groupId: string; wordId: string }
  | { type: "setGroupTiming"; groupId: string; start: number; end: number }
  | { type: "splitGroup"; groupId: string; time: number }
  | { type: "mergeWithNext"; groupId: string }
  | { type: "deleteGroup"; groupId: string }
  | { type: "refined"; refinement: Refinement }
  | { type: "clearAccents" }
  /** New caption at `time`; `id` comes from `newGroupId` so the UI can select it right away. */
  | { type: "addGroup"; id: string; time: number; maxEnd: number }
  /** Per-block style exceptions; `null` removes them. */
  | { type: "setGroupStyle"; groupId: string; style: Partial<StylePreset> | null }
  | { type: "removeFillers" }
  | { type: "replaceWord"; find: string; replace: string };

/** Dutch (and English) hesitation sounds that never belong in captions. */
const FILLERS = new Set(["eh", "ehm", "ehh", "euh", "uh", "uhm", "uhh", "um", "umm", "hm", "hmm", "mm", "mmm", "ehmm"]);

const splitPunctuation = (text: string) => {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(text)!;
  return { prefix: m[1]!, core: m[2]!, suffix: m[3]! };
};
export const isFiller = (text: string) => FILLERS.has(splitPunctuation(text).core.toLowerCase());

/** Words whose text (ignoring surrounding punctuation and case) equals `find`. */
export function findMatches(words: readonly Word[], find: string): Word[] {
  const needle = find.trim().toLowerCase();
  return needle ? words.filter((w) => splitPunctuation(w.text).core.toLowerCase() === needle) : [];
}

export const newGroupId = (project: Project) => nextId("g", project.groups.map((g) => g.id));

function applyRefinement(project: Project, r: Refinement): Project {
  const text = new Map(r.corrections.map((c) => [c.wordId, c.text]));
  const dropped = new Set<string>();
  const index = new Map(project.words.map((w) => [w.id, w]));
  const mergedInto = new Map<string, Word>();
  for (const m of r.merges) {
    const parts = m.wordIds.map((id) => index.get(id)).filter((w): w is Word => !!w);
    if (parts.length !== m.wordIds.length) continue;
    // Real timings only: the merged word runs from the first word's start to the last word's end.
    mergedInto.set(parts[0]!.id, { ...parts[0]!, text: m.text, end: parts[parts.length - 1]!.end, confidence: Math.min(...parts.map((w) => w.confidence)) });
    parts.slice(1).forEach((w) => dropped.add(w.id));
  }
  const words = project.words
    .filter((w) => !dropped.has(w.id))
    .map((w) => mergedInto.get(w.id) ?? (text.has(w.id) ? { ...w, text: text.get(w.id)! } : w));
  const accents = new Map(r.accents.map((a) => [a.groupId, a.wordIds]));
  const groups = project.groups.map((g) => {
    const wordIds = g.wordIds.filter((id) => !dropped.has(id));
    const chosen = accents.get(g.id)?.filter((id) => wordIds.includes(id));
    return { ...g, wordIds, accentWordIds: chosen?.length ? chosen : g.accentWordIds.filter((id) => wordIds.includes(id)) };
  });
  return { ...project, words, groups };
}

const MIN_DURATION = 0.1;

/** Next free id like `g12`, so commands stay deterministic. */
function nextId(prefix: string, used: Iterable<string>, offset = 0): string {
  let max = -1;
  for (const id of used) if (id.startsWith(prefix)) max = Math.max(max, Number(id.slice(prefix.length)) || 0);
  return `${prefix}${max + 1 + offset}`;
}

const limitsChanged = (a: StylePreset, b: StylePreset) =>
  a.maxWordsPerGroup !== b.maxWordsPerGroup || a.maxCharsPerLine !== b.maxCharsPerLine || a.maxLines !== b.maxLines;

/** Re-cuts the words that are still captioned, keeping the user's accent choices where they survive. */
function resegment(project: Project, style: StylePreset): CaptionGroup[] {
  const captioned = new Set(project.groups.flatMap((g) => g.wordIds));
  const accents = new Set(project.groups.flatMap((g) => g.accentWordIds));
  return segmentWords(project.words.filter((w) => captioned.has(w.id)), style).map((g) => {
    const kept = g.wordIds.filter((id) => accents.has(id));
    return kept.length ? { ...g, accentWordIds: kept } : g;
  });
}

/** Re-picks every block's accent for a new automatic accent rate, keeping the blocks themselves. */
function reaccent(project: Project, rate: number): CaptionGroup[] {
  const index = new Map(project.words.map((w) => [w.id, w]));
  const picks = autoAccents(project.groups.map((g) => g.wordIds.map((id) => index.get(id)!)), rate);
  return project.groups.map((g, i) => ({ ...g, accentWordIds: picks[i]! }));
}

function addGroup(project: Project, id: string, time: number, maxEnd: number): Project {
  if (project.groups.some((g) => time >= g.start && time < g.end)) return project;
  const next = project.groups.find((g) => g.start > time);
  const end = Math.min(time + 1.5, next?.start ?? maxEnd, maxEnd);
  if (end - time < 0.2) return project;
  const texts = ["Nieuwe", "caption"];
  const fresh: Word[] = texts.map((text, i) => ({
    id: nextId("w", project.words.map((w) => w.id), i),
    text,
    start: time + ((end - time) * i) / texts.length,
    end: time + ((end - time) * (i + 1)) / texts.length,
    confidence: 1,
    speaker: null,
  }));
  // Words of deleted blocks stay in the list, so sort instead of splicing to keep it in time order.
  const words = [...project.words, ...fresh].sort((a, b) => a.start - b.start);
  const groups = [...project.groups];
  const gi = groups.findIndex((g) => g.start > time);
  groups.splice(gi < 0 ? groups.length : gi, 0, { id, wordIds: fresh.map((w) => w.id), start: time, end, accentWordIds: [] });
  return { ...project, words, groups };
}

function removeFillers(project: Project): Project {
  const fillers = new Set(project.words.filter((w) => isFiller(w.text)).map((w) => w.id));
  if (!fillers.size) return project;
  return {
    ...project,
    words: project.words.filter((w) => !fillers.has(w.id)),
    groups: project.groups
      .map((g) => ({ ...g, wordIds: g.wordIds.filter((id) => !fillers.has(id)), accentWordIds: g.accentWordIds.filter((id) => !fillers.has(id)) }))
      .filter((g) => g.wordIds.length > 0),
  };
}

function replaceWord(project: Project, find: string, replace: string): Project {
  const replacement = replace.trim();
  const hits = new Set(findMatches(project.words, find).map((w) => w.id));
  if (!hits.size || !replacement) return project;
  return {
    ...project,
    words: project.words.map((w) => {
      if (!hits.has(w.id)) return w;
      const { prefix, suffix } = splitPunctuation(w.text);
      return { ...w, text: `${prefix}${replacement}${suffix}`, confidence: 1 };
    }),
  };
}

function updateGroup(project: Project, groupId: string, fn: (g: CaptionGroup, i: number) => CaptionGroup[] | CaptionGroup): Project {
  const i = project.groups.findIndex((g) => g.id === groupId);
  if (i < 0) return project;
  const groups = [...project.groups];
  groups.splice(i, 1, ...[fn(groups[i]!, i)].flat());
  return { ...project, groups };
}

function editGroupText(project: Project, groupId: string, text: string): Project {
  const group = project.groups.find((g) => g.id === groupId);
  if (!group) return project;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return apply(project, { type: "deleteGroup", groupId });
  const index = new Map(project.words.map((w) => [w.id, w]));
  const old = group.wordIds.map((id) => index.get(id)!);

  if (tokens.length === old.length) {
    // Same word count: keep every timing and only fix the spelling. A corrected word is no longer "uncertain".
    const changed = new Map(old.filter((w, i) => w.text !== tokens[i]).map((w) => [w.id, tokens[old.indexOf(w)]!]));
    if (!changed.size) return project;
    return { ...project, words: project.words.map((w) => (changed.has(w.id) ? { ...w, text: changed.get(w.id)!, confidence: 1 } : w)) };
  }

  // Different word count: no per-word timing exists for the new words, so spread them over the block by length.
  const start = old[0]!.start;
  const span = old[old.length - 1]!.end - start;
  const total = tokens.reduce((sum, t) => sum + t.length + 1, 0);
  let cursor = start;
  const fresh: Word[] = tokens.map((text, i) => {
    const duration = (span * (text.length + 1)) / total;
    const word = { id: nextId("w", project.words.map((w) => w.id), i), text, start: cursor, end: cursor + duration, confidence: 1, speaker: old[0]!.speaker };
    cursor += duration;
    return word;
  });
  const oldIds = new Set(group.wordIds);
  const firstOld = project.words.findIndex((w) => oldIds.has(w.id));
  const words = project.words.filter((w) => !oldIds.has(w.id));
  words.splice(firstOld, 0, ...fresh);
  const accentTexts = new Set(group.accentWordIds.map((id) => index.get(id)?.text));
  const accents = fresh.filter((w) => accentTexts.has(w.text)).map((w) => w.id);
  // Only re-pick when the block had an accent; a block without one (manual mode) stays without.
  const fallback = group.accentWordIds.length ? [pickAccent(fresh)] : [];
  return updateGroup({ ...project, words }, groupId, (g) => ({
    ...g,
    wordIds: fresh.map((w) => w.id),
    accentWordIds: accents.length ? accents : fallback,
  }));
}

function splitGroup(project: Project, groupId: string, time: number): Project {
  const group = project.groups.find((g) => g.id === groupId);
  if (!group || group.wordIds.length < 2 || time <= group.start || time >= group.end) return project;
  const index = new Map(project.words.map((w) => [w.id, w]));
  const words = group.wordIds.map((id) => index.get(id)!);
  // Words whose midpoint lies before the playhead go left; always leave at least one word on each side.
  const k = Math.min(Math.max(words.filter((w) => (w.start + w.end) / 2 < time).length, 1), words.length - 1);
  const boundary = time > words[k - 1]!.start && time < words[k]!.end ? time : words[k]!.start;
  const leftIds = group.wordIds.slice(0, k);
  const rightIds = group.wordIds.slice(k);
  const accentsIn = (ids: string[]) => {
    const kept = group.accentWordIds.filter((id) => ids.includes(id));
    return kept.length || !group.accentWordIds.length ? kept : [pickAccent(ids.map((id) => index.get(id)!))];
  };
  return updateGroup(project, groupId, (g) => [
    { ...g, wordIds: leftIds, end: boundary, accentWordIds: accentsIn(leftIds) },
    { ...g, id: nextId("g", project.groups.map((x) => x.id)), wordIds: rightIds, start: boundary, accentWordIds: accentsIn(rightIds) },
  ]);
}

export function apply(project: Project, command: Command): Project {
  switch (command.type) {
    case "transcribed": {
      const max = command.maxEnd ?? Infinity;
      const groups = segmentWords(command.words, project.style).map((g) => (g.end > max ? { ...g, end: Math.max(max, g.start + MIN_DURATION) } : g));
      return { ...project, words: command.words, groups };
    }
    case "setStyle": {
      const next = { ...project, style: command.style };
      if (limitsChanged(project.style, command.style)) return { ...next, groups: resegment(project, command.style) };
      if (project.style.accentRate !== command.style.accentRate) return { ...next, groups: reaccent(project, command.style.accentRate) };
      return next;
    }
    case "clearAccents":
      return project.groups.some((g) => g.accentWordIds.length)
        ? { ...project, groups: project.groups.map((g) => ({ ...g, accentWordIds: [] })) }
        : project;
    case "addGroup":
      return addGroup(project, command.id, command.time, command.maxEnd);
    case "setGroupStyle":
      return updateGroup(project, command.groupId, (g) => {
        if (!command.style) {
          const { override: _, ...rest } = g;
          return rest;
        }
        return { ...g, override: { style: { ...g.override?.style, ...command.style } } };
      });
    case "removeFillers":
      return removeFillers(project);
    case "replaceWord":
      return replaceWord(project, command.find, command.replace);
    case "editGroupText":
      return editGroupText(project, command.groupId, command.text);
    case "toggleAccent":
      return updateGroup(project, command.groupId, (g) => ({
        ...g,
        accentWordIds: g.accentWordIds.includes(command.wordId)
          ? g.accentWordIds.filter((id) => id !== command.wordId)
          : [...g.accentWordIds, command.wordId],
      }));
    case "setGroupTiming":
      return updateGroup(project, command.groupId, (g, i) => {
        // Blocks never overlap their neighbours and never get shorter than 0.1 s.
        const min = project.groups[i - 1]?.end ?? 0;
        const max = project.groups[i + 1]?.start ?? Infinity;
        const start = Math.min(Math.max(command.start, min), max - MIN_DURATION);
        const end = Math.max(Math.min(command.end, max), start + MIN_DURATION);
        return start === g.start && end === g.end ? g : { ...g, start, end };
      });
    case "splitGroup":
      return splitGroup(project, command.groupId, command.time);
    case "mergeWithNext": {
      const i = project.groups.findIndex((g) => g.id === command.groupId);
      const next = project.groups[i + 1];
      if (i < 0 || !next) return project;
      return updateGroup({ ...project, groups: project.groups.filter((g) => g !== next) }, command.groupId, (g) => ({
        ...g,
        wordIds: [...g.wordIds, ...next.wordIds],
        end: next.end,
        accentWordIds: [...g.accentWordIds, ...next.accentWordIds],
      }));
    }
    case "refined":
      return applyRefinement(project, command.refinement);
    case "deleteGroup":
      return updateGroup(project, command.groupId, () => []);
  }
}
