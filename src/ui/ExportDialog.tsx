import { Check, Download, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fontSource } from "../captions/fonts";
import { containerFor, startExport, supportedCodecs, type VideoCodecChoice } from "../export/export";
import { toSrt, toVtt } from "../export/subtitles";
import type { VideoMeta } from "../media/probe";
import type { Project } from "../project/types";
import { formatBitrate, formatBytes } from "./format";
import { Button, fieldClass, IconButton } from "./kit";

type Props = { file: File; meta: VideoMeta; project: Project; onClose: () => void };

type State =
  | { kind: "idle" }
  | { kind: "running"; progress: number; startedAt: number; cancel: () => void }
  | { kind: "done"; name: string; size: number; seconds: number }
  | { kind: "canceled" }
  | { kind: "error"; message: string };

const BITRATE_FACTORS = [1, 1.5, 2];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return "…";
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s` : `${Math.max(1, Math.round(seconds))}s`;
}

export function ExportDialog({ file, meta, project, onClose }: Props) {
  const [codec, setCodec] = useState<VideoCodecChoice>("avc");
  const [factor, setFactor] = useState(1);
  const [support, setSupport] = useState<Record<VideoCodecChoice, boolean> | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, tick] = useState(0);
  const container = containerFor(meta);
  const bitrate = Math.round(meta.videoBitrate * factor);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const running = state.kind === "running";
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let live = true;
    supportedCodecs(meta, bitrate).then((s) => {
      if (!live) return;
      setSupport(s);
      if (!s.avc && s.hevc) setCodec("hevc");
    });
    return () => {
      live = false;
    };
  }, [meta, bitrate]);

  // Re-render once a second so the remaining-time estimate keeps moving between progress events.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Leaving the dialog mid-export cancels the job.
  useEffect(() => () => cancelRef.current?.(), []);

  async function exportVideo() {
    const extension = `.${container}`;
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: `${baseName}-captions${extension}`,
        types: [{ description: "Video", accept: { [container === "mov" ? "video/quicktime" : "video/mp4"]: [extension] } }],
      });
    } catch {
      return; // picker dismissed
    }
    const startedAt = performance.now();
    let finished = false;
    const job = startExport(
      {
        file,
        handle,
        project,
        fonts: [fontSource(project.style.font.family, project.style.font.weight)],
        width: meta.width,
        height: meta.height,
        codec,
        bitrate,
        fps: meta.timing.averageFps,
        container,
      },
      (progress) => setState((s) => (s.kind === "running" ? { ...s, progress } : s)),
    );
    cancelRef.current = job.cancel;
    setState({ kind: "running", progress: 0, startedAt, cancel: job.cancel });
    try {
      const result = await job.done;
      finished = result === "done";
      if (result === "done") {
        const written = await handle.getFile();
        setState({ kind: "done", name: written.name, size: written.size, seconds: (performance.now() - startedAt) / 1000 });
      } else {
        setState({ kind: "canceled" });
      }
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      cancelRef.current = null;
    }
    // A cancelled or failed export must not leave a broken file behind (the picker already created it).
    if (!finished) await (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.().catch(() => {});
  }

  const elapsed = running ? (performance.now() - state.startedAt) / 1000 : 0;
  const eta = running && state.progress > 0.01 ? (elapsed * (1 - state.progress)) / state.progress : Infinity;
  const info: [string, ReactNode][] = [
    ["Resolutie", `${meta.width} × ${meta.height}, gelijk aan bron`],
    ["Framerate", meta.timing.isVfr ? "variabel, tijdstempels van de bron" : `${meta.timing.averageFps.toFixed(2)} fps, gelijk aan bron`],
    ["Audio", meta.audio ? `origineel (${meta.audio.codec}), ongewijzigd` : "geen"],
    ["Bestand", container === "mov" ? ".mov (PCM-audio past niet goed in MP4)" : ".mp4"],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[2px]" onClick={() => !running && onClose()}>
      <div className="w-[30rem] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-[17px] font-semibold">Video exporteren</h2>
          <IconButton label="Sluiten" disabled={running} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="space-y-4 p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-neutral-50 p-3">
            {info.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-neutral-500">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
            {meta.hdr && (
              <>
                <dt className="text-neutral-500">HDR</dt>
                <dd className="text-right text-orange-700">bron is HDR; export wordt SDR</dd>
              </>
            )}
          </dl>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-neutral-500">Codec</span>
              <select className={fieldClass} value={codec} disabled={running} onChange={(e) => setCodec(e.target.value as VideoCodecChoice)}>
                <option value="avc" disabled={support?.avc === false}>
                  H.264 · overal afspeelbaar{support?.avc === false ? " (niet ondersteund)" : ""}
                </option>
                <option value="hevc" disabled={support?.hevc === false}>
                  HEVC · kleiner bestand{support?.hevc === false ? " (niet ondersteund)" : ""}
                </option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-neutral-500">Bitrate</span>
              <select className={fieldClass} value={factor} disabled={running} onChange={(e) => setFactor(Number(e.target.value))}>
                {BITRATE_FACTORS.map((f) => (
                  <option key={f} value={f}>
                    {formatBitrate(meta.videoBitrate * f)} {f === 1 ? "(= bron)" : `(×${f})`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {state.kind === "running" && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-flits transition-[width]" style={{ width: `${state.progress * 100}%` }} />
              </div>
              <p className="flex justify-between text-xs text-neutral-500">
                <span className="font-medium text-ink">{Math.round(state.progress * 100)}%</span>
                <span>nog ongeveer {formatEta(eta)}</span>
              </p>
            </div>
          )}
          {state.kind === "done" && (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-green-800">
              <Check size={15} /> {state.name} ({formatBytes(state.size)}) klaar in {Math.round(state.seconds)} s
            </p>
          )}
          {state.kind === "canceled" && <p className="text-neutral-500">Export geannuleerd.</p>}
          {state.kind === "error" && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Export mislukt: {state.message}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <span className="text-neutral-500">Ondertitels:</span>
          <Button variant="ghost" onClick={() => download(`${baseName}.srt`, toSrt(project))}>
            .srt
          </Button>
          <Button variant="ghost" onClick={() => download(`${baseName}.vtt`, toVtt(project))}>
            .vtt
          </Button>
          <div className="ml-auto">
            {running ? (
              <Button variant="secondary" onClick={state.cancel}>
                Annuleren
              </Button>
            ) : (
              <Button variant="primary" icon={<Download size={15} />} disabled={!support || !support[codec]} onClick={() => void exportVideo()}>
                Exporteren
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
