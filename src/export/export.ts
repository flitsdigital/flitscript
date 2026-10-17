import { canEncodeVideo } from "mediabunny";
import type { VideoMeta } from "../media/probe";
import type { Project } from "../project/types";

export type VideoCodecChoice = "avc" | "hevc";
export type FontSource = { family: string; weight: number; source: string | ArrayBuffer };

export type ExportRequest = {
  type: "start";
  file: File;
  handle: FileSystemFileHandle;
  project: Project;
  fonts: FontSource[];
  width: number;
  height: number;
  codec: VideoCodecChoice;
  bitrate: number;
  /** Average source frame rate, for bitrate compensation. */
  fps: number;
  container: "mp4" | "mov";
};

export type ExportMessage =
  | { type: "progress"; progress: number }
  | { type: "done" }
  | { type: "canceled" }
  | { type: "error"; message: string };

/** MP4 for normal phone audio (AAC); MOV when the source carries PCM, so the audio can be copied untouched. */
export const containerFor = (meta: VideoMeta): "mp4" | "mov" => (meta.audio?.codec.startsWith("pcm") ? "mov" : "mp4");

export async function supportedCodecs(meta: VideoMeta, bitrate: number): Promise<Record<VideoCodecChoice, boolean>> {
  const check = (codec: VideoCodecChoice) => canEncodeVideo(codec, { width: meta.width, height: meta.height, bitrate: Math.round(bitrate) });
  const [avc, hevc] = await Promise.all([check("avc"), check("hevc")]);
  return { avc, hevc };
}

/** Runs the frame-exact export in a worker, streaming straight into `handle`. */
export function startExport(request: Omit<ExportRequest, "type">, onProgress: (progress: number) => void) {
  const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
  const done = new Promise<"done" | "canceled">((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ExportMessage>) => {
      const message = event.data;
      if (message.type === "progress") return onProgress(message.progress);
      worker.terminate();
      if (message.type === "done") resolve("done");
      else if (message.type === "canceled") resolve("canceled");
      else reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "De export-worker is gecrasht."));
    };
  });
  worker.postMessage({ type: "start", ...request } satisfies ExportRequest);
  return { done, cancel: () => worker.postMessage({ type: "cancel" }) };
}
