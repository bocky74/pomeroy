import { invoke } from "@tauri-apps/api/core";

export interface Project {
  name: string;
  tasks: string[];
}

export interface Config {
  dataFolder: string | null;
  defaultDurationMinutes: number;
  projects: Project[];
}

export interface PendingSession {
  start: string;
  end: string;
  durationMinutes: number;
}

export interface TickPayload {
  remaining: number;
  total: number;
  running: boolean;
}

export const getConfig = () => invoke<Config>("get_config");

export const saveConfig = (config: Config) =>
  invoke<void>("save_config", { config });

export const startSession = (minutes: number) =>
  invoke<void>("start_session", { minutes });

export const stopSession = () => invoke<void>("stop_session");

export const getPendingSession = () =>
  invoke<PendingSession | null>("get_pending_session");

export const isRunning = () => invoke<boolean>("is_running");

/**
 * Save the just-completed session. Throws with message "NO_DATA_FOLDER" when no
 * storage folder is configured yet, so the caller can prompt and retry.
 */
export const saveSession = (project: string, tasks: string[], remark: string) =>
  invoke<string>("save_session", { project, tasks, remark });
