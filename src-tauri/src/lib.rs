mod capture;
mod img;

use std::path::Path;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Arg que o autostart passa pra abrir o app oculto (só na bandeja).
const HIDDEN_ARGS: [&str; 2] = ["--hidden", "--minimized"];

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

/// Liga/desliga o "iniciar com o sistema" (registro Run no Windows).
#[tauri::command(async)]
fn autostart_set(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    let m = app.autolaunch();
    if enable {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

/// Estado atual do "iniciar com o sistema" (fonte da verdade = o SO).
#[tauri::command(async)]
fn autostart_is_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
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
        // single-instance primeiro: um 2º launch ("abrir com" numa imagem, ou
        // clicar o exe com o app já na bandeja) encaminha o caminho e reabre.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            open_main(app);
        }))
        // Autostart abre oculto (só bandeja) — daí o argumento --hidden.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
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
        .setup(|app| {
            // Bandeja: menu (Abrir · Capturar · Sair), clique esquerdo reabre.
            let open_i = MenuItem::with_id(app, "open", "Abrir LocalImage", true, None::<&str>)?;
            let capture_i = MenuItem::with_id(app, "capture", "Capturar tela", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &capture_i, &quit_i])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("LocalImage")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_main(app),
                    "capture" => {
                        let _ = app.emit("capture-shortcut", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        open_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Lançado pelo autostart? Começa escondido na bandeja.
            let hidden = std::env::args().any(|a| HIDDEN_ARGS.contains(&a.as_str()));
            if hidden {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        // Fechar (X) esconde na bandeja em vez de encerrar — o processo segue
        // vivo pro atalho global funcionar. Sair de verdade é pelo menu da bandeja.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_file,
            shortcut_set,
            autostart_set,
            autostart_is_enabled,
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
