use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use chrono::{Local, SecondsFormat};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

/// A session that has finished and is awaiting the user's project/task choice.
#[derive(Serialize, Clone, Debug)]
pub struct PendingSession {
    pub start: String,
    pub end: String,
    #[serde(rename = "durationMinutes")]
    pub duration_minutes: u32,
}

#[derive(Default)]
pub struct TimerInner {
    pub running: bool,
    /// Bumped on every start/stop; the worker thread aborts if it no longer matches.
    pub generation: u64,
    pub pending: Option<PendingSession>,
}

/// Managed Tauri state holding the timer's authoritative status.
pub struct TimerState(pub Mutex<TimerInner>);

impl Default for TimerState {
    fn default() -> Self {
        TimerState(Mutex::new(TimerInner::default()))
    }
}

#[derive(Serialize, Clone)]
struct TickPayload {
    remaining: u32,
    total: u32,
    running: bool,
}

fn fmt_mmss(secs: u32) -> String {
    format!("{:02}:{:02}", secs / 60, secs % 60)
}

fn set_tray(app: &AppHandle, text: Option<String>) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(text.clone());
        let tooltip = match text {
            Some(t) => format!("Pomeroy — {t}"),
            None => "Pomeroy".to_string(),
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Bring the main window to the foreground (used when a session completes).
pub fn raise_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        // Briefly pin on top so it reliably jumps in front, then release.
        let _ = window.set_always_on_top(true);
        let _ = window.set_always_on_top(false);
    }
}

fn notify_complete(app: &AppHandle) {
    let _ = app
        .notification()
        .builder()
        .title("Pomeroy")
        .body("Session complete — choose the project and tasks it counted toward.")
        .show();
}

// ----------------------------------------------------------------------------
// Tauri commands
// ----------------------------------------------------------------------------

/// Start a focus session of `minutes` length. The countdown is owned by Rust
/// so it keeps running reliably even when the WebView is hidden/throttled.
#[tauri::command]
pub fn start_session(app: AppHandle, state: State<TimerState>, minutes: u32) {
    let minutes = if minutes == 0 { 25 } else { minutes };
    let start = Local::now();

    let generation = {
        let mut inner = state.0.lock().unwrap();
        inner.generation += 1;
        inner.running = true;
        inner.generation
    };

    let total_secs = minutes * 60;
    let app = app.clone();

    thread::spawn(move || {
        let started_at = Instant::now();
        loop {
            // Abort immediately if a newer start/stop superseded us.
            {
                let st = app.state::<TimerState>();
                if st.0.lock().unwrap().generation != generation {
                    return;
                }
            }

            let elapsed = started_at.elapsed().as_secs() as u32;
            let remaining = total_secs.saturating_sub(elapsed);

            let _ = app.emit(
                "tick",
                TickPayload {
                    remaining,
                    total: total_secs,
                    running: true,
                },
            );
            set_tray(&app, Some(fmt_mmss(remaining)));

            if remaining == 0 {
                break;
            }
            thread::sleep(Duration::from_secs(1));
        }

        // Session completed naturally. Record it as pending and surface the UI.
        let end = Local::now();
        let pending = PendingSession {
            start: start.to_rfc3339_opts(SecondsFormat::Secs, false),
            end: end.to_rfc3339_opts(SecondsFormat::Secs, false),
            duration_minutes: minutes,
        };

        {
            let st = app.state::<TimerState>();
            let mut inner = st.0.lock().unwrap();
            // Guard against a stop that landed in the final second.
            if inner.generation != generation {
                return;
            }
            inner.running = false;
            inner.pending = Some(pending);
        }

        set_tray(&app, None);
        notify_complete(&app);
        raise_window(&app);
        let _ = app.emit("session-finished", ());
    });
}

/// Cancel a running session. Per the design, a manual stop does NOT log a
/// session — only a natural completion does.
#[tauri::command]
pub fn stop_session(app: AppHandle, state: State<TimerState>) {
    {
        let mut inner = state.0.lock().unwrap();
        inner.generation += 1; // invalidates the worker thread
        inner.running = false;
    }
    set_tray(&app, None);
    let _ = app.emit("session-stopped", ());
}

#[tauri::command]
pub fn get_pending_session(state: State<TimerState>) -> Option<PendingSession> {
    state.0.lock().unwrap().pending.clone()
}

#[tauri::command]
pub fn is_running(state: State<TimerState>) -> bool {
    state.0.lock().unwrap().running
}
