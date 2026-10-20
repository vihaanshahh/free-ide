import assert from "node:assert/strict";
import test from "node:test";
import {
  SHARK_RAMP,
  SHARK_STILL_TIME,
  glyphForShade,
  glyphIndex,
  heroMode,
  sampleField,
  sampleShark,
  sampleWater,
} from "./shark.ts";

test("the still query drops the animation", () => {
  assert.equal(heroMode(""), "shark");
  assert.equal(heroMode("?hero=still"), "still");
  assert.equal(heroMode("hero=shark"), "shark");
});

test("shade walks the density ramp from empty water to a heavy glyph", () => {
  assert.equal(glyphIndex(0), 0);
  assert.equal(glyphForShade(0), " ");
  assert.equal(glyphForShade(1), SHARK_RAMP[SHARK_RAMP.length - 1]);
  assert.ok(glyphIndex(0.85) > glyphIndex(0.2));
});

test("the frozen clock puts the shark in frame and leaves empty water quiet", () => {
  const body = sampleShark(0.46, 0.35, SHARK_STILL_TIME);
  const away = sampleShark(0.05, 0.08, SHARK_STILL_TIME);
  assert.ok(body > 0.45, `expected the body in frame, got ${body}`);
  assert.equal(away, 0);
  const water = sampleWater(0.2, 0.3, SHARK_STILL_TIME);
  assert.ok(water >= 0 && water <= 1);
  const field = sampleField(0.46, 0.35, SHARK_STILL_TIME);
  assert.equal(field.shark, true);
  assert.ok(field.shade > 0.45);
});
