export type Rgb = readonly [number, number, number];

export type EffectToggle = {
  enabled: boolean;
  intensity: number;
};

export type TonePoint = {
  x: number;
  y: number;
};

export type AsciiParams = {
  pfx: {
    bloom: EffectToggle;
    glitch: EffectToggle;
    filmDust: EffectToggle;
    halftone: EffectToggle;
    pixelate: EffectToggle;
    vignette: EffectToggle;
    chromatic: EffectToggle;
    filmGrain: EffectToggle;
    scanLines: EffectToggle;
  };
  mask: {
    tool: string;
    invert: boolean;
    shapes: unknown[];
    dataUrl: string | null;
    enabled: boolean;
    brushSize: number;
    showOverlay: boolean;
  };
  tint: string;
  bgBlur: number;
  bgMode: "blur" | "solid" | "image" | "none";
  invert: boolean;
  lights: { points: unknown[]; enabled: boolean };
  charSet: string;
  density: number;
  animated: boolean;
  blurType: "tilt" | "lens" | "gaussian" | "none";
  cellSize: number;
  contrast: number;
  coverage: number;
  animSpeed: EffectToggle;
  animStyle: string;
  bgOpacity: number;
  blurAngle: number;
  grayscale: number;
  lensFocus: number;
  tiltFocus: number;
  toneCurve: TonePoint[];
  blurAmount: number;
  brightness: number;
  renderMode: "dither" | "chars";
  saturation: number;
  styleBlend: GlobalCompositeOperation;
  blurCenterX: number;
  blurCenterY: number;
  customChars: string;
  tiltFeather: number;
  tintOpacity: number;
  edgeEmphasis: number;
  overlayBlend: "multiply" | "overlay" | "screen";
  tiltPosition: number;
  animIntensity: EffectToggle;
  progressiveReverse: boolean;
  progressivePosition: number;
  directionalBothSides: boolean;
};

export const CHAR_SETS: Record<string, string> = {
  standard: " .:-=+*#%@",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
};

/** Ordered 4x4 Bayer matrix. Values are 0..15. */
export const BAYER_4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Botanical ramp. Darks sit on Forest Ink; lights stay sage so a multiply
 * tint does not crush the photograph to black.
 */
const FOREST_RAMP: readonly { t: number; rgb: Rgb }[] = [
  { t: 0, rgb: [7, 24, 12] },
  { t: 0.18, rgb: [15, 62, 23] },
  { t: 0.46, rgb: [30, 84, 46] },
  { t: 0.72, rgb: [78, 132, 90] },
  { t: 1, rgb: [168, 206, 176] },
];

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function clampByte(n: number): number {
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 255) return 255;
  return rounded;
}

export function hexToRgb(hex: string): Rgb {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value) || full.length !== 6) return [15, 62, 23];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = clamp01(t);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export function mixRgbBytes(a: Rgb, b: Rgb, t: number): Rgb {
  const mixed = mixRgb(a, b, t);
  return [clampByte(mixed[0]), clampByte(mixed[1]), clampByte(mixed[2])];
}

export function sampleRamp(t: number): Rgb {
  const x = clamp01(t);
  let index = 1;
  while (index < FOREST_RAMP.length - 1 && FOREST_RAMP[index].t < x) index += 1;
  const left = FOREST_RAMP[index - 1];
  const right = FOREST_RAMP[index];
  const span = right.t - left.t || 1;
  return mixRgb(left.rgb, right.rgb, (x - left.t) / span);
}

export function applyToneCurve(t: number, curve: readonly TonePoint[]): number {
  if (curve.length === 0) return clamp01(t);
  const x = clamp01(t);
  if (x <= curve[0].x) return curve[0].y;
  for (let i = 1; i < curve.length; i += 1) {
    const left = curve[i - 1];
    const right = curve[i];
    if (x <= right.x) {
      const span = right.x - left.x || 1;
      return left.y + ((right.y - left.y) * (x - left.x)) / span;
    }
  }
  return curve[curve.length - 1].y;
}

function overlayChannel(base: number, tint: number): number {
  const b = base / 255;
  const t = tint / 255;
  const out = b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t);
  return out * 255;
}

