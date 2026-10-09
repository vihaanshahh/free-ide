import mark from "../../../packages/brand/logo/mark.svg?raw";
import { AsciiField } from "./hero";
import { downloadHref, ideHref } from "./links";
import { landingParams } from "./params";
import "./style.css";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

const download = downloadHref({
  vite: import.meta.env.VITE_DOWNLOAD_URL,
  next: import.meta.env.NEXT_PUBLIC_DOWNLOAD_URL,
});
const ide = ideHref(import.meta.env.VITE_IDE_URL, import.meta.env.DEV);

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-download]")) {
  link.href = download;
}

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-ide]")) {
  if (!ide) {
    link.hidden = true;
    continue;
  }
  link.hidden = false;
  link.href = ide;
}

const canvas = document.querySelector<HTMLCanvasElement>("#field");
const status = document.querySelector<HTMLElement>("#field-status");
if (!canvas) throw new Error("Missing hero canvas");

const field = new AsciiField(canvas, landingParams);
field.load("/hero-source.png").then(
  () => {
    status?.setAttribute("hidden", "");
  },
  () => {
    if (!status) return;
    status.hidden = false;
    status.textContent = "The portrait did not load. The editor is still available.";
  },
);
