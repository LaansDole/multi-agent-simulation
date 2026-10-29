/** A character's nameplate on screen: head position, gap from the head to the plate's bottom, and plate size (px). */
export interface Nameplate {
  index: number;
  x: number;
  y: number;
  gap: number;
  w: number;
  h: number;
}

/** Step a covered plate is lifted by: a two-line plate plus 1 px. */
export const PLATE_ROW = 32;
const MAX_LIFT = 2 * PLATE_ROW;

/** Plate rectangle as [left, top, right, bottom], lifted by `lift`. */
function box(p: Nameplate, lift: number): [number, number, number, number] {
  const bottom = p.y - p.gap - lift;
  return [p.x - p.w / 2, bottom - p.h, p.x + p.w / 2, bottom];
}

const intersects = (a: number[], b: number[]): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Lift (px above its resting spot) of each plate that can be shown, nearest the camera (lowest head on screen)
 * first: a plate that would intersect one already placed is lifted a row, up to two; one that still intersects
 * gets no entry and is hidden (hover/selection still names it). No two placed plates intersect.
 * ponytail: O(n^2) over <= 13 plates per frame.
 */
export function placeNameplates(plates: readonly Nameplate[]): Record<number, number> {
  const lifts: Record<number, number> = {};
  const placed: number[][] = [];
  for (const plate of [...plates].sort((a, b) => b.y - a.y)) {
    for (let lift = 0; lift <= MAX_LIFT; lift += PLATE_ROW) {
      const rect = box(plate, lift);
      if (placed.some((other) => intersects(other, rect))) continue;
      lifts[plate.index] = lift;
      placed.push(rect);
      break;
    }
  }
  return lifts;
}
