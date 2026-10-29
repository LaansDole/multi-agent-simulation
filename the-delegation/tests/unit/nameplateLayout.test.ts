// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLATE_ROW, placeNameplates, type Nameplate } from '../../src/interface/nameplateLayout.ts';

const plate = (index: number, x: number, y: number, w = 120, h = 31, gap = 6): Nameplate => ({ index, x, y, gap, w, h });

function overlapping(plates: Nameplate[], lifts: Record<number, number>): string[] {
  const shown = plates.filter((p) => lifts[p.index] !== undefined).map((p) => {
    const bottom = p.y - p.gap - lifts[p.index];
    return { index: p.index, left: p.x - p.w / 2, right: p.x + p.w / 2, top: bottom - p.h, bottom };
  });
  return shown.flatMap((a, i) => shown.slice(i + 1)
    .filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
    .map((b) => `${a.index}/${b.index}`));
}

test('13 plates in a tight cluster: no two shown plates intersect, the nearest is never moved', () => {
  let seed = 7;
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 500; round++) {
    // Heads within 160 x 80 px, like the centre cluster of simulation_hospital; names up to the 180 px cap.
    const plates = Array.from({ length: 13 }, (_, i) => plate(
      i + 1, 400 + rand() * 160, 300 + rand() * 80, 60 + rand() * 120, rand() < 0.3 ? 18 : 31, rand() < 0.2 ? 46 : 6,
    ));
    const lifts = placeNameplates(plates);
    assert.deepEqual(overlapping(plates, lifts), [], `round ${round}`);
    const nearest = plates.reduce((a, b) => (b.y > a.y ? b : a));
    assert.equal(lifts[nearest.index], 0, `round ${round}: nearest plate stays on its character`);
  }
});

test('a covered plate is lifted a row at a time, behind ones first; with no room left it is hidden', () => {
  const stack = [plate(1, 100, 200), plate(2, 100, 199), plate(3, 100, 198), plate(4, 100, 197), plate(5, 400, 150)];
  assert.deepEqual(placeNameplates(stack), { 1: 0, 2: PLATE_ROW, 3: 2 * PLATE_ROW, 5: 0 });
});
