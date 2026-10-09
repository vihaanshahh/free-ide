import assert from "node:assert/strict";
import test from "node:test";
import {
  STARFIELD,
  STAR_GLYPHS,
  advanceStar,
  glyphForNearness,
  projectStar,
  shadeForNearness,
  spawnStar,
} from "./starfield.ts";

test("closer stars project farther from the center", () => {
  const far = projectStar({ x: 0.25, y: 0.1, z: 6 }, 400);
  const near = projectStar({ x: 0.25, y: 0.1, z: 1 }, 400);
  const radius = (point: { x: number; y: number }) => Math.hypot(point.x, point.y);
  assert.ok(radius(near) > radius(far) * 3);
  assert.ok(near.nearness > far.nearness);
});

test("depth picks a heavier, brighter glyph", () => {
  assert.equal(glyphForNearness(0), STAR_GLYPHS[0]);
  assert.equal(glyphForNearness(0.99), "o");
  assert.ok(shadeForNearness(0.9) > shadeForNearness(0.1));
});

test("stars hold still when time does not move and recycle at the far plane", () => {
  const star = { x: 0.2, y: -0.2, z: STARFIELD.near + 0.01 };
  const held = advanceStar(star, 0, () => 0.5);
  assert.equal(held, star);
  const next = advanceStar(star, 1, () => 0.5);
  assert.equal(next.z, STARFIELD.depth);
  assert.ok(Math.hypot(next.x, next.y) <= STARFIELD.spread + 1e-9);
});

test("spawned stars stay inside the view volume", () => {
  let n = 0;
  const rand = () => {
    n += 1;
    return ((n * 17) % 100) / 100;
  };
  for (let i = 0; i < 40; i += 1) {
    const star = spawnStar(rand);
    assert.ok(star.z > STARFIELD.near && star.z <= STARFIELD.depth);
    assert.ok(Math.hypot(star.x, star.y) <= STARFIELD.spread + 1e-9);
  }
});
