import { OPENCODE_VERSION } from "./config.ts";
import type { Paint } from "./style.ts";

const WIDTH = 56;
const MARK_WIDTH = 10;

const MARK = ["", " ╭───╮", "╭╯   │", "│   ╭╯", "╰───╯", ""];

export function renderBanner(p: Paint, mode: "mock" | "live"): string {
  const rows: Array<{ mark: string; text: string; tone: "title" | "body" | "meta" }> = [
    { mark: MARK[0], text: "", tone: "body" },
    { mark: MARK[1], text: "subspaces.si", tone: "title" },
    { mark: MARK[2], text: "free, ad-funded coding", tone: "body" },
    { mark: MARK[3], text: "GLM-5.3-Flash", tone: "body" },
    { mark: MARK[4], text: "DeepSeek V4.1 Flash", tone: "body" },
    { mark: MARK[5], text: `opencode v${OPENCODE_VERSION}  ·  ${mode}`, tone: "meta" },
  ];
  return rows.map((row) => bannerRow(p, row.mark, row.text, row.tone)).join("\n");
}

function bannerRow(p: Paint, mark: string, text: string, tone: "title" | "body" | "meta"): string {
  const left = mark.padEnd(MARK_WIDTH, " ");
  const gap = "  ";
  const textWidth = WIDTH - MARK_WIDTH - gap.length;
  const right = text.slice(0, textWidth).padEnd(textWidth, " ");
  if (!p.enabled) return left + gap + right;
  const coloredText =
    tone === "title" ? p.bold(p.cream(text)) : tone === "meta" ? p.sage(text) : p.mint(text);
  const pad = " ".repeat(Math.max(0, textWidth - text.length));
  return p.forestBg(p.sage(left) + p.sage(gap) + coloredText + pad);
}
