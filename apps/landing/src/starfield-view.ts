import {
  STAR_GLYPHS,
  STARFIELD,
  advanceStar,
  glyphForNearness,
  projectStar,
  shadeForNearness,
  spawnStar,
  type Star,
} from "./starfield";

const INK = "#0f3e17";
const GLYPH_COLOR = ["#9ec9a8", "#b1dbb8", "#cfe7d3", "#fffefc"];

/**
 * Forest Ink field, sage-to-cream glyphs. Draws only while the canvas is on
 * screen and the tab is visible. Reduced motion keeps the first frame.
 */
export class Starfield {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reduce: boolean;
  private readonly stars: Star[];
  private raf = 0;
  private last = 0;
  private onScreen = true;
  private cssW = 0;
  private cssH = 0;
  private pointerX = 0;
  private pointerY = 0;
  private scrollShift = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D is not available");
    this.canvas = canvas;
    this.ctx = ctx;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.stars = Array.from({ length: STARFIELD.count }, () => spawnStar(Math.random));
    canvas.dataset.ready = "false";

    const root = canvas.closest(".hero") ?? canvas;
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
    if (!this.reduce) {
      root.addEventListener("pointermove", (event) => {
        if (!(event instanceof PointerEvent)) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        this.pointerX = (event.clientX - rect.left) / rect.width - 0.5;
        this.pointerY = (event.clientY - rect.top) / rect.height - 0.5;
      });
      window.addEventListener(
        "scroll",
        () => {
          const rect = canvas.getBoundingClientRect();
          const mid = rect.top + rect.height * 0.5;
          this.scrollShift = Math.max(-1, Math.min(1, (window.innerHeight * 0.5 - mid) / window.innerHeight));
        },
        { passive: true },
      );
    }
    this.sync();
  }

  private running(): boolean {
    return !this.reduce && this.onScreen && !document.hidden;
  }

  private sync(): void {
    this.paint();
    this.canvas.dataset.ready = "true";
    if (this.running()) {
      if (!this.raf) {
        this.last = 0;
        this.raf = requestAnimationFrame(this.frame);
      }
      return;
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.running()) return;
    const dt = this.last === 0 ? 0.016 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    for (let i = 0; i < this.stars.length; i += 1) {
      this.stars[i] = advanceStar(this.stars[i], dt, Math.random);
    }
    this.paint();
    this.raf = requestAnimationFrame(this.frame);
  };

  private paint(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const bufferW = Math.floor(width * dpr);
    const bufferH = Math.floor(height * dpr);
    if (this.canvas.width !== bufferW || this.canvas.height !== bufferH) {
      this.canvas.width = bufferW;
      this.canvas.height = bufferH;
    }
    this.cssW = width;
    this.cssH = height;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, width, height);
    if (width < 2 || height < 2) return;

    const focal = Math.min(width, height) * 0.5;
    const cx = width * 0.66 + this.pointerX * 28 + this.scrollShift * 16;
    const cy = height * 0.5 + this.pointerY * 18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";

    const bands: Array<Array<{ x: number; y: number; nearness: number; glyph: string }>> = [[], [], [], []];
    for (let i = 0; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      const projected = projectStar(star, focal);
      const x = cx + projected.x;
      const y = cy + projected.y;
      if (x < -48 || y < -48 || x > width + 48 || y > height + 48) {
        this.stars[i] = spawnStar(Math.random, STARFIELD.depth);
        continue;
      }
      const glyph = glyphForNearness(projected.nearness);
      const band = STAR_GLYPHS.indexOf(glyph);
      bands[band]?.push({ x, y, nearness: projected.nearness, glyph });
    }

    for (let band = 0; band < bands.length; band += 1) {
      const size = 13 + band * 4;
      ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillStyle = GLYPH_COLOR[band] ?? GLYPH_COLOR[0];
      for (const mark of bands[band]) {
        ctx.globalAlpha = shadeForNearness(mark.nearness);
        if (mark.nearness > 0.62) {
          const trail = 1 + (mark.nearness - 0.62) * 1.4;
          ctx.globalAlpha = shadeForNearness(mark.nearness) * 0.28;
          ctx.fillText(mark.glyph, cx + (mark.x - cx) / trail, cy + (mark.y - cy) / trail);
          ctx.globalAlpha = shadeForNearness(mark.nearness);
        }
        ctx.fillText(mark.glyph, mark.x, mark.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}
