import mark from "../../../packages/brand/logo/mark.svg?raw";
import { applyDownloads } from "./downloads";
import { bindDemoVideo, bindReveals, bindShowcase } from "./reveal";
import { Starfield } from "./starfield-view";
import "./style.css";
import { mountTryChat } from "./try-chat";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

const starfield = document.querySelector("[data-starfield]");
if (starfield instanceof HTMLCanvasElement) new Starfield(starfield);

applyDownloads();
bindReveals();
bindShowcase();
bindDemoVideo();
mountTryChat();
