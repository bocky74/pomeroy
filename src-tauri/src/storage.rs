use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Local};
use tauri::{AppHandle, Manager, State};

use crate::models::{Config, Session};
use crate::timer::TimerState;

/// Path to the persistent config file inside the OS app-config directory.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    Ok(dir.join("config.json"))
}

/// Load the config, falling back to defaults if the file is missing or unreadable.
pub fn load_config(app: &AppHandle) -> Config {
    let Ok(path) = config_path(app) else {
        return Config::default();
    };
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

/// Persist the config, creating the app-config directory if needed.
pub fn persist_config(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("could not create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("could not serialize config: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("could not write config: {e}"))
}

/// Derive the `YYYYMM` bucket from an ISO-8601 timestamp, using the *end* time.
/// Falls back to the current local month if the timestamp cannot be parsed.
fn month_key(iso_timestamp: &str) -> String {
    match DateTime::parse_from_rfc3339(iso_timestamp) {
        Ok(dt) => dt.format("%Y%m").to_string(),
        Err(_) => Local::now().format("%Y%m").to_string(),
    }
}

/// Append a session to the appropriate monthly file.
///
/// - Creates the file with a single-element array if it does not exist.
/// - Otherwise reads, appends, and rewrites — never discarding existing entries.
/// - If the existing file is corrupt, it is backed up to `*.bak` rather than lost.
/// - Writes go to a temp file and are atomically renamed into place.
pub fn append_session(folder: &Path, session: &Session) -> Result<PathBuf, String> {
    fs::create_dir_all(folder).map_err(|e| format!("could not create data folder: {e}"))?;

    let filename = format!("{}_pomeroy.json", month_key(&session.end));
    let path = folder.join(&filename);

    let mut sessions: Vec<Session> = if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("could not read {filename}: {e}"))?;
        match serde_json::from_str::<Vec<Session>>(&content) {
            Ok(existing) => existing,
            Err(_) => {
                // Don't destroy data we can't parse — back it up and start fresh.
                let backup = folder.join(format!("{filename}.bak"));
                let _ = fs::copy(&path, &backup);
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    sessions.push(session.clone());

    let json = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("could not serialize sessions: {e}"))?;

    // Atomic write: temp file in the same directory, then rename.
    let tmp = folder.join(format!(".{filename}.tmp"));
    fs::write(&tmp, json).map_err(|e| format!("could not write temp file: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("could not finalize {filename}: {e}"))?;

    Ok(path)
}

// ----------------------------------------------------------------------------
// Tauri commands
// ----------------------------------------------------------------------------

#[tauri::command]
pub fn get_config(app: AppHandle) -> Config {
    load_config(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    persist_config(&app, &config)
}

/// Save the pending (just-completed) session against a project/tasks/remark.
///
/// Returns the absolute path of the file written. Returns the error string
/// `"NO_DATA_FOLDER"` if no data folder has been configured yet, so the
/// frontend can prompt the user to pick one and retry.
#[tauri::command]
pub fn save_session(
    app: AppHandle,
    state: State<TimerState>,
    project: String,
    tasks: Vec<String>,
    remark: String,
) -> Result<String, String> {
    let config = load_config(&app);
    let folder = config
        .data_folder
        .clone()
        .ok_or_else(|| "NO_DATA_FOLDER".to_string())?;

    let pending = state
        .0
        .lock()
        .unwrap()
        .pending
        .clone()
        .ok_or_else(|| "NO_PENDING_SESSION".to_string())?;

    let session = Session {
        start: pending.start,
        end: pending.end,
        duration_minutes: pending.duration_minutes,
        project,
        tasks,
        remark,
    };

    let path = append_session(Path::new(&folder), &session)?;

    // Clear the pending session now that it has been logged.
    state.0.lock().unwrap().pending = None;

    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(end: &str) -> Session {
        Session {
            start: end.to_string(),
            end: end.to_string(),
            duration_minutes: 25,
            project: "P".into(),
            tasks: vec!["T".into()],
            remark: String::new(),
        }
    }

    #[test]
    fn month_key_uses_end_timestamp() {
        assert_eq!(month_key("2026-06-20T12:13:00+02:00"), "202606");
        assert_eq!(month_key("2026-01-01T00:00:00Z"), "202601");
    }

    #[test]
    fn append_creates_and_extends_without_overwrite() {
        let dir = std::env::temp_dir().join(format!("pomeroy_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        let p1 = append_session(&dir, &sample("2026-06-20T10:00:00+02:00")).unwrap();
        let p2 = append_session(&dir, &sample("2026-06-20T11:00:00+02:00")).unwrap();
        assert_eq!(p1, p2, "same month -> same file");

        let content = fs::read_to_string(&p1).unwrap();
        let list: Vec<Session> = serde_json::from_str(&content).unwrap();
        assert_eq!(list.len(), 2, "second session must be appended, not overwrite");

        // A different month lands in a different file.
        let p3 = append_session(&dir, &sample("2026-07-01T09:00:00+02:00")).unwrap();
        assert_ne!(p1, p3);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn append_backs_up_corrupt_file() {
        let dir = std::env::temp_dir().join(format!("pomeroy_corrupt_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let filename = "202606_pomeroy.json";
        fs::write(dir.join(filename), "{ not valid json ]").unwrap();

        append_session(&dir, &sample("2026-06-20T10:00:00+02:00")).unwrap();

        assert!(dir.join(format!("{filename}.bak")).exists(), "corrupt file backed up");
        let content = fs::read_to_string(dir.join(filename)).unwrap();
        let list: Vec<Session> = serde_json::from_str(&content).unwrap();
        assert_eq!(list.len(), 1);

        let _ = fs::remove_dir_all(&dir);
    }
}
