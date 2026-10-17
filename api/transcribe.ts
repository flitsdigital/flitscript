import { elevenLabsProvider } from "../server/elevenlabs";
import { sanitizeKeyterms } from "../server/transcription";

// Vercel caps request bodies at 4.5 MB; Opus at 32 kbps fits ~15 minutes in this.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// TODO(fase 6): check the Supabase session here before this goes on a public URL.
export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Ongeldige upload." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Geen audio ontvangen." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio is te groot (max 4 MB)." }, { status: 413 });
  }
  const keyterms = sanitizeKeyterms(form.getAll("keyterms").filter((v): v is string => typeof v === "string"));

  try {
    const words = await elevenLabsProvider.transcribe(audio, { language: "nl", keyterms });
    return Response.json({ words });
  } catch (error) {
    console.error("transcribe failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Transcriptie mislukt: ${message}` }, { status: 502 });
  }
}
