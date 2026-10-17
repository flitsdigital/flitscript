import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WebMOutputFormat } from "mediabunny";
import type { Word } from "../project/types";

export type TranscribeProgress = { stage: "audio"; progress: number } | { stage: "transcribe" };

/**
 * Pulls the primary audio track out as mono 16 kHz Opus (~240 KB per minute).
 * Returns the audio plus its offset on the video timeline, since the conversion starts the output at 0.
 */
export async function extractAudio(file: File, onProgress: (progress: number) => void): Promise<{ audio: Blob; offset: number }> {
  // shortcut: runs on the main thread; audio-only transcode of a 90 s clip takes ~1 s. Move to a worker if the UI stutters.
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Deze video heeft geen audiospoor.");
    const target = new BufferTarget();
    const conversion = await Conversion.init({
      input,
      output: new Output({ format: new WebMOutputFormat(), target }),
      tracks: "primary",
      video: { discard: true },
      audio: { codec: "opus", numberOfChannels: 1, sampleRate: 16000, bitrate: 32_000 },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      throw new Error(`Audio kan niet worden omgezet: ${conversion.discardedTracks.filter((t) => t.reason !== "discarded_by_user").map((t) => t.reason).join(", ")}`);
    }
    conversion.onProgress = onProgress;
    await conversion.execute();
    return {
      audio: new Blob([target.buffer!], { type: "audio/webm" }),
      offset: Math.max(0, await track.getFirstTimestamp()),
    };
  } finally {
    input.dispose();
  }
}

export async function transcribe(
  file: File,
  keyterms: readonly string[],
  onProgress: (progress: TranscribeProgress) => void,
): Promise<Word[]> {
  const { audio, offset } = await extractAudio(file, (progress) => onProgress({ stage: "audio", progress }));
  onProgress({ stage: "transcribe" });

  const form = new FormData();
  form.append("audio", audio, "audio.webm");
  for (const term of keyterms) form.append("keyterms", term);
  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { words?: Word[]; error?: string };
  if (!response.ok || !body.words) throw new Error(body.error ?? `Transcriptie mislukt (${response.status}).`);

  return offset ? body.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })) : body.words;
}
