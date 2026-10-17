import { apply, type Command } from "./commands";
import type { Project } from "./types";

export type History = { past: Project[]; present: Project; future: Project[]; gesture: { key: string; at: number } | null };

export type HistoryAction =
  /** `gesture` merges a burst of changes (a slider or edge drag) into one undo step while they arrive < 1 s apart. */
  | { type: "do"; command: Command; gesture?: string; at?: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: Project };

const LIMIT = 200;
const GESTURE_GAP_MS = 1000;

export const initHistory = (project: Project): History => ({ past: [], present: project, future: [], gesture: null });

export function historyReducer(history: History, action: HistoryAction): History {
  switch (action.type) {
    case "do": {
      const next = apply(history.present, action.command);
      if (next === history.present) return history;
      const at = action.at ?? 0;
      const gesture = action.gesture ? { key: action.gesture, at } : null;
      const continues = gesture && history.gesture?.key === gesture.key && at - history.gesture.at < GESTURE_GAP_MS;
      return {
        past: continues ? history.past : [...history.past, history.present].slice(-LIMIT),
        present: next,
        future: [],
        gesture,
      };
    }
    case "undo": {
      const previous = history.past[history.past.length - 1];
      if (!previous) return history;
      return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], gesture: null };
    }
    case "redo": {
      const [next, ...rest] = history.future;
      if (!next) return history;
      return { past: [...history.past, history.present], present: next, future: rest, gesture: null };
    }
    case "reset":
      return initHistory(action.project);
  }
}
