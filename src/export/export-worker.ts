/// <reference lib="webworker" />
import { ALL_FORMATS, BlobSource, Conversion, ConversionCanceledError, Input, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, type StreamTargetChunk } from "mediabunny";
import { renderCaptions } from "../captions/render";
import type { ExportMessage, ExportRequest } from "./export";

declare const self: DedicatedWorkerGlobalScope;

let conversion: Conversion | null = null;
let output: Output | null = null;
let canceled = false;
const post = (message: ExportMessage) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<ExportRequest | { type: "cancel" }>) => {
  if (event.data.type === "cancel") {
    canceled = true;
    await conversion?.cancel();
    return;
  }
  let file: FileSystemWritableFileStream | null = null;
  try {
    file = await event.data.handle.createWritable();
    await run(event.data, file);
    post({ type: "done" });
  } catch (error) {
    // Once Mediabunny owns the stream, cancelling closes it through `fileSink`, which discards instead of committing.
    // Before that (a font that won't load) the stream is still ours to abort.
    if (output) await output.cancel().catch(() => {});
    else await file?.abort().catch(() => {});
    if (canceled || error instanceof ConversionCanceledError) post({ type: "canceled" });
    else post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

/**
 * Mediabunny closes its stream both when it finishes and when it cancels, and closing a file stream commits it.
 * Only a finished export may commit; anything else aborts, so no half-written file is left on disk.
 */
function fileSink(file: FileSystemWritableFileStream): WritableStream<StreamTargetChunk> {
  return new WritableStream<StreamTargetChunk>({
    write: (chunk) => file.write({ type: "write", data: chunk.data, position: chunk.position }),
    close: () => (output?.state === "canceled" ? file.abort() : file.close()),
    abort: (reason) => file.abort(reason),
  });
}

async function run(request: ExportRequest, file: FileSystemWritableFileStream) {
  // Workers have their own font set; captions must use the exact same faces as the preview.
  for (const font of request.fonts) {
    const face = new FontFace(font.family, typeof font.source === "string" ? `url(${font.source})` : font.source, { weight: String(font.weight) });
    self.fonts.add(await face.load());
  }

  const input = new Input({ source: new BlobSource(request.file), formats: ALL_FORMATS });
  output = new Output({
    format: request.container === "mov" ? new MovOutputFormat() : new Mp4OutputFormat(),
    target: new StreamTarget(fileSink(file), { chunked: true }),
  });
  // Conversion re-times output from the first timestamp; captions live on the source timeline.
  const offset = Math.max(0, await input.getFirstTimestamp());
  const size = { width: request.width, height: request.height };
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d")!;

  conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: {
      codec: request.codec,
      // shortcut: Conversion can't hand the frame rate to the encoder without resampling VFR, so Chrome rate-controls
      // as if it were 30 fps (measured: output = target × fps/30). Scale the target to land on the requested bitrate.
      // Upgrade when Mediabunny exposes the encoder frame rate in ConversionVideoOptions.
      bitrate: Math.round((request.bitrate * 30) / request.fps),
      // Every decoded frame keeps its own timestamp and duration (no frame-rate conversion), so VFR stays in sync.
      process: (sample) => {
        sample.draw(ctx, 0, 0, size.width, size.height);
        renderCaptions(ctx, sample.timestamp + offset, request.project, size);
        return canvas;
      },
      processedWidth: size.width,
      processedHeight: size.height,
    },
    // No audio options: the container supports the source codec, so packets are copied untouched.
    showWarnings: false,
  });
  if (!conversion.isValid) {
    throw new Error(`Export niet mogelijk: ${conversion.discardedTracks.map((t) => `${t.track.type}: ${t.reason}`).join(", ")}`);
  }
  if (canceled) throw new ConversionCanceledError();
  conversion.onProgress = (progress) => post({ type: "progress", progress });
  await conversion.execute();
}
