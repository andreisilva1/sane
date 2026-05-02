use tauri_plugin_shell::ShellExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Spawn the Go backend sidecar.
            // In dev mode, run `go run ./backend` manually in a separate terminal.
            // In release, the binary is bundled automatically.
            if let Ok(sidecar) = app.shell().sidecar("sane-backend") {
                let _ = sidecar.spawn();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
