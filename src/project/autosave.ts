export type SaveState = "saved" | "saving" | "error";

/**
 * Saves the latest value `delayMs` after changes stop. Saves run one at a time and in order, so an older
 * value can never land after a newer one. `flush` saves right away (leaving the editor, retry after an error)
 * and resolves to whether the latest value is now stored.
 */
export function createAutosave<T>(persist: (value: T) => Promise<void>, saved: T, onState: (state: SaveState) => void, delayMs = 800) {
  let latest = saved;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let queue: Promise<boolean> = Promise.resolve(true);

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): Promise<boolean> => {
    stopTimer();
    queue = queue.then(async () => {
      const value = latest;
      if (value === saved) {
        onState("saved"); // also clears an "error" left by a failed save of a value that was undone since
        return true;
      }
      busy = true;
      try {
        await persist(value);
        saved = value;
      } catch {
        onState("error");
        return false;
      } finally {
        busy = false;
      }
      // Changed back to an earlier value while this save ran: the store now holds the wrong one.
      if (latest === saved) {
        onState("saved");
        return true;
      }
      // Queued behind this one, not awaited here: awaiting the queue from inside it would never resolve.
      if (!timer) void flush();
      return false;
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
