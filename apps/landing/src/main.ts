import mark from "../../../packages/brand/logo/mark.svg?raw";
import { applyDownloads } from "./downloads";
import { bindDemoVideo, bindReveals, bindShowcase } from "./reveal";
import "./style.css";
import { mountTryChat } from "./try-chat";

const markSlot = document.querySelector("#mark");
if (markSlot) markSlot.innerHTML = mark;

applyDownloads();
bindReveals();
bindShowcase();
bindDemoVideo();
mountTryChat();
