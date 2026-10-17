import { useEffect, useState, type RefObject } from "react";
import type { VideoMeta } from "../media/probe";
import type { Project } from "../project/types";
import { CaptionOverlay, type OverlayEditing } from "./CaptionOverlay";
import { Switch } from "./kit";

type Props = {
  src: string;
  meta: VideoMeta;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  project: Project | null;
  editing: OverlayEditing;
};

export function Preview({ src, meta, videoRef, onTime, onPlaying, project, editing }: Props) {
  const [safeZone, setSafeZone] = useState(false);
  const [error, setError] = useState(false);

  // requestVideoFrameCallback reports the mediaTime of the frame actually on screen, also after seeks.
  useEffect(() => {
    const video = videoRef.current!;
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      onTime(frame.mediaTime);
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => video.cancelVideoFrameCallback(handle);
  }, [videoRef, onTime]);

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center gap-3 px-6 pt-4 pb-3">
      {/* Container units size the box to the video's aspect ratio, so the overlay always sits exactly on the picture. */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        <div
          className="relative overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-black/5"
          style={{ aspectRatio: `${meta.width} / ${meta.height}`, width: `min(100cqw, ${meta.width / meta.height} * 100cqh)` }}
        >
          <video
            ref={videoRef}
            src={src}
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full"
            onPlay={() => onPlaying(true)}
            onPause={() => onPlaying(false)}
            onSeeked={(e) => onTime(e.currentTarget.currentTime)}
            onError={() => setError(true)}
          />
          <CaptionOverlay videoRef={videoRef} project={project} safeZone={safeZone} editing={editing} />
          {error && (
            <p className="absolute inset-x-3 top-3 rounded-lg bg-red-600 px-3 py-2 text-white">De browser kan deze video niet afspelen in de preview.</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-full bg-white px-4 py-1.5 shadow-sm ring-1 ring-neutral-200">
        <label className="flex items-center gap-2 text-neutral-600">
          <Switch checked={safeZone} onChange={setSafeZone} label="Safe zone" />
          Safe zone
        </label>
        <span className="h-4 w-px bg-neutral-200" />
        <span className="text-neutral-500 tabular-nums">
          {meta.width} × {meta.height} · {meta.timing.averageFps.toFixed(meta.timing.averageFps % 1 ? 2 : 0)} fps
        </span>
      </div>
    </section>
  );
}
