use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

struct BackendChild(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendChild(Mutex::new(None)))
        .setup(|app| {
            if let Ok(cmd) = app.shell().sidecar("sane-backend") {
                if let Ok((_rx, child)) = cmd.spawn() {
                    *app.state::<BackendChild>().0.lock().unwrap() = Some(child);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let handle = window.app_handle().clone();
                let child = handle.state::<BackendChild>().0.lock().unwrap().take();
                if let Some(c) = child {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
