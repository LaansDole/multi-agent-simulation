// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLATE_ROW, placeNameplates, type Nameplate, type Rect } from '../../src/interface/nameplateLayout.ts';

const VIEW = { w: 1600, h: 1000 };
const plate = (index: number, x: number, y: number, w = 120, h = 31, gap = 6): Nameplate => ({ index, x, y, gap, w, h });
const intersects = (a: Rect, b: Rect): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

function overlapping(rects: Record<number, Rect>): string[] {
  const shown = Object.entries(rects);
  return shown.flatMap(([i, a], n) => shown.slice(n + 1).filter(([, b]) => intersects(a, b)).map(([j]) => `${i}/${j}`));
}

test('13 plates in a tight cluster: no two shown plates intersect, the nearest is never moved', () => {
  let seed = 7;
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 500; round++) {
    // Heads within 160 x 80 px, like the centre cluster of simulation_hospital; names up to the 180 px cap.
    const plates = Array.from({ length: 13 }, (_, i) => plate(
      i + 1, 400 + rand() * 160, 300 + rand() * 80, 60 + rand() * 120, rand() < 0.3 ? 18 : 31, rand() < 0.2 ? 46 : 6,
    ));
    const rects = placeNameplates(plates, VIEW);
    assert.deepEqual(overlapping(rects), [], `round ${round}`);
    const p = plates.reduce((a, b) => (b.y > a.y ? b : a));
    assert.deepEqual(rects[p.index], [p.x - p.w / 2, p.y - p.gap - p.h, p.x + p.w / 2, p.y - p.gap], `round ${round}: nearest plate stays on its character`);
  }
});

test('a covered plate is lifted a row at a time, behind ones first; with no room left it is hidden', () => {
  const stack = [plate(1, 100, 200), plate(2, 100, 199), plate(3, 100, 198), plate(4, 100, 197), plate(5, 400, 150)];
  const bottoms = Object.fromEntries(Object.entries(placeNameplates(stack, VIEW)).map(([i, r]) => [i, r[3]]));
  assert.deepEqual(bottoms, { 1: 194, 2: 193 - PLATE_ROW, 3: 192 - 2 * PLATE_ROW, 5: 144 });
});

test('a plate near any edge of the view stays fully inside it; one whose head is out of view is hidden', () => {
  const edges = [plate(1, 10, 500, 160), plate(2, 1595, 500, 160), plate(3, 800, 5), plate(4, 300, 999, 120, 31, -20)];
  const rects = placeNameplates([...edges, plate(5, -40, 500), plate(6, 800, 1010)], VIEW);
  assert.deepEqual(Object.keys(rects).map(Number), [1, 2, 3, 4]);
  for (const [i, [left, top, right, bottom]] of Object.entries(rects)) {
    assert.ok(left >= 0 && top >= 0 && right <= VIEW.w && bottom <= VIEW.h, `plate ${i} inside: ${[left, top, right, bottom]}`);
  }
  assert.deepEqual(rects[1], [0, 463, 160, 494]); // shifted right, not squeezed
});

test('a plate under the hover pill or a speech bubble is lifted clear of it, or hidden with no room', () => {
  const pill: Rect = [300, 461, 500, 490];
  const lifted = placeNameplates([plate(1, 400, 500)], VIEW, [pill])[1];
  assert.ok(lifted && !intersects(lifted, pill), `lifted: ${lifted}`);
  const tall: Rect = [300, 300, 500, 490]; // a three-line speech bubble
  assert.deepEqual(placeNameplates([plate(1, 400, 500), plate(2, 700, 500)], VIEW, [tall]), { 2: [640, 463, 760, 494] });
});
