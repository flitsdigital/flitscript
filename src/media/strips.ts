import { ALL_FORMATS, AudioSampleSink, BlobSource, CanvasSink, Input } from "mediabunny";

/** Evenly spaced JPEG thumbnails for the timeline filmstrip. */
export async function thumbnails(file: File, duration: number, count: number, height = 96): Promise<string[]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const width = Math.round((height * track.displayWidth) / track.displayHeight);
    const sink = new CanvasSink(track, { width, height, fit: "cover" });
    const times = Array.from({ length: count }, (_, i) => ((i + 0.5) * duration) / count);
    const urls: string[] = [];
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (!frame) continue;
      // On the main thread CanvasSink always hands out an HTMLCanvasElement.
      urls.push((frame.canvas as HTMLCanvasElement).toDataURL("image/jpeg", 0.7));
    }
    return urls;
  } finally {
    input.dispose();
  }
}

/** Peak level (0..1) of the first audio channel in `buckets` equal slices of the video. */
export async function waveform(file: File, duration: number, buckets: number): Promise<Float32Array> {
  const peaks = new Float32Array(buckets);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return peaks;
    let buffer = new Float32Array(0);
    for await (const sample of new AudioSampleSink(track).samples()) {
      const frames = sample.numberOfFrames;
      if (buffer.length < frames) buffer = new Float32Array(frames);
      sample.copyTo(buffer, { planeIndex: 0, format: "f32-planar" });
      const rate = frames / Math.max(sample.duration, 1e-6);
      for (let i = 0; i < frames; i += 32) {
        const bucket = Math.floor(((sample.timestamp + i / rate) / duration) * buckets);
        if (bucket >= 0 && bucket < buckets) peaks[bucket] = Math.max(peaks[bucket]!, Math.abs(buffer[i]!));
      }
      sample.close();
    }
    const max = Math.max(...peaks, 1e-6);
    return peaks.map((p) => p / max);
  } finally {
    input.dispose();
  }
}
