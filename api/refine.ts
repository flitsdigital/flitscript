import { requireTeamMember } from "../server/auth";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { refine } from "../server/refine";

const inputSchema = z.object({
  words: z.array(z.object({ id: z.string().max(40), text: z.string().max(100) })).min(1).max(20_000),
  groups: z.array(z.object({ id: z.string().max(40), wordIds: z.array(z.string().max(40)).min(1) })).max(10_000),
  glossary: z.array(z.string().max(100)).max(1000),
});

export async function POST(request: Request): Promise<Response> {
  const denied = await requireTeamMember(request);
  if (denied) return denied;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ongeldige invoer." }, { status: 400 });
  const known = new Set(parsed.data.words.map((w) => w.id));
  if (parsed.data.groups.some((g) => g.wordIds.some((id) => !known.has(id)))) {
    return Response.json({ error: "Blok verwijst naar een onbekend woord." }, { status: 400 });
  }

  try {
    return Response.json(await refine(parsed.data));
  } catch (error) {
    console.error("refine failed", error);
    const message =
      error instanceof Anthropic.AuthenticationError
        ? "ANTHROPIC_API_KEY ontbreekt of is ongeldig op de server."
        : error instanceof Anthropic.RateLimitError
          ? "Te veel verzoeken bij Claude; probeer het zo opnieuw."
          : "onbekende fout (zie serverlog).";
    return Response.json({ error: `AI-correctie mislukt: ${message}` }, { status: 502 });
  }
}
