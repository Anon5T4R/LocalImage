// Wrappers dos comandos Rust (Tauri v2: chaves camelCase no invoke).

import { invoke } from "@tauri-apps/api/core";
import type {
  CaptureEntry,
  ExifEntry,
  ImageInfo,
  LoadedImage,
  MonitorInfo,
  WindowInfo,
} from "./types";

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function cmd<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri()) return Promise.reject(new Error(`fora do Tauri: ${name}`));
  return invoke<T>(name, args);
}

export const getStartupFile = () => cmd<string | null>("get_startup_file");
export const listDir = (dir: string) => cmd<string[]>("list_dir", { dir });
export const imageInfo = (path: string) => cmd<ImageInfo>("image_info", { path });
export const exifInfo = (path: string) => cmd<ExifEntry[]>("exif_info", { path });
export const loadPngBase64 = (path: string, maxDim: number) =>
  cmd<LoadedImage>("load_png_base64", { path, maxDim });
export const convertImage = (
  input: string,
  out: string,
  format: string,
  quality: number,
  maxWidth: number,
) => cmd<{ width: number; height: number; sizeBytes: number }>("convert_image", {
  input,
  out,
  format,
  quality,
  maxWidth,
});
export const deleteToTrash = (path: string) => cmd<void>("delete_to_trash", { path });
export const writeFileBase64 = (path: string, base64Data: string) =>
  cmd<void>("write_file_base64", { path, base64Data });
export const uniquePath = (path: string) => cmd<string>("unique_path", { path });
export const shortcutSet = (accel: string) => cmd<void>("shortcut_set", { accel });

export const monitorsList = () => cmd<MonitorInfo[]>("monitors_list");
export const windowsList = () => cmd<WindowInfo[]>("windows_list");
export const captureMonitor = (id: number, hideSelf: boolean) =>
  cmd<string>("capture_monitor", { id, hideSelf });
export const captureWindow = (id: number) => cmd<string>("capture_window", { id });
export const capturesList = () => cmd<CaptureEntry[]>("captures_list");
