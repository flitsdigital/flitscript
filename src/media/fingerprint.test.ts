import { describe, expect, it } from "vitest";
import { fingerprint, fingerprintMismatches } from "./fingerprint";

const file = (bytes: number[], name = "take.mov") => Object.assign(new Blob([new Uint8Array(bytes)]), { name });

describe("fingerprint", () => {
  it("is stable for the same bytes and differs for other content", async () => {
    const a = await fingerprint(file([1, 2, 3]), 12.3456);
    expect(a).toEqual(await fingerprint(file([1, 2, 3]), 12.3456));
    expect(a.duration).toBe(12.346);
    expect(a.headHash).not.toBe((await fingerprint(file([1, 2, 4]), 12.3456)).headHash);
  });

  it("accepts a renamed copy but explains a different file", async () => {
    const original = await fingerprint(file([1, 2, 3]), 10);
    expect(fingerprintMismatches(original, await fingerprint(file([1, 2, 3], "kopie.mov"), 10))).toEqual([]);
    const other = await fingerprint(file([9, 9, 9, 9], "ander.mov"), 12);
    expect(fingerprintMismatches(original, other)).toEqual([
      "de inhoud is anders",
      "de bestandsgrootte is anders",
      "de duur is anders (12.0 s i.p.v. 10.0 s)",
      'de naam is anders ("ander.mov")',
    ]);
  });
});
