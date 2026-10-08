import {
  applyEdgeEmphasis,
  coverRect,
  ditherIndex,
  focusBlurWeight,
  glyphCss,
  gradeImageData,
  grainAlpha,
  resolveChars,
  vignetteAlpha,
  type AsciiParams,
} from "./pipeline";

const FOREST_SHADOW = "#0c2f10";

/**
 * Canvas2D portrait.
 * The source is graded once (brightness, contrast, saturation, grayscale, tint).
 * Each frame samples that grade into a cell grid, draws Bayer-dithered glyphs
 * with screen blend, then tilt-blurs, vignettes, and grains the composite.
 * Lights and the mask stay off for this preset.
 */
export class AsciiField {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly params: AsciiParams;
  private readonly reduceMotion: boolean;
  private image: HTMLImageElement | null = null;
  private photo: HTMLCanvasElement | null = null;
  private scene: HTMLCanvasElement | null = null;
  private soft: HTMLCanvasElement | null = null;
  private readonly grain: HTMLCanvasElement;
  private sprites: HTMLCanvasElement[] = [];
  private chars = "";
  private cell = 9;
  private dpr = 1;
  private cols = 0;
  private rows = 0;
  private luma = new Float32Array();
  private backingW = 0;
  private backingH = 0;
  private raf = 0;
  private running = false;
  private readonly onResize: () => void;

  constructor(canvas: HTMLCanvasElement, params: AsciiParams) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D is not available");
    this.canvas = canvas;
    this.ctx = ctx;
    this.params = params;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.grain = makeGrain(128);
    this.onResize = () => this.rebuild();
    const observer = new ResizeObserver(this.onResize);
    observer.observe(canvas);
  }

  async load(src: string): Promise<void> {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
    this.image = image;
    this.rebuild();
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const tick = (now: number) => {
      if (!this.running) return;
      this.draw(this.reduceMotion ? 0 : now);
      this.canvas.dataset.ready = "true";
      if (!this.reduceMotion) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private rebuild(): void {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (!this.image || cssW < 2 || cssH < 2) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(cssW * this.dpr);
    const height = Math.round(cssH * this.dpr);
    const cell = Math.max(4, Math.round(this.params.cellSize * this.dpr));
    if (width === this.backingW && height === this.backingH && cell === this.cell && this.photo) return;

    this.backingW = width;
    this.backingH = height;
    this.cell = cell;
    this.canvas.width = width;
    this.canvas.height = height;

    this.photo = document.createElement("canvas");
    this.photo.width = width;
    this.photo.height = height;
    this.scene = document.createElement("canvas");
    this.scene.width = width;
    this.scene.height = height;
    this.soft = document.createElement("canvas");
    this.soft.width = width;
    this.soft.height = height;

    const photoCtx = this.photo.getContext("2d", { willReadFrequently: true });
    if (!photoCtx) return;
    photoCtx.fillStyle = FOREST_SHADOW;
    photoCtx.fillRect(0, 0, width, height);
    const fitted = coverRect(this.image.naturalWidth, this.image.naturalHeight, width, height);
    photoCtx.drawImage(this.image, fitted.x, fitted.y, fitted.w, fitted.h);
    const pixels = photoCtx.getImageData(0, 0, width, height);
    gradeImageData(pixels.data, this.params);
    photoCtx.putImageData(pixels, 0, 0);

    this.chars = resolveChars(this.params);
    this.sprites = renderSprites(this.chars, cell);
    const sampled = sampleLuma(pixels.data, width, height, cell);
    this.cols = sampled.cols;
    this.rows = sampled.rows;
    this.luma = new Float32Array(sampled.luma);
    applyEdgeEmphasis(this.luma, this.cols, this.rows, this.params.edgeEmphasis);
  }

  private draw(timeMs: number): void {
    const { ctx, params } = this;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!this.photo || !this.scene || !this.soft || width === 0) {
      ctx.fillStyle = FOREST_SHADOW;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    const sceneCtx = this.scene.getContext("2d");
    if (!sceneCtx) return;
    paintBackground(sceneCtx, this.photo, width, height, params, this.dpr);
    paintGlyphs(sceneCtx, this.sprites, this.luma, this.cols, this.rows, this.cell, this.chars.length - 1, timeMs, params);
    compositeFocus(ctx, this.scene, this.soft, params, this.dpr);

    if (params.pfx.vignette.enabled) {
      paintVignette(ctx, width, height, vignetteAlpha(params.pfx.vignette.intensity));
    }
    if (params.pfx.filmGrain.enabled) {
      paintGrain(ctx, this.grain, width, height, grainAlpha(params.pfx.filmGrain.intensity), this.reduceMotion ? 0 : timeMs);
    }
    // lights.enabled and mask.enabled are false in the landing preset, so those passes are skipped.
  }
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  photo: HTMLCanvasElement,
  width: number,
  height: number,
  params: AsciiParams,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.fillStyle = FOREST_SHADOW;
  ctx.fillRect(0, 0, width, height);
  if (params.bgMode === "none") return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, params.bgOpacity / 100));
  if (params.bgMode === "solid") {
    ctx.fillStyle = params.tint;
    ctx.fillRect(0, 0, width, height);
  } else {
    if (params.bgMode === "blur" && params.bgBlur > 0) {
      ctx.filter = `blur(${params.bgBlur * dpr}px)`;
    }
    ctx.drawImage(photo, 0, 0);
  }
  ctx.restore();
}

