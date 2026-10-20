import { supabase } from "../lib/supabase";
import type { Fingerprint } from "../media/fingerprint";
import type { VideoMeta } from "../media/probe";
import type { Project, StylePreset } from "./types";

export type Client = { id: string; name: string; glossary: string[] };
export type ProjectRow = {
  id: string;
  client_id: string | null;
  name: string;
  fingerprint: Fingerprint;
  video_meta: VideoMeta;
  data: Project;
  updated_at: string;
};
export type ProjectSummary = Omit<ProjectRow, "data">;
export type FontRow = { id: string; client_id: string | null; family: string; path: string };

/** Throws a readable error instead of returning Supabase's `{ data, error }` pair. */
function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Opslag: ${error.message}`);
  return data as T;
}

export const listClients = async () => check(await supabase.from("clients").select("id, name, glossary").order("name")) as Client[];
export const createClient = async (name: string) =>
  check(await supabase.from("clients").insert({ name: name.trim() }).select("id, name, glossary").single()) as Client;
export const saveGlossary = async (clientId: string, glossary: string[]) =>
  void check(await supabase.from("clients").update({ glossary }).eq("id", clientId));

export const listProjects = async () =>
  check(
    await supabase.from("projects").select("id, client_id, name, fingerprint, video_meta, updated_at").order("updated_at", { ascending: false }).limit(200),
  ) as ProjectSummary[];
export const loadProject = async (id: string) => check(await supabase.from("projects").select("*").eq("id", id).single()) as ProjectRow;
export const createProject = async (row: Pick<ProjectRow, "client_id" | "name" | "fingerprint" | "video_meta" | "data">) =>
  check(await supabase.from("projects").insert(row).select("id").single()) as { id: string };
export const updateProject = async (id: string, patch: Partial<Pick<ProjectRow, "data" | "fingerprint" | "video_meta" | "name">>) =>
  void check(await supabase.from("projects").update(patch).eq("id", id));
export const deleteProject = async (id: string) => void check(await supabase.from("projects").delete().eq("id", id));

// Preset ids inside the style JSON are `custom-<row id>`, which the style panel uses to tell them from built-ins.
export const listPresets = async (clientId: string | null) => {
  const query = supabase.from("presets").select("style").order("created_at");
  const rows = check(await (clientId ? query.or(`client_id.is.null,client_id.eq.${clientId}`) : query.is("client_id", null))) as { style: StylePreset }[];
  return rows.map((r) => r.style);
};
export async function savePreset(clientId: string | null, preset: StylePreset): Promise<StylePreset> {
  const id = crypto.randomUUID();
  const style = { ...preset, id: `custom-${id}` };
  check(await supabase.from("presets").insert({ id, client_id: clientId, name: style.name, style }));
  return style;
}
export const deletePreset = async (presetId: string) => void check(await supabase.from("presets").delete().eq("id", presetId.replace(/^custom-/, "")));

export const listFonts = async (clientId: string | null) => {
  const query = supabase.from("fonts").select("id, client_id, family, path");
  return check(await (clientId ? query.or(`client_id.is.null,client_id.eq.${clientId}`) : query.is("client_id", null))) as FontRow[];
};
export async function uploadFont(clientId: string | null, family: string, file: File): Promise<void> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "ttf";
  const path = `${clientId ?? "algemeen"}/${crypto.randomUUID()}.${extension}`;
  check(await supabase.storage.from("fonts").upload(path, file, { contentType: file.type || "font/ttf" }));
  check(await supabase.from("fonts").insert({ client_id: clientId, family, path }));
}
export async function downloadFont(font: FontRow): Promise<File> {
  const blob = check(await supabase.storage.from("fonts").download(font.path));
  // addCustomFont takes the family name from the file name.
  return new File([blob], `${font.family}.${font.path.split(".").pop()}`);
}
