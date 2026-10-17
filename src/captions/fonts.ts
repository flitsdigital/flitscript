import { useSyncExternalStore } from "react";
import { BUILT_IN_FONTS } from "./font-catalog";

export type FontFamily = { family: string; weights: number[]; custom: boolean };
type Source = string | ArrayBuffer;

// shortcut: uploaded fonts live in memory for this session; fase 6 stores them per client in Supabase.
const custom = new Map<string, ArrayBuffer>();
const loaded = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let snapshot = build();

function build(): FontFamily[] {
  return [
    ...BUILT_IN_FONTS.map((f) => ({ family: f.family, weights: Object.keys(f.weights).map(Number), custom: false })),
    ...[...custom.keys()].map((family) => ({ family, weights: [400], custom: true })),
  ];
}

export function useFontFamilies(): FontFamily[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export function nearestWeight(family: string, weight: number): number {
  const weights = snapshot.find((f) => f.family === family)?.weights ?? [weight];
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}

function sourceOf(family: string, weight: number): Source | undefined {
  return custom.get(family) ?? BUILT_IN_FONTS.find((f) => f.family === family)?.weights[weight];
}

/**
 * Loads one font face. Captions must not be laid out before this resolves: layouts are cached per font metrics.
 * Built-in fonts are bundled with the app (no CDN), so export never falls back to another font.
 */
export function ensureFont(family: string, weight: number): Promise<void> {
  const w = nearestWeight(family, weight);
  const key = `${family}|${w}`;
  let promise = loaded.get(key);
  if (!promise) {
    const source = sourceOf(family, w);
    if (!source) return Promise.reject(new Error(`Onbekend lettertype: ${family}`));
    const face = new FontFace(family, typeof source === "string" ? `url(${source})` : source, { weight: String(w) });
    promise = face.load().then((f) => void document.fonts.add(f));
    promise.catch(() => loaded.delete(key));
    loaded.set(key, promise);
  }
  return promise;
}

/** What a worker needs to load the same face; URLs are made absolute because workers resolve them differently. */
export function fontSource(family: string, weight: number): { family: string; weight: number; source: Source } {
  const w = nearestWeight(family, weight);
  const source = sourceOf(family, w);
  if (!source) throw new Error(`Onbekend lettertype: ${family}`);
  return { family, weight: w, source: typeof source === "string" ? new URL(source, location.href).href : source };
}

/** Registers an uploaded .ttf/.otf/.woff/.woff2 and returns its family name. */
export async function addCustomFont(file: File): Promise<string> {
  const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/["\\]/g, "").trim() || "Eigen font";
  const data = await file.arrayBuffer();
  const face = new FontFace(family, data, { weight: "400" });
  document.fonts.add(await face.load()); // throws on files that are not a valid font
  custom.set(family, data);
  loaded.set(`${family}|400`, Promise.resolve());
  snapshot = build();
  listeners.forEach((l) => l());
  return family;
}
