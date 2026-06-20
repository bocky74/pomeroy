import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { saveConfig, type Config, type Project } from "./storage";

interface SettingsCtx {
  config: Config;
  onSaved: (config: Config) => void;
  onBack: () => void;
}

export function renderSettings(container: HTMLElement, ctx: SettingsCtx): void {
  // Work on a deep copy so "Cancel" discards edits.
  const draft: Config = JSON.parse(JSON.stringify(ctx.config));

  container.innerHTML = `
    <section class="settings">
      <label class="field">Default session length (minutes)
        <input id="set-duration" type="number" min="1" max="180" value="${draft.defaultDurationMinutes}" />
      </label>

      <label class="field">Storage folder
        <div class="folder-row">
          <input id="set-folder" type="text" readonly placeholder="Asked on first save"
            value="${draft.dataFolder ? escapeAttr(draft.dataFolder) : ""}" />
          <button id="set-folder-btn" class="btn ghost small">Choose…</button>
        </div>
        <span class="muted">Monthly files are named <code>YYYYMM_pomeroy.json</code>.</span>
      </label>

      <div class="field">
        <div class="row-between">
          <span class="field-label">Projects &amp; tasks</span>
          <button id="add-project" class="btn ghost small">+ Add project</button>
        </div>
        <div id="projects"></div>
      </div>

      <div id="set-error" class="error"></div>

      <div class="settings-actions">
        <button id="set-cancel" class="btn ghost">Cancel</button>
        <button id="set-save" class="btn primary">Save settings</button>
      </div>
    </section>
  `;

  const projectsEl = container.querySelector<HTMLDivElement>("#projects")!;
  const folderInput = container.querySelector<HTMLInputElement>("#set-folder")!;

  const renderProjects = () => {
    if (draft.projects.length === 0) {
      projectsEl.innerHTML = `<p class="muted">No projects yet — add one to get started.</p>`;
      return;
    }
    projectsEl.innerHTML = draft.projects
      .map(
        (p, i) => `
        <div class="project-card" data-i="${i}">
          <div class="row-between">
            <input class="proj-name" data-i="${i}" type="text" value="${escapeAttr(p.name)}" placeholder="Project name" />
            <button class="btn ghost small del-proj" data-i="${i}" title="Remove project">✕</button>
          </div>
          <textarea class="proj-tasks" data-i="${i}" rows="3" placeholder="One task per line">${escapeHtml(p.tasks.join("\n"))}</textarea>
        </div>`,
      )
      .join("");
  };
  renderProjects();

  // Keep the draft in sync as the user types.
  projectsEl.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    const i = Number(t.dataset.i);
    if (t.classList.contains("proj-name")) {
      draft.projects[i].name = (t as HTMLInputElement).value;
    } else if (t.classList.contains("proj-tasks")) {
      draft.projects[i].tasks = parseTasks((t as HTMLTextAreaElement).value);
    }
  });

  projectsEl.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("del-proj")) {
      // Commit current field values before re-render so edits aren't lost.
      syncFromDom(projectsEl, draft);
      draft.projects.splice(Number(t.dataset.i), 1);
      renderProjects();
    }
  });

  container.querySelector<HTMLButtonElement>("#add-project")!.addEventListener("click", () => {
    syncFromDom(projectsEl, draft);
    draft.projects.push({ name: "New project", tasks: [] } as Project);
    renderProjects();
  });

  container.querySelector<HTMLButtonElement>("#set-folder-btn")!.addEventListener("click", async () => {
    let defaultPath: string | undefined;
    try {
      defaultPath = draft.dataFolder ?? (await homeDir());
    } catch {
      defaultPath = undefined;
    }
    const picked = await open({ directory: true, multiple: false, defaultPath });
    if (typeof picked === "string") {
      draft.dataFolder = picked;
      folderInput.value = picked;
    }
  });

  container.querySelector<HTMLButtonElement>("#set-cancel")!.addEventListener("click", ctx.onBack);

  container.querySelector<HTMLButtonElement>("#set-save")!.addEventListener("click", async () => {
    syncFromDom(projectsEl, draft);
    draft.defaultDurationMinutes = Math.max(
      1,
      Math.min(180, parseInt(container.querySelector<HTMLInputElement>("#set-duration")!.value, 10) || 25),
    );
    // Drop empty/blank project names.
    draft.projects = draft.projects
      .map((p) => ({ name: p.name.trim(), tasks: p.tasks.map((t) => t.trim()).filter(Boolean) }))
      .filter((p) => p.name.length > 0);

    try {
      await saveConfig(draft);
      ctx.onSaved(draft);
    } catch (err) {
      container.querySelector<HTMLDivElement>("#set-error")!.textContent = `Could not save: ${err}`;
    }
  });
}

/** Pull current values out of the live inputs into the draft. */
function syncFromDom(projectsEl: HTMLElement, draft: Config): void {
  projectsEl.querySelectorAll<HTMLInputElement>(".proj-name").forEach((el) => {
    draft.projects[Number(el.dataset.i)].name = el.value;
  });
  projectsEl.querySelectorAll<HTMLTextAreaElement>(".proj-tasks").forEach((el) => {
    draft.projects[Number(el.dataset.i)].tasks = parseTasks(el.value);
  });
}

function parseTasks(text: string): string[] {
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
