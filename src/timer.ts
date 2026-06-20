import { startSession, stopSession, type Config } from "./storage";

export interface Preselect {
  project: string;
  tasks: string[];
}

export interface TimerStatus {
  running: boolean;
  remaining: number;
  total: number;
}

interface TimerCtx {
  config: Config;
  status: TimerStatus;
  preselect: Preselect;
  onOpenSettings: () => void;
  onStarted: () => void;
  onStopped: () => void;
}

const RING_RADIUS = 86;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function formatMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Update only the live countdown elements (called on every tick). */
export function updateCountdown(status: TimerStatus): void {
  const label = document.getElementById("countdown");
  if (label) label.textContent = formatMMSS(status.remaining);

  const ring = document.getElementById("ring-progress") as SVGCircleElement | null;
  if (ring && status.total > 0) {
    const fraction = status.remaining / status.total;
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
  }
}

export function renderTimer(container: HTMLElement, ctx: TimerCtx): void {
  if (ctx.status.running) {
    renderRunning(container, ctx);
  } else {
    renderIdle(container, ctx);
  }
}

function renderIdle(container: HTMLElement, ctx: TimerCtx): void {
  const { config, preselect } = ctx;
  const minutes = config.defaultDurationMinutes || 25;

  container.innerHTML = `
    <section class="timer idle">
      <div class="dial">
        <div class="dial-minutes"><input id="duration" type="number" min="1" max="180" value="${minutes}" /></div>
        <div class="dial-unit">minutes</div>
      </div>

      <div class="preselect">
        <label>Project <span class="muted">(optional)</span>
          <select id="pre-project"></select>
        </label>
        <label>Task <span class="muted">(optional)</span>
          <select id="pre-task"></select>
        </label>
      </div>

      <button id="start" class="btn primary big">Start focus session</button>
      <p class="hint">When the timer ends, Pomeroy pops to the front to log what you worked on.</p>
    </section>
  `;

  const projectSel = container.querySelector<HTMLSelectElement>("#pre-project")!;
  const taskSel = container.querySelector<HTMLSelectElement>("#pre-task")!;

  projectSel.innerHTML =
    `<option value="">— none —</option>` +
    config.projects.map((p) => `<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)}</option>`).join("");
  projectSel.value = preselect.project;

  const fillTasks = () => {
    const proj = config.projects.find((p) => p.name === projectSel.value);
    const tasks = proj?.tasks ?? [];
    taskSel.innerHTML =
      `<option value="">— none —</option>` +
      tasks.map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
    taskSel.value = preselect.tasks[0] ?? "";
  };
  fillTasks();

  projectSel.addEventListener("change", () => {
    preselect.project = projectSel.value;
    preselect.tasks = [];
    fillTasks();
  });
  taskSel.addEventListener("change", () => {
    preselect.tasks = taskSel.value ? [taskSel.value] : [];
  });

  container.querySelector<HTMLButtonElement>("#start")!.addEventListener("click", async () => {
    const dur = container.querySelector<HTMLInputElement>("#duration")!;
    const m = Math.max(1, Math.min(180, parseInt(dur.value, 10) || minutes));
    ctx.status.running = true;
    ctx.status.total = m * 60;
    ctx.status.remaining = m * 60;
    await startSession(m);
    ctx.onStarted();
  });
}

function renderRunning(container: HTMLElement, ctx: TimerCtx): void {
  const { status, preselect } = ctx;
  const fraction = status.total > 0 ? status.remaining / status.total : 1;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  const ctxLabel =
    preselect.project || preselect.tasks.length
      ? `${preselect.project || "—"}${preselect.tasks.length ? " · " + preselect.tasks.join(", ") : ""}`
      : "Focusing…";

  container.innerHTML = `
    <section class="timer running">
      <div class="ring-wrap">
        <svg viewBox="0 0 200 200" class="ring">
          <circle class="ring-track" cx="100" cy="100" r="${RING_RADIUS}" />
          <circle id="ring-progress" class="ring-progress" cx="100" cy="100" r="${RING_RADIUS}"
            style="stroke-dasharray:${RING_CIRCUMFERENCE};stroke-dashoffset:${offset}" />
        </svg>
        <div class="ring-center">
          <div id="countdown" class="countdown">${formatMMSS(status.remaining)}</div>
          <div class="running-context">${escapeHtml(ctxLabel)}</div>
        </div>
      </div>
      <button id="stop" class="btn ghost big">Stop &amp; discard</button>
      <p class="hint">You can close this window — the timer keeps running in the tray.</p>
    </section>
  `;

  container.querySelector<HTMLButtonElement>("#stop")!.addEventListener("click", async () => {
    await stopSession();
    ctx.status.running = false;
    ctx.onStopped();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
