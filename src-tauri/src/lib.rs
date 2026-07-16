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
        // Apaga antes de gravar pra uma entrada obsoleta (caminho antigo) não
        // sobreviver. É `let _` de propósito: o `disable()` do auto-launch dá
        // erro quando não há nada pra apagar, que é justamente o caso comum.
        let _ = m.disable();
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

// --- estado do autostart no SO ---
//
// A intenção do usuário mora no store do front (`settings.autostart` no
// localStorage) — o app não tem banco. O registro do Windows é só o efeito, e um
// efeito que se perde sozinho: o `is_enabled()` do plugin só checa se a entrada
// em `...\CurrentVersion\Run` EXISTE, nunca se ela aponta pro exe atual. Se a
// entrada some (instalador/limpador) ou envelhece (o exe mudou de lugar e ela
// segue apontando pro antigo), o app para de subir no logon — calado, com a
// checkbox marcada.
//
// Por isso este comando não devolve um bool "ligado?", e sim o que o SO tem hoje
// do ponto de vista de "precisa consertar?". Quem decide é o front, que é onde a
// intenção mora (ver `reconcileAutostart` em src/state/store.ts).

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum OsAutostart {
    /// Entrada presente e apontando pro exe atual — nada a fazer.
    Ok,
    /// Ausente ou apontando pro caminho errado (instalação antiga/movida) —
    /// é o caso a reimpor.
    Broken,
    /// O usuário desligou pelo Gerenciador de Tarefas do Windows. É uma escolha
    /// explícita dele, na UI oficial do SO: obedecemos e desmarcamos a checkbox.
    UserDisabled,
}

/// Espelha o formato que o `auto-launch` grava: `"<exe> <args>"`, sem aspas.
#[cfg(windows)]
fn os_autostart(app: &tauri::AppHandle) -> OsAutostart {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const RUN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    let name = &app.package_info().name;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Override do Gerenciador de Tarefas: 12 bytes = flag (DWORD) + FILETIME de
    // quando foi desligado. No flag, o bit 0 ligado = desabilitado (2/6 ligado,
    // 3/7 desligado); quando habilitado, o timestamp fica zerado. Checamos os
    // dois: o auto-launch só olha o timestamp, o que não enxerga um flag
    // desligado com timestamp zerado.
    let approved_off = hkcu
        .open_subkey_with_flags(APPROVED, KEY_READ)
        .ok()
        .and_then(|k| k.get_raw_value(name).ok())
        .map(|v| {
            let b = &v.bytes;
            let flag_off = b.first().map(|f| f & 1 != 0).unwrap_or(false);
            let stamped_off = b.len() >= 12 && !b[4..12].iter().all(|x| *x == 0);
            flag_off || stamped_off
        })
        .unwrap_or(false);
    if approved_off {
        return OsAutostart::UserDisabled;
    }

    let current = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    // Só "--hidden": é o que o plugin foi configurado pra gravar (o
    // "--minimized" do HIDDEN_ARGS é aceito na entrada, mas nunca escrito aqui).
    let expected = format!("{current} --hidden");

    match hkcu
        .open_subkey_with_flags(RUN, KEY_READ)
        .ok()
        .and_then(|k| k.get_value::<String, _>(name).ok())
    {
        Some(v) if v.trim().eq_ignore_ascii_case(expected.trim()) => OsAutostart::Ok,
        _ => OsAutostart::Broken,
    }
}

/// Fora do Windows não há registro pra envelhecer: o `is_enabled()` basta.
#[cfg(not(windows))]
fn os_autostart(app: &tauri::AppHandle) -> OsAutostart {
    if app.autolaunch().is_enabled().unwrap_or(false) {
        OsAutostart::Ok
    } else {
        OsAutostart::Broken
    }
}

/// O que o SO tem hoje. O front cruza isso com a intenção guardada.
#[tauri::command(async)]
fn autostart_os_state(app: tauri::AppHandle) -> OsAutostart {
    os_autostart(&app)
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
            autostart_os_state,
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
