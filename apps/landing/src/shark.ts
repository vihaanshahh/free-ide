/** Glyph ramp, sparse to dense. A space keeps deep water quiet. */
export const SHARK_RAMP = " ·:;=+*#%@";

/** Frozen clock for prefers-reduced-motion. The shark sits in frame. */
export const SHARK_STILL_TIME = 13.4;

export function heroMode(search: string): "shark" | "still" {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("hero") === "still" ? "still" : "shark";
}

export function glyphIndex(shade: number): number {
  const clamped = Math.max(0, Math.min(1, shade));
  const curved = Math.pow(clamped, 0.82);
  return Math.min(SHARK_RAMP.length - 1, Math.floor(curved * (SHARK_RAMP.length - 1) + 1e-6));
}

export function glyphForShade(shade: number): string {
  return SHARK_RAMP[glyphIndex(shade)] ?? " ";
}

interface SpinePoint {
  x: number;
  y: number;
  r: number;
}

function swim(time: number): { headX: number; dir: number; centerY: number } {
  const trip = 14;
  const p = (time % trip) / trip;
  const goingRight = p < 0.5;
  const u = goingRight ? p * 2 : (1 - p) * 2;
  return {
    headX: 0.28 + u * 0.46,
    dir: goingRight ? 1 : -1,
    centerY: 0.36 + Math.sin(time * 0.28) * 0.012,
  };
}

function spinePoint(along: number, time: number, centerY = swim(time).centerY): SpinePoint {
  const { headX, dir } = swim(time);
  const wag = Math.sin(time * 2.05 - along * 6.2) * along * along;
  const thickness =
    along < 0.14
      ? 0.018 + along * 0.13
      : along < 0.55
        ? 0.042 + Math.sin(((along - 0.14) / 0.41) * Math.PI) * 0.022
        : Math.max(0.01, 0.038 * (1 - (along - 0.55) / 0.45));
  return {
    x: headX - dir * along * 0.42,
    y: centerY + wag * 0.05 * dir,
    r: thickness,
  };
}

function nearDisc(nx: number, ny: number, point: SpinePoint): number {
  const dx = (nx - point.x) / Math.max(point.r, 0.004);
  const dy = (ny - point.y) / (Math.max(point.r, 0.004) * 0.42);
  const dist = Math.hypot(dx, dy);
  if (dist >= 1) return 0;
  return 1 - dist;
}

/** 0..1 presence of the shark body at a normalized hero point. */
export function sampleShark(nx: number, ny: number, time: number, centerY?: number): number {
  let body = 0;
  const samples = 10;
  for (let i = 0; i < samples; i += 1) {
    const along = i / (samples - 1);
    body = Math.max(body, nearDisc(nx, ny, spinePoint(along, time, centerY)));
  }
  const head = spinePoint(0.22, time, centerY);
  const mid = spinePoint(0.4, time, centerY);
  const tail = spinePoint(0.92, time, centerY);
  const dorsal = nearDisc(nx, ny, { x: mid.x, y: mid.y - mid.r * 0.55, r: mid.r * 0.72 });
  const pectoral = nearDisc(nx, ny, { x: head.x - 0.02, y: head.y + head.r * 0.62, r: head.r * 0.7 });
  const caudalTop = nearDisc(nx, ny, { x: tail.x - 0.012, y: tail.y - tail.r * 1.15, r: tail.r * 1.35 });
  const caudalLow = nearDisc(nx, ny, { x: tail.x - 0.01, y: tail.y + tail.r * 1.2, r: tail.r * 1.25 });
  let shade = Math.max(body, dorsal * 0.96, pectoral * 0.9, caudalTop * 0.95, caudalLow * 0.92);
  if (shade > 0.18) shade = 0.62 + shade * 0.38;
  const eye = nearDisc(nx, ny, { x: head.x + head.r * 0.12, y: head.y - head.r * 0.1, r: head.r * 0.2 });
  if (eye > 0.45) shade = 0.2;
  return Math.max(0, Math.min(1, shade));
}

/** Slow caustic field. Darker toward the bottom, the depth fog. */
export function sampleWater(nx: number, ny: number, time: number): number {
  const drift = time * 0.11;
  const a = Math.sin(nx * 11.5 + drift) * Math.cos(ny * 6.2 - drift * 0.55);
  const b = Math.sin((nx * 1.8 + ny) * 8.4 - drift * 0.35);
  const caustic = Math.max(0, a * 0.62 + b * 0.38);
  const fog = 1 - ny * 0.5;
  const vignette = 1 - Math.abs(nx - 0.5) * 0.28;
  return Math.max(0, Math.min(1, caustic * fog * vignette * 0.72));
}

export function sampleField(
  nx: number,
  ny: number,
  time: number,
  centerY?: number,
): { shade: number; shark: boolean } {
  const shark = sampleShark(nx, ny, time, centerY);
  if (shark > 0.06) return { shade: shark, shark: true };
  return { shade: sampleWater(nx, ny, time) * 0.42, shark: false };
}
