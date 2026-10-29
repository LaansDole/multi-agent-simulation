/** A character's nameplate on screen: head position, gap from the head to the plate's bottom, and plate size (px). */
export interface Nameplate {
  index: number;
  x: number;
  y: number;
  gap: number;
  w: number;
  h: number;
}

/** Screen rectangle [left, top, right, bottom] (px). */
export type Rect = [number, number, number, number];

/** Step a covered plate is lifted by: a two-line plate plus 1 px. */
export const PLATE_ROW = 32;
const MAX_LIFT = 2 * PLATE_ROW;

/** Plate rectangle lifted by `lift`, shifted inside the `w` x `h` view (left/top edge first if it does not fit). */
function box(p: Nameplate, lift: number, w: number, h: number): Rect {
  let left = p.x - p.w / 2, top = p.y - p.gap - lift - p.h;
  left -= Math.max(0, left + p.w - w);
  top -= Math.max(0, top + p.h - h);
  left = Math.max(0, left);
  top = Math.max(0, top);
  return [left, top, left + p.w, top + p.h];
}

const intersects = (a: Rect, b: Rect): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Rectangle of each plate that can be shown inside the `w` x `h` view, nearest the camera (lowest head on screen)
 * first: a plate that would intersect one already placed or an obstacle (hover/selection pill, speech bubbles) is
 * lifted a row, up to two; one that still intersects, or whose head is out of view, gets no entry and is hidden
 * (hover/selection still names it). Plates stay inside the view and no two placed plates intersect.
 * ponytail: O(n^2) over <= 13 plates per frame.
 */
export function placeNameplates(
  plates: readonly Nameplate[],
  view: { w: number; h: number },
  obstacles: readonly Rect[] = [],
): Record<number, Rect> {
  const rects: Record<number, Rect> = {};
  const placed = [...obstacles];
  for (const plate of [...plates].sort((a, b) => b.y - a.y)) {
    if (plate.x < 0 || plate.x > view.w || plate.y < 0 || plate.y > view.h) continue;
    for (let lift = 0; lift <= MAX_LIFT; lift += PLATE_ROW) {
      const rect = box(plate, lift, view.w, view.h);
      if (placed.some((other) => intersects(other, rect))) continue;
      rects[plate.index] = rect;
      placed.push(rect);
      break;
    }
  }
  return rects;
}
