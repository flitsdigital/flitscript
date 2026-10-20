import { authHeaders } from "../lib/supabase";
import type { Project, Refinement } from "../project/types";

/** Sends the current transcript through the Claude correction pass. Throws with a Dutch message on failure. */
export async function requestRefinement(project: Project, glossary: string[]): Promise<Refinement> {
  const response = await fetch("/api/refine", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      words: project.words.map(({ id, text }) => ({ id, text })),
      groups: project.groups.map(({ id, wordIds }) => ({ id, wordIds })),
      glossary,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<Refinement> & { error?: string };
  if (!response.ok || !body.corrections) throw new Error(body.error ?? `AI-correctie mislukt (${response.status}).`);
  return body as Refinement;
}
