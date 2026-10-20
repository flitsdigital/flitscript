import { memo } from "react";
import type { VideoMeta } from "../media/probe";
import { formatBitrate, formatBytes, formatTime } from "./format";
import { Card } from "./kit";

// Memo: the editor re-renders every video frame; the metadata never changes with it.
export const MetaPanel = memo(function MetaPanel({ meta }: { meta: VideoMeta }) {
  const { timing, colorSpace, audio } = meta;
  const sections: [string, [string, string][]][] = [
    [
      "Bestand",
      [
        ["Naam", meta.fileName],
        ["Grootte", formatBytes(meta.fileSize)],
        ["Duur", formatTime(meta.duration)],
      ],
    ],
    [
      "Beeld",
      [
        ["Resolutie", `${meta.width} × ${meta.height}${meta.rotation ? ` (gedraaid ${meta.rotation}°)` : ""}`],
        ["Framerate", `${timing.averageFps.toFixed(2)} fps${timing.isVfr ? ` variabel (${timing.minFps.toFixed(1)}–${timing.maxFps.toFixed(1)})` : ""}`],
        ["Frames", String(meta.frameCount)],
        ["Codec", meta.codecString ?? meta.codec],
        ["Bitrate", formatBitrate(meta.videoBitrate)],
        ["HDR", meta.hdr ? "ja" : "nee"],
        ["Kleur", `${colorSpace.primaries ?? "?"} / ${colorSpace.transfer ?? "?"}`],
      ],
    ],
    ["Geluid", [["Audio", audio ? `${audio.codec}, ${audio.sampleRate / 1000} kHz, ${audio.channels} kanalen` : "geen"]]],
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-100 px-4">
        <h2 className="text-[15px] font-semibold">Bronvideo</h2>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {sections.map(([title, rows]) => (
          <Card key={title}>
            <p className="font-medium">{title}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-neutral-500">{label}</dt>
                  <dd className="text-right break-words tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
        {!meta.canDecode && <p className="text-red-600">Deze browser kan de videocodec niet decoderen; exporteren werkt niet.</p>}
        {audio && !audio.canDecode && <p className="text-red-600">Deze browser kan de audiocodec niet decoderen; transcriberen werkt niet.</p>}
      </div>
    </div>
  );
});
