export type SaveState = "saved" | "saving" | "error";

/**
 * Saves the latest value `delayMs` after changes stop. Saves run one at a time and in order, so an older
 * value can never land after a newer one. `flush` saves right away (leaving the editor, retry after an error).
 */
export function createAutosave<T>(persist: (value: T) => Promise<void>, saved: T, onState: (state: SaveState) => void, delayMs = 800) {
  let latest = saved;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let queue = Promise.resolve();

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): Promise<void> => {
    stopTimer();
    queue = queue.then(async () => {
      const value = latest;
      if (value === saved) return;
      busy = true;
      try {
        await persist(value);
        saved = value;
      } catch {
        return onState("error");
      } finally {
        busy = false;
      }
      // Changed back to an earlier value while this save ran: the store now holds the wrong one.
      if (latest === saved) onState("saved");
      else if (!timer) void flush();
    });
    return queue;
  };

  return {
    change(value: T) {
      latest = value;
      stopTimer();
      if (value === saved && !busy) return onState("saved");
      onState("saving");
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    dispose: stopTimer,
  };
}
