import { z } from "zod";
import type { Word } from "../src/project/types";
import type { TranscriptionProvider } from "./transcription";

const responseSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      type: z.string(),
      logprob: z.number(),
      start: z.number().nullish(),
      end: z.number().nullish(),
      speaker_id: z.string().nullish(),
    }),
  ),
});

export function mapElevenLabsWords(body: unknown): Word[] {
  return responseSchema
    .parse(body)
    .words.filter((w) => w.type === "word" && w.start != null && w.end != null)
    .map((w, i) => ({
      id: `w${i}`,
      text: w.text,
      start: w.start!,
      end: w.end!,
      confidence: Math.exp(w.logprob),
      speaker: w.speaker_id ?? null,
    }));
}

export const elevenLabsProvider: TranscriptionProvider = {
  async transcribe(audio, { language, keyterms }) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY ontbreekt op de server.");

    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model_id", "scribe_v2");
    form.append("language_code", language);
    form.append("timestamps_granularity", "word");
    form.append("diarize", "true");
    form.append("tag_audio_events", "false");
    for (const term of keyterms) form.append("keyterms", term);

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    return mapElevenLabsWords(await response.json());
  },
};
