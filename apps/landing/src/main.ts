import mark from "../../../packages/brand/logo/mark.svg?raw";
import { applyDownloads } from "./downloads";
import { bindDemoVideo, bindReveals, bindShowcase } from "./reveal";
import "./style.css";
import { mountTryChat } from "./try-chat";

const NAV = [
  { href: "/tasks", id: "tasks", label: "Tasks" },
  { href: "/templates", id: "templates", label: "Templates" },
  { href: "/pricing", id: "pricing", label: "Pricing" },
  { href: "/security", id: "security", label: "Security" },
];

const page = document.body.dataset.page || "home";

const header = document.querySelector("#site-header");
if (header) {
  const links = NAV.map(
    (item) =>
      `<a href="${item.href}"${page === item.id ? ' aria-current="page"' : ""}>${item.label}</a>`,
  ).join("");
  header.innerHTML = `<div class="nav-bar">
    <a class="brand" href="/">
      <span id="mark" aria-hidden="true"></span>
      subspaces.si
    </a>
    <nav class="nav" aria-label="Primary">${links}</nav>
    <a class="nav-cta" href="/download">Download</a>
  </div>`;
  const markSlot = header.querySelector("#mark");
  if (markSlot) markSlot.innerHTML = mark;
}

const footer = document.querySelector("#site-footer");
if (footer) {
  footer.innerHTML = `<div class="footer-inner">
    <div>
      <p class="footer-brand">subspaces.si</p>
      <p>A coding IDE paid for by ads. There is no Pro tier.</p>
    </div>
    <div>
      <p class="footer-label">Product</p>
      <div class="footer-links">
        <a href="/tasks">Tasks</a>
        <a href="/templates">Templates</a>
        <a href="/pricing">Pricing</a>
        <a href="/download">Download</a>
      </div>
    </div>
    <div>
      <p class="footer-label">Company</p>
      <div class="footer-links">
        <a href="/about">About</a>
        <a href="/changelog">Changelog</a>
        <a href="/security">Security</a>
      </div>
    </div>
  </div>
  <p class="footer-note">Prompts and replies are logged on the server so usage can be reviewed. Passwords and API keys are not.</p>`;
}

if (document.querySelector("[data-download]")) applyDownloads();
bindReveals();
bindShowcase();
bindDemoVideo();
mountTryChat();
