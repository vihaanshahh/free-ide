import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyToneCurve,
  bayerThreshold,
  coverRect,
  ditherIndex,
  focusBlurWeight,
  gradePixel,
  glyphColor,
  shimmerOffset,
  type GradeInput,
} from "./pipeline.ts";

const identity: GradeInput = {
  brightness: 0,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  invert: false,
  tint: "#0f3e17",
  tintOpacity: 0,
  overlayBlend: "multiply",
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
};

describe("gradePixel", () => {
  it("keeps a neutral pixel gray when grayscale is full and tint is off", () => {
    const [r, g, b] = gradePixel(10, 20, 200, { ...identity, saturation: 0, grayscale: 100 });
    assert.equal(r, g);
    assert.equal(g, b);
  });

  it("raises contrast around mid gray", () => {
    const [r] = gradePixel(200, 200, 200, { ...identity, contrast: 128 });
    assert.ok(r > 200 && r < 230);
  });

  it("colorizes toward forest green when tint opacity is full", () => {
    const [r, g, b] = gradePixel(255, 255, 255, {
      ...identity,
      grayscale: 100,
      saturation: 0,
      tintOpacity: 1,
    });
    assert.ok(g > r && g > b, `expected green-dominant, got ${r},${g},${b}`);
  });
});

describe("dither", () => {
  const still = {
    density: 0,
    coverage: 100,
    renderMode: "dither" as const,
    animated: false,
    animStyle: "shimmer",
    animSpeed: { enabled: true, intensity: 100 },
    animIntensity: { enabled: true, intensity: 60 },
  };

  it("uses the Bayer threshold so neighbors can disagree", () => {
    const left = ditherIndex(0.45, 0, 0, 10, 0, still);
    const right = ditherIndex(0.45, 1, 0, 10, 0, still);
    assert.notEqual(left, right);
    assert.ok(left >= 0 && left <= 10);
    assert.ok(bayerThreshold(0, 0) < bayerThreshold(1, 0));
  });

  it("holds shimmer at zero when animation is off", () => {
    assert.equal(shimmerOffset(4, 6, 1200, still), 0);
  });

  it("moves shimmer when the style is on", () => {
    const early = shimmerOffset(2, 3, 0, { ...still, animated: true });
    const later = shimmerOffset(2, 3, 900, { ...still, animated: true });
    assert.notEqual(early, later);
    assert.ok(Math.abs(later) <= 0.2);
  });

  it("paints light glyphs greener than cream", () => {
    const [r, g, b] = glyphColor(1, 10);
    assert.ok(g >= r && g >= b);
  });
});

describe("focus and cover", () => {
  const tilt = {
    blurType: "tilt" as const,
    blurAmount: 30,
    blurAngle: 0,
    blurCenterX: 50,
    blurCenterY: 50,
    tiltFocus: 35,
    tiltFeather: 15,
    tiltPosition: 50,
    lensFocus: 40,
  };

  it("keeps the tilt band sharp and the edges soft", () => {
    assert.equal(focusBlurWeight(0.5, 0.5, tilt), 0);
    assert.equal(focusBlurWeight(0.5, 0, tilt), 1);
    assert.equal(focusBlurWeight(0.5, 0.5, { ...tilt, blurAmount: 0 }), 0);
  });

  it("leaves an identity tone curve unchanged", () => {
    assert.equal(applyToneCurve(0.4, identity.toneCurve), 0.4);
  });

  it("covers the destination without gaps", () => {
    const rect = coverRect(1440, 900, 800, 800);
    assert.ok(rect.w >= 800 && rect.h >= 800);
    assert.ok(rect.x <= 0 || rect.y <= 0);
  });
});
