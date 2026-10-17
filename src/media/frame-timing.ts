export type FrameTiming = {
  averageFps: number;
  minFps: number;
  maxFps: number;
  isVfr: boolean;
};

// A frame interval more than 10% off the median counts as variable frame rate.
const VFR_TOLERANCE = 0.1;

/** Summarises presentation timestamps (seconds, any order) of a video track. */
export function summarizeFrameTiming(timestamps: readonly number[]): FrameTiming {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i]! - sorted[i - 1]!;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return { averageFps: 0, minFps: 0, maxFps: 0, isVfr: false };

  const ordered = [...deltas].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)]!;
  const span = sorted[sorted.length - 1]! - sorted[0]!;
  return {
    averageFps: deltas.length / span,
    minFps: 1 / ordered[ordered.length - 1]!,
    maxFps: 1 / ordered[0]!,
    isVfr: deltas.some((delta) => Math.abs(delta - median) / median > VFR_TOLERANCE),
  };
}

/** Time to seek to for the frame `direction` frames away, aimed at the middle of that frame. */
export function stepFrameTime(time: number, fps: number, direction: 1 | -1, duration: number): number {
  const frame = Math.floor(time * fps + 1e-6) + direction;
  const lastFrame = Math.max(0, Math.ceil(duration * fps) - 1);
  const clamped = Math.min(Math.max(frame, 0), lastFrame);
  return (clamped + 0.5) / fps;
}
