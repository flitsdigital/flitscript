/** Index of the item whose [start, end) contains `time`, or -1. Items must be sorted by start and not overlap. */
export function findActiveIndex(items: readonly { start: number; end: number }[], time: number): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid]!;
    if (time < item.start) hi = mid - 1;
    else if (time >= item.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Where to park the playhead when a block is clicked: just past entry animations, so the caption is visible. */
export const showTime = (group: { start: number; end: number }) => group.start + Math.min(0.2, (group.end - group.start) / 2);
