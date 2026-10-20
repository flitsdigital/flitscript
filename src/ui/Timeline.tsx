import { Merge, Pause, Play, Plus, Scissors, StepBack, StepForward, Trash, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { thumbnails, waveform } from "../media/strips";
import type { Command } from "../project/commands";
import { groupText } from "../project/model";
import { findActiveIndex, showTime } from "../project/timing";
import type { CaptionGroup, Project } from "../project/types";
import { formatTime } from "./format";
import { Button, IconButton } from "./kit";

type Run = (command: Command, gesture?: string) => void;

type Props = {
  file: File;
  project: Project;
  duration: number;
  time: number;
  playing: boolean;
  onPlayPause: () => void;
  onStep: (direction: 1 | -1) => void;
  selectedId: string | null;
  onSelect: (groupId: string | null) => void;
  onSeek: (time: number) => void;
  run: Run;
  onAddCaption: () => void;
};

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60];
const WAVE_BUCKETS = 1200;

export function Timeline({ file, project, duration, time, playing, onPlayPause, onStep, selectedId, onSelect, onSeek, run, onAddCaption }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const pps = (Math.max(width - 32, 100) / duration) * zoom;
  const tick = TICK_STEPS.find((s) => s * pps >= 80) ?? 120;
  const activeGroup = project.groups[findActiveIndex(project.groups, time)];
  const selectedIndex = project.groups.findIndex((g) => g.id === selectedId);
  const texts = useMemo(() => new Map(project.groups.map((g) => [g.id, groupText(project.words, g)])), [project.words, project.groups]);

  useEffect(() => {
    let live = true;
    thumbnails(file, duration, Math.min(40, Math.max(8, Math.ceil(duration))))
      .then((t) => live && setThumbs(t))
      .catch(() => {});
    waveform(file, duration, WAVE_BUCKETS)
      .then((p) => live && setPeaks(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [file, duration]);

  useEffect(() => {
    const el = scrollRef.current!;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the playhead in view while playing or seeking.
  useEffect(() => {
    const el = scrollRef.current!;
    const x = time * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 32) el.scrollLeft = x - el.clientWidth * 0.3;
  }, [time, pps]);

  // Stable across playback re-renders so memoised blocks don't re-render every frame.
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const timeAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      return Math.min(Math.max((clientX - rect.left) / ppsRef.current, 0), duration);
    },
    [duration],
  );

  function scrub(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(null);
    onSeek(timeAt(event.clientX));
  }
  const scrubMove = (event: ReactPointerEvent) =>
    event.buttons === 1 && event.currentTarget.hasPointerCapture(event.pointerId) && onSeek(timeAt(event.clientX));

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-neutral-200 bg-white">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-neutral-100 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" icon={<Plus size={15} />} disabled={!!activeGroup} title="Nieuwe caption op de afspeelpositie (alleen tussen captions)" onClick={onAddCaption}>
            Caption
          </Button>
          <Button variant="ghost" icon={<Scissors size={15} />} disabled={!activeGroup} onClick={() => activeGroup && run({ type: "splitGroup", groupId: activeGroup.id, time })}>
            Splitsen
          </Button>
          <Button
            variant="ghost"
            icon={<Merge size={15} />}
            disabled={selectedIndex < 0 || selectedIndex === project.groups.length - 1}
            onClick={() => selectedId && run({ type: "mergeWithNext", groupId: selectedId })}
          >
            Samenvoegen
          </Button>
          <Button variant="ghost" icon={<Trash size={15} />} disabled={selectedIndex < 0} onClick={() => selectedId && run({ type: "deleteGroup", groupId: selectedId })}>
            Verwijderen
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Vorig frame (←)" onClick={() => onStep(-1)}>
            <StepBack size={16} />
          </IconButton>
          <button
            type="button"
            aria-label={playing ? "Pauzeren (spatie)" : "Afspelen (spatie)"}
            onClick={onPlayPause}
            className="flex size-9 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-neutral-700"
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
          </button>
          <IconButton label="Volgend frame (→)" onClick={() => onStep(1)}>
            <StepForward size={16} />
          </IconButton>
          <span className="ml-2 w-32 tabular-nums text-neutral-500">
            <span className="font-medium text-ink">{formatTime(time)}</span> / {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Uitzoomen" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            <ZoomOut size={16} />
          </IconButton>
          <input type="range" aria-label="Zoom" className="slider w-28!" min={1} max={20} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          <IconButton label="Inzoomen" onClick={() => setZoom((z) => Math.min(20, z * 1.5))}>
            <ZoomIn size={16} />
          </IconButton>
          <Button variant="ghost" onClick={() => setZoom(1)}>
            Passend
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden px-4">
        <div ref={trackRef} className="relative h-full" style={{ width: duration * pps }}>
          <div className="absolute inset-x-0 top-0 h-6 cursor-pointer" onPointerDown={scrub} onPointerMove={scrubMove}>
            {Array.from({ length: Math.floor(duration / tick) + 1 }, (_, i) => (
              <span key={i} className="absolute top-1.5 -translate-x-1/2 text-[10px] tabular-nums text-neutral-400" style={{ left: i * tick * pps }}>
                {formatTick(i * tick)}
              </span>
            ))}
          </div>
          <div className="absolute inset-x-0 top-7 bottom-2 flex flex-col gap-1.5" onPointerDown={scrub} onPointerMove={scrubMove}>
            <Filmstrip thumbs={thumbs} />
            <div className="relative h-11">
              {project.groups.map((group) => (
                <Block
                  key={group.id}
                  group={group}
                  text={texts.get(group.id) ?? ""}
                  pps={pps}
                  selected={group.id === selectedId}
                  timeAt={timeAt}
                  onSelect={onSelect}
                  onSeek={onSeek}
                  run={run}
                />
              ))}
            </div>
            <Waveform peaks={peaks} width={duration * pps} />
          </div>
          <div className="pointer-events-none absolute top-0 bottom-0 z-10 -translate-x-1/2" style={{ left: time * pps }}>
            <div className="mx-auto h-3 w-3 rounded-t-sm rounded-b-[4px] bg-ink" />
            <div className="mx-auto h-full w-0.5 bg-ink" />
          </div>
        </div>
      </div>
    </section>
  );
}

const formatTick = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${s % 1 ? ".5" : ""}`;

const Filmstrip = memo(function Filmstrip({ thumbs }: { thumbs: string[] }) {
  return (
    <div className="flex h-12 shrink-0 overflow-hidden rounded-md bg-neutral-100">
      {thumbs.map((src, i) => (
        <img key={i} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />
      ))}
    </div>
  );
});

const Waveform = memo(function Waveform({ peaks, width }: { peaks: Float32Array | null; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(32 * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#a3a3a3";
    const bar = canvas.width / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * canvas.height * 0.95);
      ctx.fillRect(i * bar, (canvas.height - h) / 2, Math.max(bar * 0.7, 1), h);
    });
  }, [peaks, width]);
  return <canvas ref={ref} className="h-8 w-full shrink-0 rounded-md bg-neutral-50" />;
});

type BlockProps = {
  group: CaptionGroup;
  text: string;
  pps: number;
  selected: boolean;
  timeAt: (clientX: number) => number;
  onSelect: (groupId: string) => void;
  onSeek: (time: number) => void;
  run: Run;
};

const Block = memo(function Block({ group, text, pps, selected, timeAt, onSelect, onSeek, run }: BlockProps) {
  function dragEdge(edge: "start" | "end") {
    return (event: ReactPointerEvent) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(group.id);
      const gesture = `edge:${group.id}:${edge}:${event.timeStamp}`;
      const target = event.currentTarget as HTMLElement;
      const move = (e: PointerEvent) => {
        const t = timeAt(e.clientX);
        run({ type: "setGroupTiming", groupId: group.id, start: edge === "start" ? t : group.start, end: edge === "end" ? t : group.end }, gesture);
        onSeek(t);
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
    };
  }

  return (
    <div
      title={text}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        onSelect(group.id);
        onSeek(showTime(group));
      }}
      // Right-click selects the block so the context menu acts on it; the event still bubbles to the menu trigger.
      onContextMenu={() => onSelect(group.id)}
      className={`group absolute top-0 bottom-0 flex cursor-pointer items-center overflow-hidden rounded-md border px-2 text-[11px] leading-tight font-medium transition-colors ${
        selected ? "border-ink bg-flits text-ink" : "border-flits-deep/40 bg-flits-soft text-neutral-800 hover:bg-flits/60"
      }`}
      style={{ left: group.start * pps, width: Math.max((group.end - group.start) * pps, 3) }}
    >
      <span className="line-clamp-2">{text}</span>
      <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-ink/70 opacity-0 group-hover:opacity-100" onPointerDown={dragEdge("start")} />
      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-ink/70 opacity-0 group-hover:opacity-100" onPointerDown={dragEdge("end")} />
    </div>
  );
});
