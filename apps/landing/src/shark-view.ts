import { SHARK_STILL_TIME, glyphForShade, sampleField } from "./shark";

const FIELD = "#0c3014";
const WATER = ["#174628", "#245c34", "#3c7a4c"];
const BODY = ["#b7d8c0", "#e7f3ea", "#f7f7f4"];

/**
 * Forest Ink water, sage-to-cream glyphs. One shark glides on a sine spine.
 * Draws only while the canvas is on screen. Reduced motion keeps one frame.
 */
export class SharkField {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reduce: boolean;
  private raf = 0;
  private last = 0;
  private elapsed = SHARK_STILL_TIME;
  private onScreen = true;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D is not available");
    this.canvas = canvas;
    this.ctx = ctx;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    canvas.dataset.ready = "false";

    const observer = new ResizeObserver(() => this.sync());
    observer.observe(canvas);
    const visibility = new IntersectionObserver(
      (entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        this.sync();
      },
      { threshold: 0 },
    );
    visibility.observe(canvas);
    document.addEventListener("visibilitychange", () => this.sync());
    this.sync();
  }

  private running(): boolean {
    return !this.reduce && this.onScreen && !document.hidden;
  }

  private sync(): void {
    this.paint(this.elapsed);
    if (this.running()) {
      if (!this.raf) {
        this.last = 0;
        this.raf = requestAnimationFrame((now) => this.frame(now));
      }
      return;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(now: number): void {
    this.raf = 0;
    if (!this.running()) return;
    if (this.last) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.elapsed += dt;
    }
    this.last = now;
    this.paint(this.elapsed);
    this.raf = requestAnimationFrame((stamp) => this.frame(stamp));
  }

  private paint(time: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (width !== this.cssW || height !== this.cssH) {
      this.cssW = width;
      this.cssH = height;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, width, height);

    const cell = width < 700 ? 12 : 14;
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    ctx.font = `500 ${Math.max(10, cell - 1)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const stage = this.canvas.parentElement;
    const pad = stage ? Number.parseFloat(getComputedStyle(stage).paddingTop) || 0 : 0;
    const centerY = pad > 24 ? (pad * 0.46) / height : 0.36;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sample = sampleField((col + 0.5) / cols, (row + 0.5) / rows, time, centerY);
        const glyph = glyphForShade(sample.shade);
        if (glyph === " ") continue;
        const bucket = Math.min(2, Math.floor(sample.shade * 3));
        ctx.fillStyle = sample.shark ? BODY[bucket] : WATER[bucket];
        ctx.globalAlpha = sample.shark ? 0.55 + sample.shade * 0.45 : 0.28 + sample.shade * 0.45;
        ctx.fillText(glyph, (col + 0.5) * cell, (row + 0.5) * cell);
      }
    }
    ctx.globalAlpha = 1;
    this.canvas.dataset.ready = "true";
  }
}
