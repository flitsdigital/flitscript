import { saveHandle } from "../media/file-handles";
import { fingerprint, fingerprintMismatches, type Fingerprint } from "../media/fingerprint";
import { probe, type VideoMeta } from "../media/probe";
import { updateProject } from "./store";

/** A local video, read and identified. The video itself never leaves the browser. */
export type SourceVideo = { file: File; meta: VideoMeta; fingerprint: Fingerprint };

/** Probes and fingerprints a picked file. Throws `ProbeError` (Dutch message) for files the browser can't use. */
export async function readSourceVideo(file: File): Promise<SourceVideo> {
  const meta = await probe(file);
  return { file, meta, fingerprint: await fingerprint(file, meta.duration) };
}

/** Why `video` doesn't look like the project's original source; empty when it does. */
export const sourceMismatches = (expected: Fingerprint, video: SourceVideo) => fingerprintMismatches(expected, video.fingerprint);

/**
 * Makes `video` the source of project `projectId`: its fingerprint and metadata go to Supabase (skipped when
 * `recorded`, i.e. the row already describes this file), and the file handle is kept locally so the project
 * reopens without a file picker.
 */
export async function linkSourceVideo(projectId: string, video: SourceVideo, handle: FileSystemFileHandle | null, { recorded = false } = {}) {
  if (!recorded) await updateProject(projectId, { fingerprint: video.fingerprint, video_meta: video.meta });
  if (handle) await saveHandle(projectId, handle);
}
