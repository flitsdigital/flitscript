import { Captions, Eraser, LoaderCircle, Merge, Plus, RefreshCw, Search, Sparkles, Trash, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findMatches, isFiller, type Command } from "../project/commands";
import { findActiveIndex, showTime } from "../project/timing";
import type { CaptionGroup, Project, Word } from "../project/types";
import { transcribe } from "../transcription/transcribe";
import { formatTime } from "./format";
import { Button, fieldClass, IconButton } from "./kit";

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

type Props = {
  file: File;
  duration: number;
  onAddCaption: () => void;
  project: Project;
  run: (command: Command) => void;
  time: number;
  selectedId: string | null;
  onSelect: (groupId: string) => void;
  onSeek: (time: number) => void;
};

export function CaptionsPanel({ file, duration, onAddCaption, project, run, time, selectedId, onSelect, onSeek }: Props) {
  const [glossary, setGlossary] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const listRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => new Map(project.words.map((w) => [w.id, w])), [project.words]);
  const activeId = project.groups[findActiveIndex(project.groups, time)]?.id;
  const busy = status.kind === "busy";
  const [search, setSearch] = useState<{ find: string; replace: string } | null>(null);
  const captioned = useMemo(() => project.groups.flatMap((g) => g.wordIds.map((id) => index.get(id)!)), [project.groups, index]);
  const matches = search ? findMatches(captioned, search.find).length : 0;
  const fillers = captioned.filter((w) => isFiller(w.text));

  useEffect(() => {
    if (activeId) listRef.current?.querySelector(`[data-group="${activeId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const terms = () => glossary.split(",").map((t) => t.trim()).filter(Boolean);

  async function start() {
    setStatus({ kind: "busy", label: "Audio uitpakken…" });
    try {
      const words = await transcribe(file, terms(), (p) =>
        setStatus({ kind: "busy", label: p.stage === "audio" ? `Audio uitpakken… ${Math.round(p.progress * 100)}%` : "Spraak herkennen…" }),
      );
      run({ type: "transcribed", words, maxEnd: duration });
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const glossaryField = (
    <label className="block space-y-1.5">
      <span className="text-neutral-500">Vaktermen en namen</span>
      <input type="text" value={glossary} onChange={(e) => setGlossary(e.target.value)} placeholder="Flits Digital, AdBlue, Lelystad" className={fieldClass} />
    </label>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-4">
        <div>
          <h2 className="text-[15px] font-semibold">Ondertitels</h2>
          <p className="text-xs text-neutral-500">Nederlands</p>
        </div>
        {project.words.length > 0 && (
          <div className="flex items-center gap-1">
            {busy && (
              <span className="flex items-center gap-1.5 text-neutral-500">
                <LoaderCircle size={14} className="animate-spin" /> {status.label}
              </span>
            )}
            <IconButton label="Zoeken en vervangen" className={search ? "bg-neutral-100 text-ink" : ""} onClick={() => setSearch(search ? null : { find: "", replace: "" })}>
              <Search size={15} />
            </IconButton>
            <IconButton label="Opnieuw transcriberen" disabled={busy} onClick={() => void start()}>
              <RefreshCw size={15} />
            </IconButton>
          </div>
        )}
      </header>

      {search && (
        <div className="space-y-2 border-b border-neutral-100 p-3">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              aria-label="Zoeken"
              placeholder="Zoek een woord"
              value={search.find}
              onChange={(e) => setSearch({ ...search, find: e.target.value })}
              onKeyDown={(e) => e.key === "Escape" && setSearch(null)}
              className={fieldClass}
            />
            <IconButton label="Sluiten" onClick={() => setSearch(null)}>
              <X size={15} />
            </IconButton>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Vervangen door"
              placeholder="Vervangen door"
              value={search.replace}
              onChange={(e) => setSearch({ ...search, replace: e.target.value })}
              className={fieldClass}
            />
            <Button
              variant="primary"
              disabled={!matches || !search.replace.trim()}
              onClick={() => run({ type: "replaceWord", find: search.find, replace: search.replace })}
            >
              Alles vervangen
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            {search.find.trim() ? `${matches}× gevonden` : "Zoekt hele woorden; hoofdletters en leestekens maken niet uit."}
          </p>
        </div>
      )}

      {fillers.length > 0 && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-flits-soft px-3 py-2 text-xs">
          <Eraser size={14} className="shrink-0" />
          <span className="flex-1">
            {fillers.length} opvulwoord{fillers.length === 1 ? "" : "en"} gevonden ({[...new Set(fillers.map((w) => w.text.toLowerCase().replace(/[^\p{L}]/gu, "")))].join(", ")})
          </span>
          <button type="button" onClick={() => run({ type: "removeFillers" })} className="rounded-md bg-ink px-2 py-1 font-medium text-white hover:bg-neutral-700">
            Weghalen
          </button>
        </div>
      )}

      {project.words.length === 0 ? (
        <div className="p-4">
          <div className="space-y-4 rounded-xl border border-neutral-200 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-flits-soft">
              <Captions size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold">Automatisch ondertitelen</h3>
              <p className="text-neutral-500">Spraak wordt tekst met de tijd per woord, opgeknipt in blokken. Daarna kun je alles aanpassen.</p>
            </div>
            {glossaryField}
            <Button
              variant="primary"
              className="w-full"
              disabled={busy}
              icon={busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
              onClick={() => void start()}
            >
              {busy ? status.label : "Ondertitels genereren"}
            </Button>
            {status.kind === "error" && <p className="text-red-600">{status.message}</p>}
          </div>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {project.groups.map((group, i) => (
            <CaptionRow
              key={group.id}
              group={group}
              index={index}
              active={group.id === activeId}
              selected={group.id === selectedId}
              hasNext={i < project.groups.length - 1}
              run={run}
              onSelect={onSelect}
              onSeek={onSeek}
              query={search?.find ?? ""}
            />
          ))}
          <Button variant="ghost" className="mt-1 w-full" icon={<Plus size={15} />} onClick={onAddCaption}>
            Caption toevoegen op afspeelpositie
          </Button>
          {status.kind === "error" && <p className="p-2 text-red-600">{status.message}</p>}
          <div className="mt-2 border-t border-neutral-100 p-2 pt-3">{glossaryField}</div>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  group: CaptionGroup;
  index: Map<string, Word>;
  active: boolean;
  selected: boolean;
  hasNext: boolean;
  run: (command: Command) => void;
  onSelect: (groupId: string) => void;
  onSeek: (time: number) => void;
  query: string;
};

const CaptionRow = memo(function CaptionRow({ group, index, active, selected, hasNext, run, onSelect, onSeek, query }: RowProps) {
  const words = group.wordIds.map((id) => index.get(id)!);
  const hits = new Set(findMatches(words, query).map((w) => w.id));
  const text = words.map((w) => w.text).join(" ");
  const uncertain = words.some((w) => w.confidence < 0.5);
  return (
    <div
      data-group={group.id}
      onClick={() => {
        onSelect(group.id);
        onSeek(showTime(group));
      }}
      className={`group relative cursor-pointer rounded-lg px-3 py-2 transition-colors ${
        selected ? "bg-flits-soft ring-1 ring-flits-deep/50" : active ? "bg-neutral-100" : "hover:bg-neutral-50"
      }`}
    >
      <div className="mb-0.5 flex items-center gap-2 text-[11px] text-neutral-400 tabular-nums">
        {formatTime(group.start)}
        {uncertain && <span className="rounded bg-orange-100 px-1.5 text-orange-700">controleren</span>}
        <span className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100">
          {hasNext && (
            <RowAction title="Samenvoegen met volgende" onClick={() => run({ type: "mergeWithNext", groupId: group.id })}>
              <Merge size={13} />
            </RowAction>
          )}
          <RowAction title="Blok verwijderen" onClick={() => run({ type: "deleteGroup", groupId: group.id })}>
            <Trash size={13} />
          </RowAction>
        </span>
      </div>
      {selected ? (
        <>
          <TextField key={text} initial={text} onCommit={(value) => run({ type: "editGroupText", groupId: group.id, text: value })} />
          <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            {words.map((w) => (
              <button
                key={w.id}
                type="button"
                title={`Accent aan/uit · ${Math.round(w.confidence * 100)}% zeker`}
                onClick={() => run({ type: "toggleAccent", groupId: group.id, wordId: w.id })}
                className={`rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                  group.accentWordIds.includes(w.id) ? "bg-ink font-semibold text-flits" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-400"
                } ${w.confidence < 0.5 ? "underline decoration-orange-500 decoration-dotted" : ""}`}
              >
                {w.text}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">Klik een woord om het accent aan of uit te zetten.</p>
        </>
      ) : (
        <p className="leading-relaxed text-neutral-800">
          {words.map((w) => (
            <span
              key={w.id}
              className={`${group.accentWordIds.includes(w.id) ? "rounded bg-flits/70 px-0.5 font-semibold text-ink" : ""} ${hits.has(w.id) ? "rounded ring-2 ring-sky-400" : ""}`}
            >
              {w.text}{" "}
            </span>
          ))}
        </p>
      )}
    </div>
  );
});

function TextField({ initial, onCommit }: { initial: string; onCommit: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  const commit = () => value !== initial && onCommit(value);
  return (
    <input
      type="text"
      aria-label="Captiontekst"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(initial);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="h-8 w-full rounded-md bg-white px-2 font-medium ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-flits"
    />
  );
}

function RowAction({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-1 text-neutral-400 hover:bg-white hover:text-ink"
    >
      {children}
    </button>
  );
}
