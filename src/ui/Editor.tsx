import { Captions, Download, Film, Info, LoaderCircle, Palette, Redo2, Replace, Undo2, Upload } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ensureFont } from "../captions/fonts";
import { PRESETS } from "../captions/presets";
import { stepFrameTime } from "../media/frame-timing";
import { probe, ProbeError, type VideoMeta } from "../media/probe";
import { newGroupId, type Command } from "../project/commands";
import { historyReducer, initHistory } from "../project/history";
import { findActiveIndex } from "../project/timing";
import type { StylePreset } from "../project/types";
import type { OverlayEditing, StyleScope } from "./CaptionOverlay";
import { CaptionsPanel } from "./CaptionsPanel";
import { EditorMenu, type MenuActions } from "./EditorMenu";
import { ExportDialog } from "./ExportDialog";
import { formatBytes } from "./format";
import { Button, IconButton } from "./kit";
import { MetaPanel } from "./MetaPanel";
import { Preview } from "./Preview";
import { StylePanel } from "./StylePanel";
import { Timeline } from "./Timeline";

type Source = { file: File; url: string; meta: VideoMeta };
type PanelId = "captions" | "style" | "source";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || (target instanceof HTMLInputElement && target.type === "text"));

export function Editor() {
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<PanelId>("captions");
  const [history, dispatch] = useReducer(historyReducer, { words: [], groups: [], style: PRESETS[0]! }, initHistory);
  const project = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // shortcut: custom presets live for this session only; fase 6 stores them per client in Supabase.
  const [customPresets, setCustomPresets] = useState<StylePreset[]>([]);
  const [readyFont, setReadyFont] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<StyleScope>("all");
  // Which action the hidden file input is serving: a fresh start, or swapping the footage under the current captions.
  const pickMode = useRef<"new" | "replace">("new");
  const pickFile = useCallback((mode: "new" | "replace") => {
    pickMode.current = mode;
    inputRef.current?.click();
  }, []);

  const run = useCallback((command: Command, gesture?: string) => dispatch({ type: "do", command, gesture, at: performance.now() }), []);
  const setStyle = useCallback((style: StylePreset, gesture?: string) => run({ type: "setStyle", style }, gesture && `style:${gesture}`), [run]);
  // Nudge past the boundary so the frame shown belongs to the target time.
  const seek = useCallback((t: number) => {
    videoRef.current!.currentTime = t + 0.001;
  }, []);
  const playPause = useCallback(() => {
    const video = videoRef.current!;
    void (video.paused ? video.play() : video.pause());
  }, []);
  const step = useCallback(
    (direction: 1 | -1) => {
      const video = videoRef.current!;
      if (!source) return;
      video.pause();
      video.currentTime = stepFrameTime(video.currentTime, source.meta.timing.averageFps, direction, source.meta.duration);
    },
    [source],
  );

  // Captions only render once their font is loaded; layouts measured with a fallback font would stay cached.
  const { family, weight } = project.style.font;
  const fontKey = `${family}|${weight}`;
  useEffect(() => {
    let live = true;
    ensureFont(family, weight).then(
      () => live && setReadyFont(fontKey),
      (e) => live && setError(`Lettertype kon niet laden: ${String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [family, weight, fontKey]);
  const renderable = readyFont === fontKey && project.groups.length ? project : null;

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!source) return;
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.code === "KeyE") {
        event.preventDefault();
        if (renderable) setExporting(true);
      } else if (mod && event.code === "KeyZ") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (mod && event.code === "KeyY") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod || event.altKey) {
        return;
      } else if (event.code === "Space") {
        event.preventDefault();
        playPause();
      } else if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
        event.preventDefault();
        step(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyS") {
        const t = videoRef.current!.currentTime;
        const group = project.groups[findActiveIndex(project.groups, t)];
        if (group) run({ type: "splitGroup", groupId: group.id, time: t });
      } else if ((event.code === "Backspace" || event.code === "Delete") && selectedId) {
        event.preventDefault();
        run({ type: "deleteGroup", groupId: selectedId });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, project.groups, run, playPause, step, selectedId, renderable]);

  async function load(file: File | undefined, mode: "new" | "replace" = "new") {
    if (!file) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const meta = await probe(file);
      setSource({ file, url: URL.createObjectURL(file), meta });
      setTime(0);
      if (mode === "replace") {
        // Captions, style and undo history stay; only the footage underneath changes.
        const lastEnd = Math.max(0, ...project.groups.map((g) => g.end));
        if (lastEnd > meta.duration + 0.05) {
          setNotice(`De nieuwe video is ${(lastEnd - meta.duration).toFixed(1)} s korter dan de captions; captions na ${meta.duration.toFixed(1)} s vallen buiten beeld.`);
        }
      } else {
        dispatch({ type: "reset", project: { words: [], groups: [], style: project.style } });
        setSelectedId(null);
        setPanel("captions");
      }
    } catch (e) {
      setError(e instanceof ProbeError ? e.message : `Kon het bestand niet lezen: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => e.currentTarget === e.target && setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void load(e.dataTransfer.files[0]);
    },
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="video/*,.mov,.mp4,.m4v"
      className="hidden"
      onChange={(e) => {
        void load(e.target.files?.[0], pickMode.current);
        e.target.value = ""; // allow picking the same file again
      }}
    />
  );

  if (!source) {
    return (
      <div className="flex h-full flex-col" {...dropHandlers}>
        <header className="flex h-14 items-center px-6">
          <Logo />
        </header>
        <main className="flex flex-1 items-center justify-center p-8">
          <button
            type="button"
            onClick={() => pickFile("new")}
            className={`flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-white px-10 py-16 text-center shadow-sm transition-colors ${
              dragging ? "border-flits-deep bg-flits-soft" : "border-neutral-300 hover:border-neutral-400"
            }`}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-flits">
              {loading ? <LoaderCircle size={26} className="animate-spin" /> : <Upload size={26} />}
            </span>
            <span className="space-y-1">
              <span className="block text-lg font-semibold">{loading ? "Video analyseren…" : "Sleep je video hierheen"}</span>
              <span className="block text-neutral-500">of klik om een bestand te kiezen · MP4 of MOV, tot 4K</span>
            </span>
            {error && <span className="text-red-600">{error}</span>}
          </button>
        </main>
        {fileInput}
      </div>
    );
  }

  const addCaption = () => {
    if (!source) return;
    const id = newGroupId(project);
    run({ type: "addGroup", id, time: videoRef.current!.currentTime, maxEnd: source.meta.duration });
    setSelectedId(id);
    setPanel("captions");
  };
  const editing: OverlayEditing = {
    selectedId,
    onSelect: setSelectedId,
    scope,
    onScope: setScope,
    onPatch: (groupId, patch, gesture) =>
      scope === "group"
        ? run({ type: "setGroupStyle", groupId, style: patch }, gesture && `group:${groupId}:${gesture}`)
        : setStyle({ ...project.style, ...patch }, gesture),
    onResetGroup: (groupId) => run({ type: "setGroupStyle", groupId, style: null }),
  };

  const target = project.groups.find((g) => g.id === selectedId) ?? project.groups[findActiveIndex(project.groups, time)];
  const targetIndex = target ? project.groups.indexOf(target) : -1;
  const atPlayhead = project.groups[findActiveIndex(project.groups, time)];
  const menu: MenuActions = {
    playing,
    hasCaption: !!target,
    hasNext: targetIndex >= 0 && targetIndex < project.groups.length - 1,
    canSplit: !!atPlayhead,
    canAdd: !atPlayhead,
    addCaption,
    canExport: !!renderable,
    playPause,
    split: () => atPlayhead && run({ type: "splitGroup", groupId: atPlayhead.id, time }),
    mergeNext: () => target && run({ type: "mergeWithNext", groupId: target.id }),
    deleteCaption: () => target && run({ type: "deleteGroup", groupId: target.id }),
    replaceVideo: () => pickFile("replace"),
    newVideo: () => pickFile("new"),
    exportVideo: () => setExporting(true),
  };

  return (
    <div className="flex h-full" {...dropHandlers}>
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-3">
        <div className="mb-3">
          <LogoMark />
        </div>
        <RailItem icon={<Captions size={18} />} label="Ondertitels" active={panel === "captions"} onClick={() => setPanel("captions")} />
        <RailItem icon={<Palette size={18} />} label="Stijl" active={panel === "style"} onClick={() => setPanel("style")} />
        <RailItem icon={<Info size={18} />} label="Bron" active={panel === "source"} onClick={() => setPanel("source")} />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <aside className="w-[360px] shrink-0 overflow-hidden border-r border-neutral-200 bg-white">
            {/* Panels stay mounted so a running transcription and the glossary survive switching tabs. */}
            <div className={panel === "captions" ? "h-full" : "hidden"}>
              <CaptionsPanel
                file={source.file}
                duration={source.meta.duration}
                onAddCaption={addCaption}
                project={project}
                run={run}
                time={time}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onSeek={seek}
              />
            </div>
            <div className={panel === "style" ? "h-full" : "hidden"}>
              <StylePanel
                style={project.style}
                onStyle={setStyle}
                customPresets={customPresets}
                onCustomPresets={setCustomPresets}
                onClearAccents={() => run({ type: "clearAccents" })}
              />
            </div>
            <div className={panel === "source" ? "h-full" : "hidden"}>
              <MetaPanel meta={source.meta} />
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 px-4">
              <Film size={16} className="shrink-0 text-neutral-400" />
              <span className="truncate font-medium">{source.file.name}</span>
              <span className="shrink-0 text-neutral-400">· {formatBytes(source.file.size)}</span>
              <div className="ml-auto flex items-center gap-1">
                <IconButton label="Ongedaan maken (⌘Z)" disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>
                  <Undo2 size={16} />
                </IconButton>
                <IconButton label="Opnieuw (⌘⇧Z)" disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>
                  <Redo2 size={16} />
                </IconButton>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <Button variant="secondary" icon={<Replace size={15} />} onClick={() => pickFile("replace")}>
                  Video vervangen
                </Button>
                <Button variant="primary" icon={<Download size={15} />} disabled={!renderable} onClick={() => setExporting(true)}>
                  Exporteren
                </Button>
              </div>
            </header>
            {error && <p className="mx-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            {notice && <p className="mx-4 rounded-lg bg-orange-50 px-3 py-2 text-orange-800">{notice}</p>}
            <EditorMenu actions={menu}>
              <div className="flex min-h-0 flex-1 flex-col">
                <Preview key={source.url} src={source.url} meta={source.meta} videoRef={videoRef} onTime={setTime} onPlaying={setPlaying} project={renderable} editing={editing} />
              </div>
            </EditorMenu>
          </main>
        </div>

        <EditorMenu actions={menu}>
          <div>
        <Timeline
          key={source.url}
          file={source.file}
          project={project}
          duration={source.meta.duration}
          time={time}
          playing={playing}
          onPlayPause={playPause}
          onStep={step}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          run={run}
          onAddCaption={addCaption}
        />
          </div>
        </EditorMenu>
      </div>

      {exporting && renderable && <ExportDialog file={source.file} meta={source.meta} project={renderable} onClose={() => setExporting(false)} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-flits-deep bg-flits-soft/80 text-lg font-semibold">
          Laat los om deze video te openen
        </div>
      )}
      {fileInput}
    </div>
  );
}

function RailItem({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-16 flex-col items-center gap-1 py-1.5 text-[11px] font-medium">
      <span
        className={`flex size-9 items-center justify-center rounded-xl transition-colors ${active ? "bg-flits text-ink" : "text-neutral-500 group-hover:bg-neutral-100 group-hover:text-ink"}`}
      >
        {icon}
      </span>
      <span className={active ? "text-ink" : "text-neutral-500"}>{label}</span>
    </button>
  );
}

function LogoMark() {
  return <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-[15px] font-black text-flits">F</span>;
}

function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold">
      <LogoMark />
      Flitscript
    </span>
  );
}
