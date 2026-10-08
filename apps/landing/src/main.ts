import mark from "../../../packages/brand/logo/mark.svg?raw";
import { AsciiField } from "./hero";
import { ideUrl, landingParams } from "./params";
import "./style.css";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-ide]")) {
  link.href = ideUrl;
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
