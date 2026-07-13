mod capture;
mod img;

use std::path::Path;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Caminho passado no launch ("Abrir com" numa imagem), se houver.
#[tauri::command(async)]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// (Re)define o atalho global de captura. Vazio = desliga. O disparo chega no
/// front pelo evento `capture-shortcut`.
#[tauri::command(async)]
fn shortcut_set(app: tauri::AppHandle, accel: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    if !accel.trim().is_empty() {
        gs.register(accel.as_str())
            .map_err(|e| format!("atalho '{}' inválido ou em uso: {}", accel, e))?;
    }
    Ok(())
}

fn open_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance primeiro: um 2º launch ("abrir com" numa imagem)
        // encaminha o caminho pra janela viva.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            open_main(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("capture-shortcut", ());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_startup_file,
            shortcut_set,
            img::list_dir,
            img::image_info,
            img::exif_info,
            img::load_png_base64,
            img::convert_image,
            img::delete_to_trash,
            img::write_file_base64,
            img::unique_path,
            capture::monitors_list,
            capture::windows_list,
            capture::capture_monitor,
            capture::capture_window,
            capture::captures_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
