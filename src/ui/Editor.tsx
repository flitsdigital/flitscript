import { ArrowLeft, Captions, Check, CloudOff, Download, Info, LoaderCircle, Palette, Redo2, Replace, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { addCustomFont, ensureFont, useFontFamilies } from "../captions/fonts";
import { usedFonts } from "../captions/style";
import { pickVideo } from "../media/file-handles";
import { stepFrameTime } from "../media/frame-timing";
import { ProbeError, type VideoMeta } from "../media/probe";
import { createAutosave, type SaveState } from "../project/autosave";
import { newGroupId, styleCommand, type Command, type StyleScope } from "../project/commands";
import { historyReducer, initHistory } from "../project/history";
import { linkSourceVideo, readSourceVideo } from "../project/source-video";
import { deletePreset, downloadFont, listFonts, listPresets, saveGlossary, savePreset, updateProject, uploadFont } from "../project/store";
import { findActiveIndex } from "../project/timing";
import type { Project, StylePreset } from "../project/types";
import type { OverlayEditing } from "./CaptionOverlay";
import { CaptionsPanel } from "./CaptionsPanel";
import { EditorMenu, type MenuActions } from "./EditorMenu";
import { ExportDialog } from "./ExportDialog";
import type { OpenedProject } from "./Home";
import { Button, IconButton } from "./kit";
import { MetaPanel } from "./MetaPanel";
import { Preview } from "./Preview";
import { StylePanel } from "./StylePanel";
import { Timeline } from "./Timeline";

type Source = { file: File; meta: VideoMeta };
type PanelId = "captions" | "style" | "source";

const SAVE_DELAY_MS = 800;

// Every input counts: arrows and Backspace on a focused slider must move the slider, not the video or the selection.
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function Editor({ opened, onExit }: { opened: OpenedProject; onExit: () => void }) {
  const projectId = opened.id;
  const clientId = opened.client?.id ?? null;
  const [source, setSource] = useState<Source>({ file: opened.file, meta: opened.meta });
  // Created and revoked in one effect, so React's dev double-run can't revoke a URL that's still in use.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(source.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source.file]);
  const [error, setError] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<PanelId>("captions");
  const [history, dispatch] = useReducer(historyReducer, opened.data, initHistory);
  const project = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<StylePreset[]>([]);
  const [readyFonts, setReadyFonts] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<StyleScope>("all");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [autosave] = useState(() =>
    createAutosave(async (data: Project) => void (await updateProject(projectId, { data })), opened.data, setSaveState, SAVE_DELAY_MS),
  );

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
      video.pause();
      video.currentTime = stepFrameTime(video.currentTime, source.meta.timing.averageFps, direction, source.meta.duration);
    },
    [source],
  );

  // Captions only render once all their fonts are loaded; layouts measured with a fallback font would stay cached.
  // `families` changes when the client's uploaded fonts arrive, so a project using one retries after the download.
  const families = useFontFamilies();
  const fonts = useMemo(() => usedFonts(project), [project]);
  const fontKey = fonts.map((f) => `${f.family}|${f.weight}`).join(",");
  useEffect(() => {
    let live = true;
    Promise.all(fonts.map((f) => ensureFont(f.family, f.weight))).then(
      () => {
        if (!live) return;
        setReadyFonts(fontKey);
        setFontError(null);
      },
      (e) => live && setFontError(`Lettertype kon niet laden: ${String(e)}`),
    );
    return () => {
      live = false;
    };
    // fontKey describes `fonts` exactly; `fonts` itself is a new array every render.
  }, [fontKey, families]);
  const renderable = readyFonts === fontKey && project.groups.length ? project : null;

  // Autosave: every change lands in Supabase shortly after it stops.
  useEffect(() => autosave.change(project), [autosave, project]);
  useEffect(() => autosave.dispose, [autosave]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => saveState !== "saved" && e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // The client's own presets and fonts.
  useEffect(() => {
    listPresets(clientId).then(setCustomPresets, (e) => setError(String(e)));
    listFonts(clientId)
      .then((fonts) => Promise.all(fonts.map(async (f) => addCustomFont(await downloadFont(f)))))
      .catch((e) => setError(`Lettertypes van de klant konden niet laden: ${String(e)}`));
  }, [clientId]);

  // Stays in the editor when the last changes couldn't be saved; the save indicator offers a retry.
  async function exit() {
    if (await autosave.flush()) onExit();
  }

  // A deleted block's id can come back on a new block (ids are "highest + 1"), so drop a selection that points nowhere.
  useEffect(() => {
    if (selectedId && !project.groups.some((g) => g.id === selectedId)) setSelectedId(null);
  }, [project.groups, selectedId]);

  async function replaceVideo() {
    const picked = await pickVideo();
    if (!picked) return;
    setError(null);
    setNotice(null);
    try {
      const video = await readSourceVideo(picked.file);
      const { meta } = video;
      setSource({ file: video.file, meta });
      setTime(0);
      setPlaying(false); // the old <video> unmounts without firing "pause"
      // Captions, style and undo history stay; only the footage underneath changes.
      const lastEnd = Math.max(0, ...project.groups.map((g) => g.end));
      if (lastEnd > meta.duration + 0.05) {
        setNotice(`De nieuwe video is ${(lastEnd - meta.duration).toFixed(1)} s korter dan de captions; captions na ${meta.duration.toFixed(1)} s vallen buiten beeld.`);
      }
      await linkSourceVideo(projectId, video, picked.handle);
    } catch (e) {
      setError(e instanceof ProbeError ? e.message : `Kon het bestand niet lezen: ${String(e)}`);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Edits behind the export dialog would change what's on screen, and emptying the project closes (and cancels) it.
      if (exporting || isTyping(event.target)) return;
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
  }, [project.groups, run, playPause, step, selectedId, renderable, exporting]);

  const addCaption = () => {
    const id = newGroupId(project);
    run({ type: "addGroup", id, time: videoRef.current!.currentTime, maxEnd: source.meta.duration });
    setSelectedId(id);
    setPanel("captions");
  };
  const savePresetAs = useCallback(
    async (name: string) => {
      const saved = await savePreset(clientId, { ...project.style, name });
      setCustomPresets((p) => [...p, saved]);
      setStyle(saved);
    },
    [clientId, project.style, setStyle],
  );
  const removePreset = useCallback(async (id: string) => {
    await deletePreset(id);
    setCustomPresets((p) => p.filter((x) => x.id !== id));
  }, []);
  const uploadClientFont = useCallback(
    async (file: File) => {
      const fontFamily = await addCustomFont(file);
      void uploadFont(clientId, fontFamily, file).catch((e) => setError(String(e)));
      return fontFamily;
    },
    [clientId],
  );
  const clearAccents = useCallback(() => run({ type: "clearAccents" }), [run]);

  const editing: OverlayEditing = {
    selectedId,
    onSelect: setSelectedId,
    scope,
    onScope: setScope,
    onPatch: (groupId, patch, gesture) => {
      const change = styleCommand(project, scope, groupId, patch, gesture);
      run(change.command, change.gesture);
    },
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
    replaceVideo: () => void replaceVideo(),
    newVideo: () => void exit(),
    exportVideo: () => setExporting(true),
  };

  return (
    <div className="flex h-full">
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-3">
        <button type="button" title="Terug naar projecten" onClick={() => void exit()} className="mb-3 rounded-xl transition-opacity hover:opacity-80">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-[15px] font-black text-flits">F</span>
        </button>
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
                initialGlossary={opened.client?.glossary ?? []}
                onGlossary={(terms) => clientId && void saveGlossary(clientId, terms).catch((e) => setError(String(e)))}
              />
            </div>
            <div className={panel === "style" ? "h-full" : "hidden"}>
              <StylePanel
                style={project.style}
                onStyle={setStyle}
                customPresets={customPresets}
                onSavePreset={savePresetAs}
                onDeletePreset={removePreset}
                onUploadFont={uploadClientFont}
                onClearAccents={clearAccents}
              />
            </div>
            <div className={panel === "source" ? "h-full" : "hidden"}>
              <MetaPanel meta={source.meta} />
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 px-4">
              <IconButton label="Terug naar projecten" onClick={() => void exit()}>
                <ArrowLeft size={16} />
              </IconButton>
              <span className="truncate font-medium">{opened.name}</span>
              {opened.client && <span className="shrink-0 rounded-md bg-neutral-200/70 px-1.5 py-0.5 text-xs text-neutral-600">{opened.client.name}</span>}
              <SaveIndicator state={saveState} onRetry={() => void autosave.flush()} />
              <div className="ml-auto flex items-center gap-1">
                <IconButton label="Ongedaan maken (⌘Z)" disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>
                  <Undo2 size={16} />
                </IconButton>
                <IconButton label="Opnieuw (⌘⇧Z)" disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>
                  <Redo2 size={16} />
                </IconButton>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <Button variant="secondary" icon={<Replace size={15} />} onClick={() => void replaceVideo()}>
                  Video vervangen
                </Button>
                <Button variant="primary" icon={<Download size={15} />} disabled={!renderable} onClick={() => setExporting(true)}>
                  Exporteren
                </Button>
              </div>
            </header>
            {(error ?? fontError) && <p className="enter mx-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error ?? fontError}</p>}
            {notice && <p className="enter mx-4 rounded-lg bg-orange-50 px-3 py-2 text-orange-800">{notice}</p>}
            <EditorMenu actions={menu}>
              <div className="flex min-h-0 flex-1 flex-col">
                {url && <Preview key={url} src={url} meta={source.meta} videoRef={videoRef} onTime={setTime} onPlaying={setPlaying} project={renderable} editing={editing} />}
              </div>
            </EditorMenu>
          </main>
        </div>

        <EditorMenu actions={menu}>
          <div>
            {/* Only with a url: a first mount without it would decode thumbnails and waveform once more for nothing. */}
            {url && (
              <Timeline
                key={url}
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
            )}
          </div>
        </EditorMenu>
      </div>

      {exporting && renderable && <ExportDialog projectId={projectId} file={source.file} meta={source.meta} project={renderable} onClose={() => setExporting(false)} />}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "saving")
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
        <LoaderCircle size={12} className="animate-spin" /> Opslaan…
      </span>
    );
  if (state === "error")
    return (
      <button type="button" onClick={onRetry} className="flex shrink-0 items-center gap-1 text-xs text-red-600 hover:underline">
        <CloudOff size={12} /> Niet opgeslagen, opnieuw proberen
      </button>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
      <Check size={12} /> Opgeslagen
    </span>
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