function blendTint(base: Rgb, tint: Rgb, opacity: number, mode: AsciiParams["overlayBlend"]): Rgb {
  let mixed: Rgb;
  if (mode === "screen") {
    mixed = [
      255 - ((255 - base[0]) * (255 - tint[0])) / 255,
      255 - ((255 - base[1]) * (255 - tint[1])) / 255,
      255 - ((255 - base[2]) * (255 - tint[2])) / 255,
    ];
  } else if (mode === "overlay") {
    mixed = [
      overlayChannel(base[0], tint[0]),
      overlayChannel(base[1], tint[1]),
      overlayChannel(base[2], tint[2]),
    ];
  } else {
    mixed = [(base[0] * tint[0]) / 255, (base[1] * tint[1]) / 255, (base[2] * tint[2]) / 255];
  }
  return mixRgb(base, mixed, opacity);
}

export type GradeInput = Pick<
  AsciiParams,
  | "brightness"
  | "contrast"
  | "saturation"
  | "grayscale"
  | "invert"
  | "tint"
  | "tintOpacity"
  | "overlayBlend"
  | "toneCurve"
>;

/**
 * Adjustments in order: brightness, contrast, saturation, grayscale,
 * tone curve, then tint via overlayBlend. A forest ramp colorizes the
 * result by tintOpacity so the frame stays botanical green.
 */
export function gradePixel(r: number, g: number, b: number, params: GradeInput): Rgb {
  const lift = (params.brightness / 100) * 255;
  let red = r + lift;
  let green = g + lift;
  let blue = b + lift;
  const contrast = params.contrast / 100;
  red = (red - 128) * contrast + 128;
  green = (green - 128) * contrast + 128;
  blue = (blue - 128) * contrast + 128;
  red = clampByte(red);
  green = clampByte(green);
  blue = clampByte(blue);

  let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const saturation = params.saturation / 100;
  red = luma + (red - luma) * saturation;
  green = luma + (green - luma) * saturation;
  blue = luma + (blue - luma) * saturation;

  const grayMix = clamp01(params.grayscale / 100);
  red = red + (luma - red) * grayMix;
  green = green + (luma - green) * grayMix;
  blue = blue + (luma - blue) * grayMix;

  if (params.invert) {
    red = 255 - red;
    green = 255 - green;
    blue = 255 - blue;
  }

  luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const curved = clamp01(applyToneCurve(luma / 255, params.toneCurve));
  const gray = curved * 255;
  const tint = hexToRgb(params.tint);
  const opacity = clamp01(params.tintOpacity);
  const tinted = blendTint([gray, gray, gray], tint, opacity, params.overlayBlend);
  return mixRgbBytes(tinted, sampleRamp(curved), opacity);
}

export function gradeImageData(data: Uint8ClampedArray, params: GradeInput): void {
  for (let i = 0; i < data.length; i += 4) {
    const [red, green, blue] = gradePixel(data[i], data[i + 1], data[i + 2], params);
    data[i] = red;
    data[i + 1] = green;
    data[i + 2] = blue;
  }
}

export function resolveChars(params: Pick<AsciiParams, "charSet" | "customChars">): string {
  if (params.customChars.length > 0) return params.customChars;
  return CHAR_SETS[params.charSet] ?? CHAR_SETS.standard;
}

export function bayerThreshold(cellX: number, cellY: number): number {
  const size = BAYER_4.length;
  const row = ((cellY % size) + size) % size;
  const col = ((cellX % size) + size) % size;
  return (BAYER_4[row][col] + 0.5) / (size * size);
}

export type ShimmerInput = Pick<AsciiParams, "animated" | "animStyle" | "animSpeed" | "animIntensity">;

