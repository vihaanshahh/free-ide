import mark from "../../../packages/brand/logo/mark.svg?raw";
import { applyDownloads } from "./downloads";
import { bindDemoVideo, bindReveals, bindShowcase } from "./reveal";
import { Starfield } from "./starfield-view";
import "./style.css";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

applyDownloads();
bindReveals();
bindShowcase();
bindDemoVideo();

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Missing hero canvas");
new Starfield(canvas);
