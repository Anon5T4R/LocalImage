//! Captura de tela via xcap (Windows/X11; no Wayland vai pelos portais do
//! sistema). As capturas caem em `app_data/captures` e abrem direto no
//! anotador. Região = capturar a tela e recortar no editor (robusto em
//! qualquer plataforma — sem overlay nativo).

use std::path::PathBuf;

use tauri::Manager;
use xcap::{Monitor, Window};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    id: u32,
    name: String,
    width: u32,
    height: u32,
    primary: bool,
}

#[tauri::command(async)]
pub fn monitors_list() -> Result<Vec<MonitorInfo>, String> {
    let monitors = Monitor::all().map_err(|e| format!("listar telas: {}", e))?;
    let mut out = Vec::new();
    for m in monitors {
        out.push(MonitorInfo {
            id: m.id().unwrap_or(0),
            name: m.name().unwrap_or_else(|_| "Tela".into()),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
            primary: m.is_primary().unwrap_or(false),
        });
    }
    Ok(out)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    id: u32,
    title: String,
    app: String,
}

#[tauri::command(async)]
pub fn windows_list() -> Result<Vec<WindowInfo>, String> {
    let windows = Window::all().map_err(|e| format!("listar janelas: {}", e))?;
    let mut out = Vec::new();
    for w in windows {
        let title = w.title().unwrap_or_default();
        if title.trim().is_empty() || w.is_minimized().unwrap_or(false) {
            continue;
        }
        // A própria janela do LocalImage não interessa.
        if title == "LocalImage" {
            continue;
        }
        out.push(WindowInfo {
            id: w.id().unwrap_or(0),
            title,
            app: w.app_name().unwrap_or_default(),
        });
    }
    Ok(out)
}

fn captures_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data indisponível: {}", e))?
        .join("captures");
    std::fs::create_dir_all(&dir).map_err(|e| format!("criar pasta de capturas: {}", e))?;
    Ok(dir)
}

fn capture_name() -> String {
    // Sem chrono de propósito (dependência a menos): data local via time do SO.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("Captura {}.png", now)
}

fn save_rgba(app: &tauri::AppHandle, img: image::RgbaImage) -> Result<String, String> {
    let path = captures_dir(app)?.join(capture_name());
    img.save(&path).map_err(|e| format!("salvar captura: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

/// Captura uma tela inteira. `hide_self` esconde a janela do app antes (pra
/// captura não sair com o próprio LocalImage na frente).
#[tauri::command(async)]
pub fn capture_monitor(
    app: tauri::AppHandle,
    id: u32,
    hide_self: bool,
) -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| format!("listar telas: {}", e))?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.id().unwrap_or(0) == id)
        .ok_or("tela não encontrada")?;

    let win = app.get_webview_window("main");
    if hide_self {
        if let Some(w) = &win {
            let _ = w.hide();
        }
        std::thread::sleep(std::time::Duration::from_millis(350));
    }
    let shot = monitor.capture_image();
    if hide_self {
        if let Some(w) = &win {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    let img = shot.map_err(|e| format!("capturar: {}", e))?;
    save_rgba(&app, img)
}

/// Captura uma janela específica.
#[tauri::command(async)]
pub fn capture_window(app: tauri::AppHandle, id: u32) -> Result<String, String> {
    let windows = Window::all().map_err(|e| format!("listar janelas: {}", e))?;
    let window = windows
        .into_iter()
        .find(|w| w.id().unwrap_or(0) == id)
        .ok_or("janela não encontrada (fechou?)")?;
    let img = window.capture_image().map_err(|e| format!("capturar: {}", e))?;
    save_rgba(&app, img)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureEntry {
    path: String,
    created_ms: i64,
}

/// Histórico: as capturas guardadas em app_data/captures, mais novas primeiro.
#[tauri::command(async)]
pub fn captures_list(app: tauri::AppHandle) -> Result<Vec<CaptureEntry>, String> {
    let dir = captures_dir(&app)?;
    let mut out: Vec<CaptureEntry> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("png") {
                return None;
            }
            let created = e
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            Some(CaptureEntry { path: path.to_string_lossy().to_string(), created_ms: created })
        })
        .collect();
    out.sort_by_key(|c| -c.created_ms);
    Ok(out)
}
