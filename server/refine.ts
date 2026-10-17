import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

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

const outputSchema = z.object({
  corrections: z.array(z.object({ index: z.number().int(), text: z.string() })),
  merges: z.array(z.object({ indexes: z.array(z.number().int()), text: z.string() })),
  accents: z.array(z.object({ group: z.number().int(), indexes: z.array(z.number().int()) })),
  notes: z.array(z.string()),
});

const SYSTEM = `You proofread Dutch speech-to-text transcripts that become animated captions for short-form social video (TikTok, Reels, Shorts).

The input lists numbered words ("index: word") and caption groups ("group: first-last" word index). The glossary lists names and jargon that must be spelled exactly as given.

Tasks:
1. corrections: fix misspelled or misheard words using the glossary and the context. Each correction replaces the text of exactly one word index with exactly one word, without spaces. Keep punctuation attached to the word as in the original unless it is clearly wrong. Do not rephrase, translate, censor or drop filler words: captions must match what was said.
2. merges: only when consecutive words in the same group are really one Dutch word written apart (for example "truck vraag" -> "truckvraag"). Give the word indexes and the merged text.
3. accents: for every group, the single word with the most meaning or emotion (two only for a long group). Prefer content words; never articles, pronouns or auxiliary verbs.
4. notes: short remarks in Dutch for the editor about anything you could not fix within these rules, such as a word that should be split.

Return only changes; leave correct words alone.`;

export function buildPrompt(input: RefineInput): string {
  const index = new Map(input.words.map((w, i) => [w.id, i]));
  const words = input.words.map((w, i) => `${i}: ${w.text}`).join("\n");
  const groups = input.groups
    .map((g, i) => `${i}: ${index.get(g.wordIds[0]!)}-${index.get(g.wordIds[g.wordIds.length - 1]!)}`)
    .join("\n");
  const glossary = input.glossary.length ? input.glossary.join(", ") : "(leeg)";
  return `<glossary>\n${glossary}\n</glossary>\n\n<words>\n${words}\n</words>\n\n<groups>\n${groups}\n</groups>`;
}

const singleWord = (text: string) => text.trim().length > 0 && !/\s/.test(text.trim());

/**
 * Turns the model's index-based answer into safe, ID-based edits. Anything that would
 * split words, invent timing, cross a group or point at a missing index is dropped.
 */
export function validateRefinement(raw: unknown, input: RefineInput): Refinement {
  const out = outputSchema.parse(raw);
  const groupOf = new Map<number, number>();
  const wordIndex = new Map(input.words.map((w, i) => [w.id, i]));
  input.groups.forEach((g, gi) => g.wordIds.forEach((id) => groupOf.set(wordIndex.get(id)!, gi)));
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < input.words.length;

  const merged = new Map<number, number>(); // index -> first index of its merge
  const merges: Refinement["merges"] = [];
  for (const m of out.merges) {
    const ids = m.indexes;
    const consecutive = ids.length >= 2 && ids.length <= 4 && ids.every((i, k) => valid(i) && (k === 0 || i === ids[k - 1]! + 1));
    const sameGroup = consecutive && ids.every((i) => groupOf.get(i) === groupOf.get(ids[0]!) && groupOf.has(i));
    if (!sameGroup || !singleWord(m.text) || ids.some((i) => merged.has(i))) continue;
    ids.forEach((i) => merged.set(i, ids[0]!));
    merges.push({ wordIds: ids.map((i) => input.words[i]!.id), text: m.text.trim() });
  }

  const corrections: Refinement["corrections"] = [];
  const corrected = new Set<number>();
  for (const c of out.corrections) {
    if (!valid(c.index) || merged.has(c.index) || corrected.has(c.index) || !singleWord(c.text)) continue;
    if (c.text.trim() === input.words[c.index]!.text) continue;
    corrected.add(c.index);
    corrections.push({ wordId: input.words[c.index]!.id, text: c.text.trim() });
  }

  const accents: Refinement["accents"] = [];
  for (const a of out.accents) {
    const group = input.groups[a.group];
    if (!group || accents.some((x) => x.groupId === group.id)) continue;
    const ids = [...new Set(a.indexes.filter((i) => valid(i) && groupOf.get(i) === a.group).map((i) => input.words[merged.get(i) ?? i]!.id))];
    if (ids.length) accents.push({ groupId: group.id, wordIds: ids.slice(0, 2) });
  }

  return { corrections, merges, accents, notes: out.notes.map((n) => n.trim()).filter(Boolean).slice(0, 20) };
}

export async function refine(input: RefineInput): Promise<Refinement> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ontbreekt op de server.");
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // On a policy decline the API retries on Anthropic's recommended fallback model.
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(outputSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude weigerde dit transcript te verwerken.");
  if (response.stop_reason === "max_tokens") throw new Error("Het AI-antwoord was te lang en is afgebroken.");
  if (!response.parsed_output) throw new Error("Het AI-antwoord had niet het verwachte formaat.");
  return validateRefinement(response.parsed_output, input);
}
