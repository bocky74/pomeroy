mod models;
mod storage;
mod timer;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};

use timer::TimerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(TimerState::default())
        .invoke_handler(tauri::generate_handler![
            storage::get_config,
            storage::save_config,
            storage::save_session,
            timer::start_session,
            timer::stop_session,
            timer::get_pending_session,
            timer::is_running,
        ])
        .setup(|app| {
            // System tray with a small menu: Show / Stop / Quit.
            let show = MenuItem::with_id(app, "show", "Show Pomeroy", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop session", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &stop, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pomeroy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => timer::raise_window(app),
                    "stop" => {
                        let state = app.state::<TimerState>();
                        timer::stop_session(app.clone(), state);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click the tray icon to reveal the window.
                    use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        timer::raise_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // While a session is running, closing the window only hides it to
            // the tray so the timer keeps going in the background.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let running = app.state::<TimerState>().0.lock().unwrap().running;
                if running {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Pomeroy");
}
