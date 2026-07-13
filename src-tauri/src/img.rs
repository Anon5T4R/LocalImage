//! Operações de imagem em Rust puro (crate `image`): navegação de pasta,
//! decode universal (fallback pro que o webview não mostra, ex.: TIFF),
//! conversão/redimensionamento/compressão e EXIF (kamadak-exif).
//!
//! Privacidade por construção: qualquer export re-encoda a imagem — EXIF
//! (GPS, câmera, data) NUNCA sobrevive a um export do LocalImage.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::Engine;
use image::ImageFormat;

pub const IMAGE_EXTS: &[&str] =
    &["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "ico", "avif"];

/// Vídeos entram na navegação (pra não sumirem do meio da pasta), mas o
/// LocalImage não os decodifica — só abre no app padrão do sistema.
pub const VIDEO_EXTS: &[&str] =
    &["mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv", "mpg", "mpeg", "m2ts", "ts"];

fn has_ext(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_image(path: &Path) -> bool {
    has_ext(path, IMAGE_EXTS)
}

fn is_video(path: &Path) -> bool {
    has_ext(path, VIDEO_EXTS)
}

/// Lista imagens e vídeos da pasta (ordenados sem diferenciar maiúsculas) — é a
/// sequência das setas ←/→ do visualizador. Vídeos ficam na lista pra não
/// sumirem do meio da pasta; o front os abre no app padrão do sistema.
#[tauri::command(async)]
pub fn list_dir(dir: String) -> Result<Vec<String>, String> {
    let base = PathBuf::from(&dir);
    let entries = std::fs::read_dir(&base).map_err(|e| format!("abrir pasta: {}", e))?;
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && (is_image(p) || is_video(p)))
        .collect();
    files.sort_by_key(|p| {
        p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default()
    });
    Ok(files.into_iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    width: u32,
    height: u32,
    size_bytes: u64,
}

/// Dimensões + tamanho sem decodificar a imagem inteira.
#[tauri::command(async)]
pub fn image_info(path: String) -> Result<ImageInfo, String> {
    let (width, height) =
        image::image_dimensions(&path).map_err(|e| format!("ler cabeçalho: {}", e))?;
    let size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(ImageInfo { width, height, size_bytes })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifEntry {
    label: String,
    value: String,
}

/// Metadados EXIF legíveis (vazio se a imagem não tiver).
#[tauri::command(async)]
pub fn exif_info(path: String) -> Vec<ExifEntry> {
    let labels: &[(exif::Tag, &str)] = &[
        (exif::Tag::Make, "Fabricante"),
        (exif::Tag::Model, "Câmera"),
        (exif::Tag::LensModel, "Lente"),
        (exif::Tag::DateTimeOriginal, "Data da foto"),
        (exif::Tag::ExposureTime, "Exposição"),
        (exif::Tag::FNumber, "Abertura"),
        (exif::Tag::PhotographicSensitivity, "ISO"),
        (exif::Tag::FocalLength, "Distância focal"),
        (exif::Tag::Flash, "Flash"),
        (exif::Tag::Orientation, "Orientação"),
        (exif::Tag::Software, "Software"),
        (exif::Tag::GPSLatitude, "GPS latitude"),
        (exif::Tag::GPSLongitude, "GPS longitude"),
    ];
    let Ok(file) = std::fs::File::open(&path) else { return Vec::new() };
    let mut reader = std::io::BufReader::new(file);
    let Ok(ex) = exif::Reader::new().read_from_container(&mut reader) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (tag, label) in labels {
        if let Some(field) = ex.get_field(*tag, exif::In::PRIMARY) {
            out.push(ExifEntry {
                label: label.to_string(),
                value: field.display_value().with_unit(&ex).to_string(),
            });
        }
    }
    out
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedImage {
    b64: String,
    width: u32,
    height: u32,
    orig_width: u32,
    orig_height: u32,
}

/// Decodifica QUALQUER formato suportado e devolve PNG base64 — usado pelo
/// editor (data: URL nunca "suja" o canvas) e como fallback do visualizador
/// pra formatos que o webview não mostra. `max_dim` limita o lado maior
/// (0 = tamanho original).
#[tauri::command(async)]
pub fn load_png_base64(path: String, max_dim: u32) -> Result<LoadedImage, String> {
    let img = image::open(&path).map_err(|e| format!("decodificar: {}", e))?;
    let (ow, oh) = (img.width(), img.height());
    let img = if max_dim > 0 && ow.max(oh) > max_dim {
        img.resize(max_dim, max_dim, image::imageops::FilterType::Triangle)
    } else {
        img
    };
    let (w, h) = (img.width(), img.height());
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png).map_err(|e| format!("encodar PNG: {}", e))?;
    Ok(LoadedImage {
        b64: base64::engine::general_purpose::STANDARD.encode(buf.into_inner()),
        width: w,
        height: h,
        orig_width: ow,
        orig_height: oh,
    })
}

fn parse_format(format: &str) -> Result<ImageFormat, String> {
    match format {
        "png" => Ok(ImageFormat::Png),
        "jpeg" | "jpg" => Ok(ImageFormat::Jpeg),
        "bmp" => Ok(ImageFormat::Bmp),
        "tiff" => Ok(ImageFormat::Tiff),
        "gif" => Ok(ImageFormat::Gif),
        other => Err(format!("formato de saída não suportado: {}", other)),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    width: u32,
    height: u32,
    size_bytes: u64,
}

/// Converte/redimensiona/comprime via crate `image` (o caminho sem anotações
/// e o do lote). EXIF é descartado por construção.
#[tauri::command(async)]
pub fn convert_image(
    input: String,
    out: String,
    format: String,
    quality: u8,
    max_width: u32,
) -> Result<ConvertResult, String> {
    let fmt = parse_format(&format)?;
    let img = image::open(&input).map_err(|e| format!("decodificar: {}", e))?;
    let img = if max_width > 0 && img.width() > max_width {
        img.resize(max_width, u32::MAX, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    if let Some(parent) = Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("criar pasta: {}", e))?;
    }
    match fmt {
        ImageFormat::Jpeg => {
            // JPEG não tem alfa; achata e aplica a qualidade pedida.
            let rgb = img.to_rgb8();
            let file = std::fs::File::create(&out).map_err(|e| format!("criar arquivo: {}", e))?;
            let writer = std::io::BufWriter::new(file);
            let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(
                writer,
                quality.clamp(1, 100),
            );
            rgb.write_with_encoder(enc).map_err(|e| format!("encodar JPEG: {}", e))?;
        }
        _ => {
            img.save_with_format(&out, fmt).map_err(|e| format!("salvar: {}", e))?;
        }
    }
    let size_bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
    Ok(ConvertResult { width: img.width(), height: img.height(), size_bytes })
}

/// Excluir manda pra LIXEIRA do SO — nunca delete permanente.
#[tauri::command(async)]
pub fn delete_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("mandar pra lixeira: {}", e))
}

/// Grava bytes base64 (exports do canvas do editor).
#[tauri::command(async)]
pub fn write_file_base64(path: String, base64_data: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("base64 inválido: {}", e))?;
    std::fs::write(&path, bytes).map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}

/// Caminho livre: acrescenta " (n)" antes da extensão até não colidir.
#[tauri::command(async)]
pub fn unique_path(path: String) -> String {
    unique_path_impl(&path, |p| Path::new(p).exists())
}

fn unique_path_impl(path: &str, exists: impl Fn(&str) -> bool) -> String {
    if !exists(path) {
        return path.to_string();
    }
    let p = Path::new(path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("imagem");
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    for n in 1..1000 {
        let name = if ext.is_empty() {
            format!("{} ({})", stem, n)
        } else {
            format!("{} ({}).{}", stem, n, ext)
        };
        let candidate = dir.join(name);
        let s = candidate.to_string_lossy().to_string();
        if !exists(&s) {
            return s;
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "localimage-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn convert_redimensiona_e_encoda_jpeg() {
        let dir = temp_dir();
        let src = dir.join("in.png");
        // 400×200 com gradiente (garante conteúdo real).
        let img = image::RgbaImage::from_fn(400, 200, |x, y| {
            image::Rgba([(x % 256) as u8, (y % 256) as u8, 128, 255])
        });
        img.save(&src).unwrap();

        let out = dir.join("out.jpg");
        let res = convert_image(
            src.to_string_lossy().to_string(),
            out.to_string_lossy().to_string(),
            "jpeg".into(),
            80,
            200,
        )
        .unwrap();
        assert_eq!(res.width, 200);
        assert_eq!(res.height, 100);
        assert!(res.size_bytes > 0);
        let (w, h) = image::image_dimensions(&out).unwrap();
        assert_eq!((w, h), (200, 100));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_filtra_e_ordena() {
        let dir = temp_dir();
        for name in ["b.PNG", "a.jpg", "notas.txt", "c.webp", "d.MP4"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        let got = list_dir(dir.to_string_lossy().to_string()).unwrap();
        let names: Vec<String> = got
            .iter()
            .map(|p| Path::new(p).file_name().unwrap().to_string_lossy().to_lowercase())
            .collect();
        // Vídeo (d.mp4) entra na lista; .txt fica de fora.
        assert_eq!(names, vec!["a.jpg", "b.png", "c.webp", "d.mp4"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unique_path_incrementa() {
        let taken = ["C:/i/a.png", "C:/i/a (1).png"];
        let got = unique_path_impl("C:/i/a.png", |p| taken.contains(&p.replace('\\', "/").as_str()));
        assert_eq!(got.replace('\\', "/"), "C:/i/a (2).png");
    }

    #[test]
    fn formato_invalido_da_erro() {
        assert!(parse_format("exr").is_err());
        assert!(parse_format("png").is_ok());
    }
}
