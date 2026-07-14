export interface ImageInfo {
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ExifEntry {
  label: string;
  value: string;
}

export interface LoadedImage {
  b64: string;
  width: number;
  height: number;
  origWidth: number;
  origHeight: number;
}

export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  primary: boolean;
}

export interface WindowInfo {
  id: number;
  title: string;
  app: string;
}

export interface CaptureEntry {
  path: string;
  createdMs: number;
}

export interface Settings {
  theme: "light" | "dark";
  /** Atalho global de captura ("" = desligado). */
  shortcut: string;
  /** Esconder a janela do app antes de capturar a tela. */
  hideSelf: boolean;
  /** Iniciar com o sistema (abre oculto na bandeja). */
  autostart: boolean;
}

export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "avif",
];

// Vídeos entram na navegação da pasta, mas o LocalImage não os decodifica —
// abre no app padrão do sistema (mantém a fronteira com o LocalMedia).
export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "m2ts",
  "ts",
];

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(extOf(path));
}

export function isVideoPath(path: string): boolean {
  return VIDEO_EXTENSIONS.includes(extOf(path));
}

export function isMediaPath(path: string): boolean {
  return isImagePath(path) || isVideoPath(path);
}

export function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function dirName(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

export function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(".", ",")} ${units[u]}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
