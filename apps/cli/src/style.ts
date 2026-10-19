export const rgb = {
  forest: [15, 62, 23],
  sage: [177, 219, 184],
  mint: [207, 231, 211],
  keylime: [225, 244, 223],
  cream: [255, 254, 252],
  moss: [154, 215, 168],
  clay: [214, 164, 150],
} as const;

export type Rgb = readonly [number, number, number];

export interface Paint {
  enabled: boolean;
  sage: (text: string) => string;
  mint: (text: string) => string;
  keylime: (text: string) => string;
  cream: (text: string) => string;
  moss: (text: string) => string;
  clay: (text: string) => string;
  bold: (text: string) => string;
  link: (text: string) => string;
  forestBg: (text: string) => string;
}

const identity = (text: string) => text;

export function paint(enabled: boolean): Paint {
  if (!enabled) {
    return {
      enabled: false,
      sage: identity,
      mint: identity,
      keylime: identity,
      cream: identity,
      moss: identity,
      clay: identity,
      bold: identity,
      link: identity,
      forestBg: identity,
    };
  }
  return {
    enabled: true,
    sage: (text) => fg(rgb.sage, text),
    mint: (text) => fg(rgb.mint, text),
    keylime: (text) => fg(rgb.keylime, text),
    cream: (text) => fg(rgb.cream, text),
    moss: (text) => fg(rgb.moss, text),
    clay: (text) => fg(rgb.clay, text),
    bold: (text) => `\u001b[1m${text}\u001b[22m`,
    link: (text) => `\u001b[4m${fg(rgb.mint, text)}\u001b[24m`,
    forestBg: (text) => bg(rgb.forest, text),
  };
}

export function useColor(env: NodeJS.ProcessEnv, stdoutIsTTY: boolean): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR === "0") return false;
  if (env.FORCE_COLOR === "1" || env.FORCE_COLOR === "true") return true;
  return stdoutIsTTY;
}

function fg(color: Rgb, text: string): string {
  return `\u001b[38;2;${color[0]};${color[1]};${color[2]}m${text}\u001b[39m`;
}

function bg(color: Rgb, text: string): string {
  return `\u001b[48;2;${color[0]};${color[1]};${color[2]}m${text}\u001b[49m`;
}
