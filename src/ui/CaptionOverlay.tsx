import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { captionBoxAt, renderCaptions, type Rect } from "../captions/render";
import { effectiveStyle } from "../captions/style";
import type { StyleScope } from "../project/commands";
import { groupWords } from "../project/model";
import type { CaptionGroup, Project, StyleOverride, StylePreset, Word } from "../project/types";
import { ColorPicker } from "./ColorPicker";

export type OverlayEditing = {
  selectedId: string | null;
  onSelect: (groupId: string) => void;
  scope: StyleScope;
  onScope: (scope: StyleScope) => void;
  /** Applies a style change to all captions or to this block only, depending on `scope`. */
  onPatch: (groupId: string, patch: StyleOverride, gesture?: string) => void;
  onResetGroup: (groupId: string) => void;
  onToggleAccent: (groupId: string, wordId: string) => void;
};

type Size = { width: number; height: number };
type Hit = { groupId: string; box: Rect };

const SNAP = 0.02;
const clamp = (v: number) => Math.min(Math.max(v, 0.05), 0.95);

/** Fills its (video-sized) parent; draws captions for the exact frame the video is showing and lets you move and style them. */
export function CaptionOverlay({
  videoRef,
  project,
  safeZone,
  editing,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  project: Project | null;
  safeZone: boolean;
  editing: OverlayEditing;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [snapped, setSnapped] = useState(false);
  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    const root = rootRef.current!;
    const update = () => setSize({ width: root.clientWidth, height: root.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(root);
    update();
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const p = projectRef.current;
      if (!p) return setHit(null);
      const output = { width: canvas.width, height: canvas.height };
      renderCaptions(ctx, time, p, output);
      // Remember where the caption sits (in CSS pixels) so it can be clicked and dragged.
      const found = captionBoxAt(ctx, time, p, output);
      const next = found && { groupId: found.groupId, box: { x: found.box.x / dpr, y: found.box.y / dpr, width: found.box.width / dpr, height: found.box.height / dpr } };
      setHit((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    },
    [dpr],
  );

  useEffect(() => {
    const video = videoRef.current!;
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      draw(frame.mediaTime);
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    const onSeeked = () => draw(video.currentTime);
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.cancelVideoFrameCallback(handle);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [videoRef, draw]);

  useEffect(() => draw(videoRef.current!.currentTime), [project, size, draw, videoRef]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !hit || !size) return;
    event.preventDefault();
    const { groupId, box } = hit;
    editing.onSelect(groupId);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const gesture = `move:${event.timeStamp}`;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) < 3) return; // a click, not a drag
      let positionX = clamp((centre.x + dx) / size.width);
      const snap = Math.abs(positionX - 0.5) < SNAP;
      if (snap) positionX = 0.5;
      setSnapped(snap);
      editing.onPatch(groupId, { positionX, positionY: clamp((centre.y + dy) / size.height) }, gesture);
    };
    const up = () => {
      setSnapped(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  const selectedGroup = hit && project?.groups.find((g) => g.id === hit.groupId && g.id === editing.selectedId);
  const style = selectedGroup && project ? effectiveStyle(project.style, selectedGroup) : null;
  const below = hit && size ? hit.box.y + hit.box.height + 96 < size.height : true;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      {size && <canvas ref={canvasRef} width={Math.round(size.width * dpr)} height={Math.round(size.height * dpr)} className="h-full w-full" />}
      {safeZone && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[20%] border-t border-dashed border-red-400 bg-red-500/25" />
          <div className="absolute top-0 right-0 bottom-[20%] w-[15%] border-l border-dashed border-red-400 bg-red-500/25" />
        </>
      )}
      {snapped && <div className="absolute inset-y-0 left-1/2 w-px bg-flits" />}
      {hit && (
        <div
          title="Klik om te selecteren, sleep om te verplaatsen"
          onPointerDown={startDrag}
          // Select first, so the context menu acts on this caption and not on the one selected elsewhere.
          onContextMenu={() => editing.onSelect(hit.groupId)}
          className={`pointer-events-auto absolute cursor-move rounded-md border-2 transition-colors ${
            selectedGroup ? "border-flits" : "border-transparent hover:border-white/70"
          }`}
          style={{ left: hit.box.x, top: hit.box.y, width: hit.box.width, height: hit.box.height }}
        />
      )}
      {hit &&
        selectedGroup &&
        style &&
        rootRef.current &&
        // Portal so the toolbar can be wider than a portrait video without being clipped by its frame.
        createPortal(
          <CaptionToolbar
            style={style}
            words={groupWords(project!.words, selectedGroup)}
            editing={editing}
            group={selectedGroup}
            position={{
              left: rootRef.current.getBoundingClientRect().left + hit.box.x + hit.box.width / 2,
              top: rootRef.current.getBoundingClientRect().top + (below ? hit.box.y + hit.box.height + 8 : hit.box.y - 8),
            }}
            above={!below}
          />,
          document.body,
        )}
    </div>
  );
}

function CaptionToolbar({
  style,
  words,
  editing,
  group,
  position,
  above,
}: {
  style: StylePreset;
  words: Word[];
  editing: OverlayEditing;
  group: CaptionGroup;
  position: { left: number; top: number };
  above: boolean;
}) {
  const groupId = group.id;
  const patch = (p: StyleOverride, gesture?: string) => editing.onPatch(groupId, p, gesture);
  // Only the size: a block that is just bigger keeps following the project's font family.
  const size = (delta: number) => patch({ font: { size: Math.min(0.12, Math.max(0.015, +(style.font.size + delta).toFixed(4))) } }, "size");
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={`pointer-events-auto fixed z-20 flex -translate-x-1/2 flex-col gap-1 rounded-xl bg-white p-1 text-ink shadow-lg ring-1 ring-black/10 ${above ? "-translate-y-full" : ""}`}
      style={position}
    >
      <div className="flex items-center gap-1">
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs font-medium">
          {(["all", "group"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => editing.onScope(s)}
              className={`rounded-md px-2 py-1 whitespace-nowrap ${editing.scope === s ? "bg-white shadow-sm" : "text-neutral-500 hover:text-ink"}`}
            >
              {s === "all" ? "Alle captions" : "Alleen deze"}
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-5 w-px bg-neutral-200" />
        <ToolButton label="Kleiner" onClick={() => size(-0.002)}>
          <Minus size={14} />
        </ToolButton>
        <span className="w-9 text-center text-xs tabular-nums">{(style.font.size * 100).toFixed(1)}</span>
        <ToolButton label="Groter" onClick={() => size(0.002)}>
          <Plus size={14} />
        </ToolButton>
        <span className="mx-0.5 h-5 w-px bg-neutral-200" />
        <ColorPicker variant="swatch" label="Tekstkleur" value={style.textColor} onChange={(textColor) => patch({ textColor }, "textColor")} />
        <ColorPicker variant="swatch" label="Accentkleur" value={style.accentColors[0] ?? style.textColor} onChange={(c) => patch({ accentColors: [c, ...style.accentColors.slice(1)] }, "accent")} />
        {!!group.override && (
          <>
            <span className="mx-0.5 h-5 w-px bg-neutral-200" />
            <ToolButton label="Eigen stijl van deze caption wissen" onClick={() => editing.onResetGroup(groupId)}>
              <RotateCcw size={14} />
            </ToolButton>
          </>
        )}
      </div>
      {/* Its own row, sized to the controls above (w-0 min-w-full) so a long caption wraps instead of widening the bar. */}
      <div className="flex w-0 min-w-full flex-wrap gap-0.5 border-t border-neutral-100 pt-1">
        {words.map((w) => (
          <button
            key={w.id}
            type="button"
            title="Accent aan/uit"
            onClick={() => editing.onToggleAccent(groupId, w.id)}
            className={`rounded-md px-1.5 py-1 text-xs whitespace-nowrap transition-colors ${
              group.accentWordIds.includes(w.id) ? "bg-ink font-semibold text-flits" : "text-neutral-600 hover:bg-neutral-100 hover:text-ink"
            }`}
          >
            {w.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex size-7 items-center justify-center rounded-md hover:bg-neutral-100">
      {children}
    </button>
  );
}
