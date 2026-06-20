import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  getPendingSession,
  saveConfig,
  saveSession,
  type Config,
  type PendingSession,
} from "./storage";
import type { Preselect } from "./timer";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Show the modal asking what the just-finished session counted toward.
 * `config` may be mutated (dataFolder) if the user picks a storage folder.
 */
export async function showEndDialog(
  config: Config,
  preselect: Preselect,
  onSaved: () => void,
): Promise<void> {
  const pending = await getPendingSession();
  if (!pending) return;

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = buildMarkup(config, pending);
  document.body.appendChild(overlay);

  const projectSel = overlay.querySelector<HTMLSelectElement>("#dlg-project")!;
  const taskList = overlay.querySelector<HTMLDivElement>("#dlg-tasks")!;
  const remark = overlay.querySelector<HTMLTextAreaElement>("#dlg-remark")!;
  const errorBox = overlay.querySelector<HTMLDivElement>("#dlg-error")!;
  const saveBtn = overlay.querySelector<HTMLButtonElement>("#dlg-save")!;
  const discardBtn = overlay.querySelector<HTMLButtonElement>("#dlg-discard")!;

  // Default the project to the pre-selected one if it still exists.
  if (preselect.project && config.projects.some((p) => p.name === preselect.project)) {
    projectSel.value = preselect.project;
  }

  const renderTasks = () => {
    const proj = config.projects.find((p) => p.name === projectSel.value);
    const tasks = proj?.tasks ?? [];
    if (tasks.length === 0) {
      taskList.innerHTML = `<p class="muted">This project has no tasks. Add some in Settings.</p>`;
      return;
    }
    taskList.innerHTML = tasks
      .map((t) => {
        const checked = preselect.tasks.includes(t) ? "checked" : "";
        return `<label class="check"><input type="checkbox" value="${escapeAttr(t)}" ${checked}/> <span>${escapeHtml(t)}</span></label>`;
      })
      .join("");
  };
  renderTasks();
  projectSel.addEventListener("change", renderTasks);

  const close = () => overlay.remove();

  discardBtn.addEventListener("click", close);

  saveBtn.addEventListener("click", async () => {
    errorBox.textContent = "";
    const project = projectSel.value;
    if (!project) {
      errorBox.textContent = "Please choose a project.";
      return;
    }
    const tasks = Array.from(
      taskList.querySelectorAll<HTMLInputElement>("input:checked"),
    ).map((i) => i.value);

    saveBtn.disabled = true;
    try {
      await saveSession(project, tasks, remark.value.trim());
      close();
      onSaved();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("NO_DATA_FOLDER")) {
        const picked = await pickFolder();
        if (picked) {
          config.dataFolder = picked;
          await saveConfig(config);
          try {
            await saveSession(project, tasks, remark.value.trim());
            close();
            onSaved();
            return;
          } catch (err2) {
            errorBox.textContent = `Could not save: ${err2}`;
          }
        } else {
          errorBox.textContent = "A storage folder is required to save the session.";
        }
      } else {
        errorBox.textContent = `Could not save: ${msg}`;
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function pickFolder(): Promise<string | null> {
  let defaultPath: string | undefined;
  try {
    defaultPath = await homeDir();
  } catch {
    defaultPath = undefined;
  }
  const result = await open({
    directory: true,
    multiple: false,
    title: "Choose a folder for Pomeroy's monthly session files",
    defaultPath,
  });
  if (typeof result === "string") return result;
  return null;
}

function buildMarkup(config: Config, pending: PendingSession): string {
  const projectOptions =
    `<option value="">— choose —</option>` +
    config.projects
      .map((p) => `<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)}</option>`)
      .join("");

  return `
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h2>Session complete</h2>
        <p class="muted">${pending.durationMinutes} min · ${fmtTime(pending.start)} – ${fmtTime(pending.end)}</p>
      </header>
      <div class="modal-body">
        <label class="field">Project
          <select id="dlg-project">${projectOptions}</select>
        </label>
        <div class="field">
          <span class="field-label">Tasks <span class="muted">(choose any)</span></span>
          <div id="dlg-tasks" class="task-list"></div>
        </div>
        <label class="field">Remark <span class="muted">(optional)</span>
          <textarea id="dlg-remark" rows="2" placeholder="What did you get done?"></textarea>
        </label>
        <div id="dlg-error" class="error"></div>
      </div>
      <footer class="modal-foot">
        <button id="dlg-discard" class="btn ghost">Discard</button>
        <button id="dlg-save" class="btn primary">Save session</button>
      </footer>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