/** Traveling sine. Amplitude follows animIntensity; rate follows animSpeed. */
export function shimmerOffset(cellX: number, cellY: number, timeMs: number, params: ShimmerInput): number {
  if (!params.animated || params.animStyle !== "shimmer" || !params.animIntensity.enabled) return 0;
  const amplitude = (params.animIntensity.intensity / 100) * 0.2;
  const speedScale = params.animSpeed.enabled ? params.animSpeed.intensity / 100 : 0;
  const turns = timeMs / 1000 * (0.15 + speedScale * 0.9);
  const phase = turns * Math.PI * 2;
  const primary = Math.sin(phase + cellX * 0.47 - cellY * 0.19);
  const secondary = Math.sin(phase * 0.57 + cellX * 0.13 + cellY * 0.29);
  return (primary * 0.7 + secondary * 0.3) * amplitude;
}

export type DitherInput = ShimmerInput & Pick<AsciiParams, "density" | "coverage" | "renderMode">;

export function ditherIndex(
  luma: number,
  cellX: number,
  cellY: number,
  steps: number,
  timeMs: number,
  params: DitherInput,
): number {
  if (steps <= 0) return 0;
  const shifted = clamp01(luma + params.density / 100 + shimmerOffset(cellX, cellY, timeMs, params));
  const cutoff = 1 - clamp01(params.coverage / 100);
  if (shifted <= cutoff) return 0;
  if (params.renderMode === "chars") {
    return Math.min(steps, Math.max(0, Math.round(shifted * steps)));
  }
  const scaled = shifted * steps;
  const base = Math.floor(scaled);
  const fraction = scaled - base;
  const bump = fraction >= bayerThreshold(cellX, cellY) ? 1 : 0;
  return Math.min(steps, base + bump);
}

/** Light sage to cream. Screen blend needs light ink or the glyph disappears. */
export function glyphColor(index: number, steps: number): Rgb {
  const t = steps <= 0 ? 1 : clamp01(index / steps);
  return mixRgbBytes([111, 168, 122], [255, 254, 252], t ** 0.72);
}

export function glyphCss(index: number, steps: number): string {
  const [red, green, blue] = glyphColor(index, steps);
  return `rgb(${red} ${green} ${blue})`;
}

export type TiltInput = Pick<
  AsciiParams,
  | "blurType"
  | "blurAmount"
  | "blurAngle"
  | "blurCenterX"
  | "blurCenterY"
  | "tiltFocus"
  | "tiltFeather"
  | "tiltPosition"
  | "lensFocus"
>;

/** 0 is sharp, 1 is fully blurred. Tilt uses a horizontal band when blurAngle is 0. */
export function focusBlurWeight(xNorm: number, yNorm: number, params: TiltInput): number {
  if (params.blurAmount <= 0 || params.blurType === "none") return 0;
  if (params.blurType === "gaussian") return 1;
  if (params.blurType === "lens") {
    const dx = xNorm - params.blurCenterX / 100;
    const dy = yNorm - params.blurCenterY / 100;
    const dist = Math.hypot(dx, dy);
    const focus = Math.max(0.0001, params.lensFocus / 100);
    return smoothstep(focus * 0.5, focus * 0.5 + 0.18, dist);
  }
  const radians = (params.blurAngle * Math.PI) / 180;
  const axisX = Math.sin(radians);
  const axisY = Math.cos(radians);
  const dx = xNorm - 0.5;
  const dy = yNorm - params.tiltPosition / 100;
  const dist = Math.abs(dx * axisX + dy * axisY);
  const half = params.tiltFocus / 100 / 2;
  const feather = Math.max(0.0001, params.tiltFeather / 100);
  return smoothstep(half, half + feather, dist);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

export function applyEdgeEmphasis(luma: Float32Array, cols: number, rows: number, amount: number): void {
  if (amount <= 0 || cols < 3 || rows < 3) return;
  const gain = amount / 100;
  const source = luma.slice();
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      const index = y * cols + x;
      const gx = source[index + 1] - source[index - 1];
      const gy = source[index + cols] - source[index - cols];
      luma[index] = clamp01(source[index] + Math.min(1, Math.hypot(gx, gy)) * gain);
    }
  }
}

export function coverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(dstW / Math.max(1, srcW), dstH / Math.max(1, srcH));
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

export function vignetteAlpha(intensity: number): number {
  return clamp01(intensity / 100);
}

export function grainAlpha(intensity: number): number {
  return clamp01(intensity / 100) * 0.65;
}