function paintGlyphs(
  ctx: CanvasRenderingContext2D,
  sprites: HTMLCanvasElement[],
  luma: Float32Array,
  cols: number,
  rows: number,
  cell: number,
  steps: number,
  timeMs: number,
  params: AsciiParams,
): void {
  ctx.save();
  ctx.globalCompositeOperation = params.styleBlend;
  for (let row = 0; row < rows; row += 1) {
    const y = row * cell;
    for (let col = 0; col < cols; col += 1) {
      const index = ditherIndex(luma[row * cols + col], col, row, steps, timeMs, params);
      if (index <= 0) continue;
      const sprite = sprites[index];
      if (sprite) ctx.drawImage(sprite, col * cell, y);
    }
  }
  ctx.restore();
}

function compositeFocus(
  ctx: CanvasRenderingContext2D,
  scene: HTMLCanvasElement,
  soft: HTMLCanvasElement,
  params: AsciiParams,
  dpr: number,
): void {
  const width = scene.width;
  const height = scene.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  if (params.blurAmount <= 0 || params.blurType === "none") {
    ctx.drawImage(scene, 0, 0);
    return;
  }

  const softCtx = soft.getContext("2d");
  if (!softCtx) {
    ctx.drawImage(scene, 0, 0);
    return;
  }
  softCtx.setTransform(1, 0, 0, 1, 0, 0);
  softCtx.filter = `blur(${params.blurAmount * dpr}px)`;
  softCtx.drawImage(scene, 0, 0);
  softCtx.filter = "none";
  ctx.drawImage(scene, 0, 0);

  if (params.blurType === "gaussian") {
    ctx.drawImage(soft, 0, 0);
    return;
  }

  const strips = params.blurType === "lens" ? 18 : 32;
  for (let i = 0; i < strips; i += 1) {
    const y0 = Math.floor((i / strips) * height);
    const y1 = Math.floor(((i + 1) / strips) * height);
    const weight = focusBlurWeight(0.5, (i + 0.5) / strips, params);
    if (weight <= 0.02 || y1 <= y0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, width, y1 - y0);
    ctx.clip();
    ctx.globalAlpha = weight;
    ctx.drawImage(soft, 0, 0);
    ctx.restore();
  }
}

function paintVignette(ctx: CanvasRenderingContext2D, width: number, height: number, alpha: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const inner = Math.min(width, height) * 0.28;
  const outer = Math.hypot(cx, cy);
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, "rgba(12, 47, 16, 0)");
  gradient.addColorStop(1, `rgba(12, 47, 16, ${alpha.toFixed(3)})`);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function paintGrain(
  ctx: CanvasRenderingContext2D,
  grain: HTMLCanvasElement,
  width: number,
  height: number,
  alpha: number,
  timeMs: number,
): void {
  const pattern = ctx.createPattern(grain, "repeat");
  if (!pattern) return;
  const shift = Math.floor(timeMs / 70) % grain.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.translate(shift, shift * 0.5);
  ctx.fillStyle = pattern;
  ctx.fillRect(-shift, -shift, width + grain.width, height + grain.height);
  ctx.restore();
}

function renderSprites(chars: string, cell: number): HTMLCanvasElement[] {
  const steps = Math.max(1, chars.length - 1);
  return [...chars].map((glyph, index) => {
    const sprite = document.createElement("canvas");
    sprite.width = cell;
    sprite.height = cell;
    const ctx = sprite.getContext("2d");
    if (!ctx || glyph === " ") return sprite;
    ctx.clearRect(0, 0, cell, cell);
    ctx.fillStyle = glyphCss(index, steps);
    ctx.font = `500 ${Math.max(8, Math.round(cell * 1.05))}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, cell / 2, cell / 2 + cell * 0.06);
    return sprite;
  });
}

function sampleLuma(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cell: number,
): { cols: number; rows: number; luma: Float32Array } {
  const cols = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.floor(height / cell));
  const luma = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      let count = 0;
      const x0 = col * cell;
      const y0 = row * cell;
      const x1 = Math.min(width, x0 + cell);
      const y1 = Math.min(height, y0 + cell);
      for (let y = y0; y < y1; y += 1) {
        let offset = (y * width + x0) * 4;
        for (let x = x0; x < x1; x += 1) {
          sum += data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
          count += 1;
          offset += 4;
        }
      }
      luma[row * cols + col] = count === 0 ? 0 : sum / count / 255;
    }
  }
  return { cols, rows, luma };
}

function makeGrain(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const pixels = ctx.createImageData(size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = 118 + Math.floor(Math.random() * 80);
    pixels.data[i] = n;
    pixels.data[i + 1] = n + 4;
    pixels.data[i + 2] = n - 6;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
