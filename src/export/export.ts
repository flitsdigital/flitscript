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
  /** Source time that becomes 0 in the output (`VideoMeta.startTime`); captions live on the source timeline. */
  startTime: number;
  container: "mp4" | "mov";
};

export type ExportMessage =
  | { type: "progress"; progress: number }
  | { type: "done" }
  | { type: "canceled" }
  | { type: "error"; message: string };

/** MP4 for normal phone audio (AAC); MOV when the source carries PCM, so the audio can be copied untouched. */
export const containerFor = (meta: VideoMeta): "mp4" | "mov" => (meta.audio?.codec.startsWith("pcm") ? "mov" : "mp4");

/** Encoders need even dimensions for 4:2:0 video; an odd screen recording gets one extra pixel row or column. */
export const outputSize = (meta: VideoMeta) => ({ width: meta.width + (meta.width % 2), height: meta.height + (meta.height % 2) });

export async function supportedCodecs(meta: VideoMeta, bitrate: number): Promise<Record<VideoCodecChoice, boolean>> {
  const check = (codec: VideoCodecChoice) => canEncodeVideo(codec, { ...outputSize(meta), bitrate: Math.round(bitrate) });
  const [avc, hevc] = await Promise.all([check("avc"), check("hevc")]);
  return { avc, hevc };
}

/** Chrome-only `FileSystemHandle.remove()`; the save picker has already created the (empty) file. */
const removeFile = (handle: FileSystemFileHandle) => (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.().catch(() => {});

/**
 * Runs the frame-exact export in a worker, streaming straight into `handle`.
 * `done` settles only once the outcome is final on disk: a complete file, or (canceled or failed) no file at all.
 */
export function startExport(request: Omit<ExportRequest, "type">, onProgress: (progress: number) => void) {
  const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
  const finished = new Promise<"done" | "canceled">((resolve, reject) => {
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
  const done = finished.then(
    async (result) => {
      if (result === "canceled") await removeFile(request.handle);
      return result;
    },
    async (error: unknown) => {
      await removeFile(request.handle);
      throw error;
    },
  );
  worker.postMessage({ type: "start", ...request } satisfies ExportRequest);
  return { done, cancel: () => worker.postMessage({ type: "cancel" }) };
}
