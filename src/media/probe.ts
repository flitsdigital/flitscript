import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import { summarizeFrameTiming, type FrameTiming } from "./frame-timing";

export type VideoMeta = {
  fileName: string;
  fileSize: number;
  /** Display size, rotation applied. */
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
  rotation: number;
  codec: string;
  codecString: string | null;
  canDecode: boolean;
  timing: FrameTiming;
  frameCount: number;
  duration: number;
  videoBitrate: number;
  totalBitrate: number;
  hdr: boolean;
  colorSpace: VideoColorSpaceInit;
  audio: { codec: string; sampleRate: number; channels: number; canDecode: boolean } | null;
};

export class ProbeError extends Error {}

export async function probe(file: File): Promise<VideoMeta> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) throw new ProbeError("Dit bestandsformaat wordt niet herkend.");
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new ProbeError("Dit bestand bevat geen videospoor.");
    const audio = await input.getPrimaryAudioTrack();

    // metadataOnly reads the sample table, not the frame data, so this stays fast for 4K files.
    const timestamps: number[] = [];
    for await (const packet of new EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) {
      timestamps.push(packet.timestamp);
    }

    const [duration, stats, codecString, canDecode, hdr, colorSpace] = await Promise.all([
      input.computeDuration(),
      video.computePacketStats(),
      video.getCodecParameterString(),
      video.canDecode(),
      video.hasHighDynamicRange(),
      video.getColorSpace(),
    ]);

    return {
      fileName: file.name,
      fileSize: file.size,
      width: video.displayWidth,
      height: video.displayHeight,
      codedWidth: video.codedWidth,
      codedHeight: video.codedHeight,
      rotation: video.rotation,
      codec: video.codec ?? "onbekend",
      codecString,
      canDecode,
      timing: summarizeFrameTiming(timestamps),
      frameCount: timestamps.length,
      duration,
      videoBitrate: stats.averageBitrate,
      totalBitrate: (file.size * 8) / duration,
      hdr,
      colorSpace,
      audio: audio && {
        codec: audio.codec ?? "onbekend",
        sampleRate: audio.sampleRate,
        channels: audio.numberOfChannels,
        canDecode: await audio.canDecode(),
      },
    };
  } finally {
    input.dispose();
  }
}
