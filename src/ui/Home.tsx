import type { Session } from "@supabase/supabase-js";
import { Film, LoaderCircle, LogOut, Plus, Trash, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { PRESETS } from "../captions/presets";
import { supabase } from "../lib/supabase";
import { fileFromHandle, forgetHandle, loadHandle, pickVideo } from "../media/file-handles";
import type { VideoMeta } from "../media/probe";
import { linkSourceVideo, readSourceVideo, sourceMismatches } from "../project/source-video";
import { createClient, createProject, deleteProject, listClients, listProjects, loadProject, type Client, type ProjectSummary } from "../project/store";
import type { Project } from "../project/types";
import { formatTime } from "./format";
import { Button, fieldClass, IconButton } from "./kit";

export type OpenedProject = {
  id: string;
  name: string;
  client: Client | null;
  file: File;
  meta: VideoMeta;
  data: Project;
};

const NO_CLIENT = "";

export function Home({ session, onOpen }: { session: Session; onOpen: (project: OpenedProject) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem("flitscript:client") ?? NO_CLIENT);
  const [newClient, setNewClient] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Project whose source file has to be picked again (new machine, moved file, or permission denied).
  const [needsFile, setNeedsFile] = useState<ProjectSummary | null>(null);
  const client = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    Promise.all([listClients(), listProjects()]).then(([c, p]) => {
      setClients(c);
      setProjects(p);
    }, (e) => setError(String(e instanceof Error ? e.message : e)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("flitscript:client", clientId);
    } catch {
      // private mode: only a convenience
    }
  }, [clientId]);

  // One action at a time: a second drop or click while a video is being analysed would start a second project.
  const running = useRef(false);
  async function guard(label: string, fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  /** New project from a local file: only metadata and an empty caption set go to Supabase, never the video. */
  const startNew = (file: File, handle: FileSystemFileHandle | null) =>
    guard("Video analyseren…", async () => {
      const video = await readSourceVideo(file);
      const data: Project = { words: [], groups: [], style: PRESETS[0]! };
      const name = file.name.replace(/\.[^.]+$/, "");
      const { id } = await createProject({ client_id: client?.id ?? null, name, fingerprint: video.fingerprint, video_meta: video.meta, data });
      await linkSourceVideo(id, video, handle, { recorded: true });
      onOpen({ id, name, client, file, meta: video.meta, data });
    });

  async function finishOpen(summary: ProjectSummary, file: File, handle: FileSystemFileHandle) {
    const video = await readSourceVideo(file);
    const reasons = sourceMismatches(summary.fingerprint, video);
    if (reasons.length && !confirm(`Dit lijkt niet het bronbestand van "${summary.name}": ${reasons.join(", ")}.\n\nToch openen met dit bestand?`)) return;
    const row = await loadProject(summary.id);
    await linkSourceVideo(row.id, video, handle, { recorded: !reasons.length });
    onOpen({ id: row.id, name: row.name, client: clients.find((c) => c.id === row.client_id) ?? null, file, meta: video.meta, data: row.data });
  }

  // Both the permission request and the file picker need this click's user activation, so nothing slow runs before them.
  const open = (summary: ProjectSummary) =>
    guard("Project openen…", async () => {
      const stored = await loadHandle(summary.id).catch(() => undefined);
      const file = stored ? await fileFromHandle(stored) : null;
      if (!file || !stored) return setNeedsFile(summary);
      await finishOpen(summary, file, stored);
    });

  const chooseFile = (summary: ProjectSummary) =>
    guard("Project openen…", async () => {
      const picked = await pickVideo();
      if (!picked) return;
      setNeedsFile(null);
      await finishOpen(summary, picked.file, picked.handle);
    });

  const remove = (summary: ProjectSummary) =>
    confirm(`Project "${summary.name}" verwijderen? De video zelf blijft op je computer staan.`) &&
    void guard("Verwijderen…", async () => {
      await deleteProject(summary.id);
      await forgetHandle(summary.id).catch(() => {});
      setProjects((p) => p?.filter((x) => x.id !== summary.id) ?? null);
    });

  const addClient = (name: string) =>
    guard("Klant aanmaken…", async () => {
      const created = await createClient(name);
      setClients((c) => [...c, created].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(created.id);
      setNewClient(null);
    });

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const item = event.dataTransfer.items[0];
    const handle = (await item?.getAsFileSystemHandle?.()) as FileSystemFileHandle | null;
    const file = handle?.kind === "file" ? await handle.getFile() : event.dataTransfer.files[0];
    if (file) void startNew(file, handle?.kind === "file" ? handle : null);
  }

  // `client`, not `clientId`: a remembered client that was deleted meanwhile falls back to showing all projects.
  const visible = projects?.filter((p) => !client || p.client_id === client.id) ?? [];
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "Geen klant";

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-6">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-sm font-black text-flits">F</span>
          Flitscript
        </span>
        <span className="ml-auto text-neutral-500">{session.user.email}</span>
        <IconButton label="Uitloggen" onClick={() => void supabase.auth.signOut()}>
          <LogOut size={16} />
        </IconButton>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 overflow-y-auto p-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="text-neutral-500">Klant</span>
            <select className={`${fieldClass} w-56`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value={NO_CLIENT}>Alle klanten</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {newClient === null ? (
            <Button icon={<Plus size={15} />} onClick={() => setNewClient("")}>
              Klant
            </Button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newClient.trim()) void addClient(newClient);
              }}
            >
              <input autoFocus className={`${fieldClass} w-56`} placeholder="Naam van de klant" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              <Button type="submit" variant="primary">
                Toevoegen
              </Button>
              <Button variant="ghost" onClick={() => setNewClient(null)}>
                Annuleren
              </Button>
            </form>
          )}
        </div>

        <button
          type="button"
          disabled={!!busy}
          onClick={() => void pickVideo().then((picked) => picked && startNew(picked.file, picked.handle))}
          className={`flex w-full items-center gap-4 rounded-2xl border-2 border-dashed bg-white px-6 py-6 text-left transition-colors ${
            dragging ? "border-flits-deep bg-flits-soft" : "border-neutral-300 hover:border-neutral-400"
          }`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-flits">
            {busy ? <LoaderCircle size={22} className="animate-spin" /> : <Upload size={22} />}
          </span>
          <span>
            <span className="block text-[15px] font-semibold">{busy ?? "Nieuw project: sleep een video hierheen of klik"}</span>
            <span className="block text-neutral-500">
              Voor {client ? client.name : "geen specifieke klant"} · MP4 of MOV, tot 4K · de video blijft op je computer
            </span>
          </span>
        </button>
        {error && <p className="enter rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        {needsFile && (
          <div className="enter flex items-center gap-3 rounded-xl bg-flits-soft px-4 py-3">
            <span className="flex-1">
              Kies het bronbestand van <strong>{needsFile.name}</strong> ({needsFile.fingerprint.name}). Het staat niet meer op de bekende plek, of de
              browser vraagt opnieuw om toegang.
            </span>
            <Button variant="primary" onClick={() => void chooseFile(needsFile)}>
              Bestand kiezen
            </Button>
            <Button variant="ghost" onClick={() => setNeedsFile(null)}>
              Annuleren
            </Button>
          </div>
        )}

        <section className="space-y-2">
          <h2 className="font-semibold">Projecten</h2>
          {projects === null ? (
            <p className="text-neutral-500">Laden…</p>
          ) : visible.length === 0 ? (
            <p className="text-neutral-500">Nog geen projecten{client ? ` voor ${client.name}` : ""}.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
              {visible.map((p) => (
                <li key={p.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                  <button type="button" disabled={!!busy} onClick={() => void open(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <Film size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {clientName(p.client_id)} · {p.video_meta.width}×{p.video_meta.height} · {formatTime(p.video_meta.duration)} · bijgewerkt{" "}
                        {new Date(p.updated_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                  </button>
                  <IconButton label="Project verwijderen" className="opacity-0 group-hover:opacity-100" disabled={!!busy} onClick={() => remove(p)}>
                    <Trash size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
