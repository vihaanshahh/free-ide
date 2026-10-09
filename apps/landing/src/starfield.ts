/**
 * Perspective starfield. Each star sits in a view volume and drifts toward
 * the camera, so it slides outward and steps up through `. * + o`.
 */

export const STAR_GLYPHS = [".", "*", "+", "o"] as const;

export const STARFIELD = {
  spread: 1,
  depth: 8,
  near: 0.45,
  speed: 0.7,
  count: 180,
} as const;

export type Star = { x: number; y: number; z: number };

export type Projection = { x: number; y: number; nearness: number };

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function spawnStar(rand: () => number, z?: number): Star {
  const angle = rand() * Math.PI * 2;
  const radius = Math.sqrt(rand()) * STARFIELD.spread;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: z ?? STARFIELD.near + rand() * (STARFIELD.depth - STARFIELD.near),
  };
}

/** Move one star toward the camera. A star that passes the near plane restarts at the far plane. */
export function advanceStar(star: Star, dt: number, rand: () => number): Star {
  if (dt <= 0) return star;
  const z = star.z - STARFIELD.speed * dt;
  if (z > STARFIELD.near) return { x: star.x, y: star.y, z };
  return spawnStar(rand, STARFIELD.depth);
}

export function projectStar(star: Star, focal: number): Projection {
  const z = Math.max(star.z, 0.001);
  const span = STARFIELD.depth - STARFIELD.near;
  return {
    x: (star.x / z) * focal,
    y: (star.y / z) * focal,
    nearness: clamp01((STARFIELD.depth - z) / span),
  };
}

export function glyphForNearness(nearness: number): (typeof STAR_GLYPHS)[number] {
  const index = Math.min(STAR_GLYPHS.length - 1, Math.floor(clamp01(nearness) * STAR_GLYPHS.length));
  return STAR_GLYPHS[index];
}

export function shadeForNearness(nearness: number): number {
  return 0.28 + clamp01(nearness) * 0.72;
}
