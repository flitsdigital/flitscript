import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, type SaveState } from "./autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(persist = vi.fn(async (_: string) => {})) {
  const states: SaveState[] = [];
  const autosave = createAutosave<string>(persist, "a", (s) => states.push(s), 800);
  return { autosave, persist, states };
}

describe("autosave", () => {
  it("saves once, after changes stop", async () => {
    const { autosave, persist, states } = setup();
    autosave.change("b");
    await vi.advanceTimersByTimeAsync(500);
    autosave.change("c");
    await vi.advanceTimersByTimeAsync(800);
    expect(persist.mock.calls).toEqual([["c"]]);
    expect(states.at(-1)).toBe("saved");
  });

  it("does nothing when a change is undone before the delay", async () => {
    const { autosave, persist, states } = setup();
    autosave.change("b");
    autosave.change("a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("saved");
  });

  it("reports errors and retries on flush", async () => {
    const persist = vi.fn(async (_: string) => {}).mockRejectedValueOnce(new Error("offline"));
    const { autosave, states } = setup(persist);
    autosave.change("b");
    await vi.advanceTimersByTimeAsync(800);
    expect(states.at(-1)).toBe("error");
    await autosave.flush();
    expect(persist.mock.calls).toEqual([["b"], ["b"]]);
    expect(states.at(-1)).toBe("saved");
  });

  it("re-saves when the value goes back during a running save", async () => {
    let finish = () => {};
    const persist = vi.fn((_: string) => new Promise<void>((resolve) => (finish = resolve)));
    const { autosave, states } = setup(persist);
    autosave.change("b");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.change("a"); // undo while "b" is being written
    finish();
    await vi.advanceTimersByTimeAsync(1000); // the pending change saves "a" again
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist.mock.calls).toEqual([["b"], ["a"]]);
    expect(states.at(-1)).toBe("saved");
  });
});

describe("autosave flush result", () => {
  it("is false when the save fails, so leaving the editor can be stopped", async () => {
    const persist = vi.fn(async (_: string) => {}).mockRejectedValueOnce(new Error("offline"));
    const { autosave } = setup(persist);
    autosave.change("b");
    expect(await autosave.flush()).toBe(false);
    expect(await autosave.flush()).toBe(true);
  });

  it("clears a stale error once the stored value is current again", async () => {
    let fail = () => {};
    const persist = vi.fn((_: string) => new Promise<void>((_, reject) => (fail = () => reject(new Error("offline")))));
    const { autosave, states } = setup(persist);
    autosave.change("b");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.change("a"); // undo while "b" is being written
    fail();
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toBe("saved");
  });
});
