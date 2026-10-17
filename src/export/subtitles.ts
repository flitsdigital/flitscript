import type { Project } from "../project/types";

function stamp(seconds: number, separator: "," | "."): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

function cues(project: Project) {
  const text = new Map(project.words.map((w) => [w.id, w.text]));
  return project.groups.map((g) => ({ start: g.start, end: g.end, text: g.wordIds.map((id) => text.get(id)).join(" ") }));
}

export function toSrt(project: Project): string {
  return cues(project)
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`)
    .join("\n");
}

export function toVtt(project: Project): string {
  return `WEBVTT\n\n${cues(project).map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`;
}
