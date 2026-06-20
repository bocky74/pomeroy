import "./styles.css";
import tomato from "./icons/tomato.svg?raw";
import { listen } from "@tauri-apps/api/event";
import { getConfig, type Config, type TickPayload } from "./storage";
import {
  renderTimer,
  updateCountdown,
  type Preselect,
  type TimerStatus,
} from "./timer";
import { renderSettings } from "./settings";
import { showEndDialog } from "./endDialog";

type View = "timer" | "settings";

const root = document.querySelector<HTMLDivElement>("#app")!;

let config: Config;
let view: View = "timer";
const status: TimerStatus = { running: false, remaining: 0, total: 0 };
const preselect: Preselect = { project: "", tasks: [] };

function renderShell(): void {
  root.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">${tomato}</span>
        <span class="brand-name">Pomeroy</span>
      </div>
      <button id="nav-btn" class="icon-btn" title="${view === "timer" ? "Settings" : "Back"}">
        ${view === "timer" ? gearIcon() : backIcon()}
      </button>
    </header>
    <main id="view"></main>
  `;

  const viewEl = root.querySelector<HTMLElement>("#view")!;
  const navBtn = root.querySelector<HTMLButtonElement>("#nav-btn")!;

  if (view === "timer") {
    navBtn.addEventListener("click", () => navigate("settings"));
    renderTimer(viewEl, {
      config,
      status,
      preselect,
      onOpenSettings: () => navigate("settings"),
      onStarted: () => renderShell(),
      onStopped: () => renderShell(),
    });
  } else {
    navBtn.addEventListener("click", () => navigate("timer"));
    renderSettings(viewEl, {
      config,
      onSaved: (updated) => {
        config = updated;
        navigate("timer");
      },
      onBack: () => navigate("timer"),
    });
  }
}

function navigate(next: View): void {
  view = next;
  renderShell();
}

async function reloadConfig(): Promise<void> {
  config = await getConfig();
}

async function init(): Promise<void> {
  await reloadConfig();
  renderShell();

  // Per-second updates from the Rust-owned timer.
  await listen<TickPayload>("tick", (e) => {
    status.running = e.payload.running;
    status.remaining = e.payload.remaining;
    status.total = e.payload.total;
    if (view === "timer") updateCountdown(status);
  });

  // Timer reached zero: return to idle and ask what it counted toward.
  await listen("session-finished", async () => {
    status.running = false;
    if (view === "timer") renderShell();
    await reloadConfig();
    await showEndDialog(config, preselect, async () => {
      await reloadConfig();
    });
  });

  // Session was stopped from the tray menu while the window was elsewhere.
  await listen("session-stopped", () => {
    status.running = false;
    if (view === "timer") renderShell();
  });
}

function gearIcon(): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
}
function backIcon(): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;
}

init();
