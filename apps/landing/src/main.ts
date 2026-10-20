import mark from "../../../packages/brand/logo/mark.svg?raw";
import { applyDownloads } from "./downloads";
import { bindDemoVideo, bindReveals, bindShowcase } from "./reveal";
import { heroMode } from "./shark";
import { SharkField } from "./shark-view";
import "./style.css";
import { mountTryChat } from "./try-chat";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

const hero = document.querySelector(".hero");
const mode = heroMode(window.location.search);
if (hero instanceof HTMLElement) hero.dataset.hero = mode;
const shark = document.querySelector("[data-shark]");
if (mode === "shark" && shark instanceof HTMLCanvasElement) new SharkField(shark);

applyDownloads();
bindReveals();
bindShowcase();
bindDemoVideo();
mountTryChat();
