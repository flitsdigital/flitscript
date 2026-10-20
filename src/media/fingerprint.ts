export type Fingerprint = { name: string; size: number; duration: number; headHash: string };

/** Hashing the first 4 MB is enough to tell takes apart without reading a multi-GB file. */
const HEAD_BYTES = 4 * 1024 * 1024;

export async function fingerprint(file: Blob & { name: string }, duration: number): Promise<Fingerprint> {
  const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", head);
  const headHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { name: file.name, size: file.size, duration: Math.round(duration * 1000) / 1000, headHash };
}

/** Dutch reasons why `actual` is probably not the file the project was made with; empty when it matches. */
export function fingerprintMismatches(expected: Fingerprint, actual: Fingerprint): string[] {
  const reasons: string[] = [];
  if (expected.headHash !== actual.headHash) reasons.push("de inhoud is anders");
  if (expected.size !== actual.size) reasons.push("de bestandsgrootte is anders");
  if (Math.abs(expected.duration - actual.duration) > 0.05) reasons.push(`de duur is anders (${actual.duration.toFixed(1)} s i.p.v. ${expected.duration.toFixed(1)} s)`);
  // A renamed copy of the same take is fine; only mention the name when something else differs too.
  if (reasons.length && expected.name !== actual.name) reasons.push(`de naam is anders ("${actual.name}")`);
  return reasons;
}
