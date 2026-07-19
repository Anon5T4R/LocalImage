import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (padrão da suíte — ver `docs/planos/padrao-apps.md`). O `pt`
 * é a fonte da verdade das chaves; `en`/`es` como `Record<MessageKey,string>`
 * fazem o compilador recusar chave faltando/sobrando. Locale num store externo
 * (não React) pra `t()` rodar fora de componente (toasts do store); o App
 * remonta com key={locale} no `main.tsx`.
 */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const LOCALE_KEY = "localimage.locale";

const pt = {
  "common.imagesFilter": "Imagens",
  "common.or": "ou",

  "app.dropHere": "Solte a imagem aqui",
  "app.dropNothing": "Nada reconhecido nos itens soltos.",

  "topbar.home": "Início",
  "topbar.capture": "Capturar",
  "topbar.themeLight": "Tema claro",
  "topbar.themeDark": "Tema escuro",
  "topbar.settings": "Configurações",

  "home.openImageTitle": "Abrir imagem",
  "home.openFolderTitle": "Abrir pasta de imagens",
  "home.heroTitle": "Veja, anote e capture — sem abrir editor pesado",
  "home.heroSub":
    "Arraste uma imagem pra cá, abra uma pasta ou capture a tela. Tudo local; qualquer export remove o EXIF.",
  "home.openImage": "Abrir imagem",
  "home.openImageHint": "png, jpg, webp, gif, bmp, tiff… As setas navegam a pasta.",
  "home.openFolder": "Abrir pasta",
  "home.openFolderHint": "Visualiza a pasta inteira com tira de miniaturas.",
  "home.captureScreen": "Capturar tela",
  "home.captureHint": "A captura abre direto no anotador (seta, tarja, texto, recorte…).",
  "home.globalShortcutLabel": "Atalho global:",
  "home.fullScreen": "Tela inteira",
  "home.oneWindow": "Uma janela",
  "home.batchHint": "Redimensione/converta/comprima vários arquivos de uma vez (PNG/JPG).",
  "home.chooseFiles": "Escolher arquivos…",
  "home.recentCaptures": "Capturas recentes",
  "home.deleteCapture": "Excluir captura",

  "viewer.openVideoFailed": "Não consegui abrir o vídeo: {e}",
  "viewer.video": "vídeo",
  "viewer.openInPlayerTitle": "Abrir no player padrão (Enter)",
  "viewer.openVideo": "Abrir vídeo",
  "viewer.zoomOut": "Menos zoom (-)",
  "viewer.zoomIn": "Mais zoom (+)",
  "viewer.fit": "Ajustar (0)",
  "viewer.fitLabel": "Ajustar",
  "viewer.actualSize": "Tamanho real (1)",
  "viewer.rotate": "Girar a visualização (o export gira no editor)",
  "viewer.fullscreen": "Tela cheia (F)",
  "viewer.immersive": "Papel de parede — tela cheia, só a imagem (←/→ navegam, Esc sai)",
  "viewer.wallpaperFit": "Ajuste da imagem (M alterna)",
  "viewer.fitFree": "Livre (zoom e arrasto)",
  "viewer.fitCover": "Preencher",
  "viewer.fitContain": "Ajustar",
  "viewer.fitStretch": "Esticar (distorce)",
  "viewer.fitCenter": "Centralizar",
  "viewer.fitTile": "Lado a lado",
  "viewer.exifTitle": "Metadados EXIF (I)",
  "viewer.convert": "Converter",
  "viewer.annotateTitle": "Anotar (E)",
  "viewer.annotate": "Anotar",
  "viewer.trashConfirm": "Lixeira?",
  "viewer.no": "Não",
  "viewer.delete": "Excluir (Del)",
  "viewer.videoPlaceholderHint":
    "O LocalImage não reproduz vídeo — ele abre no player padrão do sistema.",
  "viewer.exifPanelTitle": "Metadados (EXIF)",
  "viewer.exifEmpty": "Sem EXIF nesta imagem.",
  "viewer.exifNote": "Qualquer export do LocalImage remove o EXIF.",
  "viewer.immersiveExit": "Sair do modo imersivo (Esc)",

  "wpick.title": "Capturar janela",
  "wpick.empty": "Nenhuma janela visível encontrada.",

  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.themeNature": "Natureza",
  "settings.themeDarkBlue": "Azul escuro",
  "settings.themeCalmGreen": "Verde calmo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.shortcutLabel": "Atalho global de captura",
  "settings.pressKeys": "Pressione as teclas…",
  "settings.recordShortcut": "Gravar atalho",
  "settings.turnOff": "Desligar",
  "settings.off": "desligado",
  "settings.orPreset": "Ou escolha um pronto",
  "settings.disabled": "Desligado",
  "settings.custom": "Personalizado…",
  "settings.orType": "Ou digite/cole",
  "settings.shortcutPlaceholder": "ex.: Ctrl+Shift+X",
  "settings.apply": "Aplicar",
  "settings.hideSelfLabel": "Esconder o app na captura",
  "settings.hideSelfHint": "a janela do LocalImage some antes do clique da captura de tela",
  "settings.autostartLabel": "Iniciar com o sistema",
  "settings.autostartHint": "abre junto com o login, oculto na bandeja — o atalho já fica valendo",
  "settings.help1a":
    "Fechar a janela (X) manda o app pra bandeja pro atalho continuar funcionando; para encerrar de vez, use",
  "settings.trayExit": "Sair",
  "settings.help1b": "no ícone da bandeja.",
  "settings.help2a": "O mais fácil é",
  "settings.help2b":
    "e apertar a combinação (ex.: Ctrl+Shift+X); Esc cancela a gravação. Se preferir digitar, o formato é",
  "settings.help2ModKey": "Modificador+Tecla",
  "settings.help2c": "(Ctrl, Alt, Shift, Super) — ex.:",
  "settings.help2d":
    ". O atalho global é opt-in de propósito — desligado, o app não registra nada no sistema.",

  "editor.tool.crop": "Recortar",
  "editor.tool.arrow": "Seta",
  "editor.tool.rect": "Caixa",
  "editor.tool.highlight": "Realce",
  "editor.tool.redact": "Tarja",
  "editor.tool.pen": "Desenho livre",
  "editor.tool.text": "Texto",
  "editor.tool.step": "Passo numerado",
  "editor.stroke": "Espessura",
  "editor.saveTitle": "Salvar imagem",
  "editor.saved": "Salvo: {out}",
  "editor.encodeFailed": "falha ao encodar a imagem",
  "editor.encodeFailedCopy": "falha ao encodar",
  "editor.copied": "Imagem copiada.",
  "editor.clipboardUnavailable": "Clipboard de imagem indisponível — use Salvar como.",
  "editor.back": "Voltar",
  "editor.discardConfirm": "Descartar anotações?",
  "editor.undo": "Desfazer",
  "editor.redo": "Refazer",
  "editor.clearCrop": "Limpar recorte",
  "editor.copy": "Copiar",
  "editor.savePng": "Salvar PNG",
  "editor.loading": "Carregando…",
  "editor.textPlaceholder": "Digite e Enter",

  "convert.saveAsTitle": "Salvar como",
  "convert.decodeFailed": "decodificar",
  "convert.encodeWebpFailed": "encodar WebP",
  "convert.saved": "Salvo: {name}",
  "convert.title": "Converter — {name}",
  "convert.format": "Formato",
  "convert.quality": "Qualidade",
  "convert.maxWidth": "Largura máxima",
  "convert.original": "Original",
  "convert.exifNote":
    "O export re-encoda a imagem — metadados EXIF (GPS, câmera, data) são removidos.",
  "convert.converting": "Convertendo…",
  "convert.convert": "Converter…",

  "batch.pickTitle": "Escolher imagens",
  "batch.done": "{ok} de {total} convertida(s), ao lado dos originais.",
  "batch.title": "Converter em lote",
  "batch.files": "Arquivos",
  "batch.choose": "Escolher…",
  "batch.noneChosen": "nenhum escolhido",
  "batch.imageCount": "{n} imagem(ns)",
  "batch.converting": "Convertendo {i}/{total}…",
  "batch.convertN": "Converter {n} imagem(ns)",

  "store.noImages": "Nenhuma imagem nesta pasta.",
  "store.trashed": "Enviado pra lixeira.",
  "store.noScreen": "Nenhuma tela encontrada.",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "common.imagesFilter": "Images",
  "common.or": "or",

  "app.dropHere": "Drop the image here",
  "app.dropNothing": "Nothing recognized in the dropped items.",

  "topbar.home": "Home",
  "topbar.capture": "Capture",
  "topbar.themeLight": "Light theme",
  "topbar.themeDark": "Dark theme",
  "topbar.settings": "Settings",

  "home.openImageTitle": "Open image",
  "home.openFolderTitle": "Open image folder",
  "home.heroTitle": "View, annotate and capture — no heavy editor",
  "home.heroSub":
    "Drag an image here, open a folder or capture the screen. All local; every export strips EXIF.",
  "home.openImage": "Open image",
  "home.openImageHint": "png, jpg, webp, gif, bmp, tiff… Arrow keys browse the folder.",
  "home.openFolder": "Open folder",
  "home.openFolderHint": "Browse the whole folder with a thumbnail strip.",
  "home.captureScreen": "Capture screen",
  "home.captureHint": "The capture opens straight in the annotator (arrow, redaction, text, crop…).",
  "home.globalShortcutLabel": "Global shortcut:",
  "home.fullScreen": "Full screen",
  "home.oneWindow": "One window",
  "home.batchHint": "Resize/convert/compress many files at once (PNG/JPG).",
  "home.chooseFiles": "Choose files…",
  "home.recentCaptures": "Recent captures",
  "home.deleteCapture": "Delete capture",

  "viewer.openVideoFailed": "Couldn't open the video: {e}",
  "viewer.video": "video",
  "viewer.openInPlayerTitle": "Open in default player (Enter)",
  "viewer.openVideo": "Open video",
  "viewer.zoomOut": "Zoom out (-)",
  "viewer.zoomIn": "Zoom in (+)",
  "viewer.fit": "Fit (0)",
  "viewer.fitLabel": "Fit",
  "viewer.actualSize": "Actual size (1)",
  "viewer.rotate": "Rotate the view (export rotates in the editor)",
  "viewer.fullscreen": "Fullscreen (F)",
  "viewer.immersive": "Wallpaper — fullscreen, image only (←/→ browse, Esc exits)",
  "viewer.wallpaperFit": "Image fit (M cycles)",
  "viewer.fitFree": "Free (zoom and drag)",
  "viewer.fitCover": "Fill",
  "viewer.fitContain": "Fit",
  "viewer.fitStretch": "Stretch (distorts)",
  "viewer.fitCenter": "Center",
  "viewer.fitTile": "Tile",
  "viewer.exifTitle": "EXIF metadata (I)",
  "viewer.convert": "Convert",
  "viewer.annotateTitle": "Annotate (E)",
  "viewer.annotate": "Annotate",
  "viewer.trashConfirm": "Trash?",
  "viewer.no": "No",
  "viewer.delete": "Delete (Del)",
  "viewer.videoPlaceholderHint":
    "LocalImage doesn't play video — it opens in the system's default player.",
  "viewer.exifPanelTitle": "Metadata (EXIF)",
  "viewer.exifEmpty": "No EXIF in this image.",
  "viewer.exifNote": "Any LocalImage export strips EXIF.",
  "viewer.immersiveExit": "Exit immersive mode (Esc)",

  "wpick.title": "Capture window",
  "wpick.empty": "No visible window found.",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeNature": "Nature",
  "settings.themeDarkBlue": "Dark blue",
  "settings.themeCalmGreen": "Calm green",
  "settings.themePastelPink": "Pastel pink",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Language",
  "settings.shortcutLabel": "Global capture shortcut",
  "settings.pressKeys": "Press the keys…",
  "settings.recordShortcut": "Record shortcut",
  "settings.turnOff": "Turn off",
  "settings.off": "off",
  "settings.orPreset": "Or pick a preset",
  "settings.disabled": "Disabled",
  "settings.custom": "Custom…",
  "settings.orType": "Or type/paste",
  "settings.shortcutPlaceholder": "e.g. Ctrl+Shift+X",
  "settings.apply": "Apply",
  "settings.hideSelfLabel": "Hide the app during capture",
  "settings.hideSelfHint": "the LocalImage window disappears before the screen capture click",
  "settings.autostartLabel": "Start with the system",
  "settings.autostartHint": "opens at login, hidden in the tray — the shortcut is active right away",
  "settings.help1a":
    "Closing the window (X) sends the app to the tray so the shortcut keeps working; to quit for good, use",
  "settings.trayExit": "Quit",
  "settings.help1b": "in the tray icon.",
  "settings.help2a": "The easiest way is",
  "settings.help2b":
    "and press the combo (e.g. Ctrl+Shift+X); Esc cancels recording. If you'd rather type it, the format is",
  "settings.help2ModKey": "Modifier+Key",
  "settings.help2c": "(Ctrl, Alt, Shift, Super) — e.g.",
  "settings.help2d":
    ". The global shortcut is opt-in on purpose — off, the app registers nothing with the system.",

  "editor.tool.crop": "Crop",
  "editor.tool.arrow": "Arrow",
  "editor.tool.rect": "Box",
  "editor.tool.highlight": "Highlight",
  "editor.tool.redact": "Redact",
  "editor.tool.pen": "Free draw",
  "editor.tool.text": "Text",
  "editor.tool.step": "Numbered step",
  "editor.stroke": "Thickness",
  "editor.saveTitle": "Save image",
  "editor.saved": "Saved: {out}",
  "editor.encodeFailed": "failed to encode the image",
  "editor.encodeFailedCopy": "failed to encode",
  "editor.copied": "Image copied.",
  "editor.clipboardUnavailable": "Image clipboard unavailable — use Save as.",
  "editor.back": "Back",
  "editor.discardConfirm": "Discard annotations?",
  "editor.undo": "Undo",
  "editor.redo": "Redo",
  "editor.clearCrop": "Clear crop",
  "editor.copy": "Copy",
  "editor.savePng": "Save PNG",
  "editor.loading": "Loading…",
  "editor.textPlaceholder": "Type and Enter",

  "convert.saveAsTitle": "Save as",
  "convert.decodeFailed": "decode",
  "convert.encodeWebpFailed": "encode WebP",
  "convert.saved": "Saved: {name}",
  "convert.title": "Convert — {name}",
  "convert.format": "Format",
  "convert.quality": "Quality",
  "convert.maxWidth": "Max width",
  "convert.original": "Original",
  "convert.exifNote":
    "Export re-encodes the image — EXIF metadata (GPS, camera, date) is removed.",
  "convert.converting": "Converting…",
  "convert.convert": "Convert…",

  "batch.pickTitle": "Choose images",
  "batch.done": "{ok} of {total} converted, next to the originals.",
  "batch.title": "Batch convert",
  "batch.files": "Files",
  "batch.choose": "Choose…",
  "batch.noneChosen": "none chosen",
  "batch.imageCount": "{n} image(s)",
  "batch.converting": "Converting {i}/{total}…",
  "batch.convertN": "Convert {n} image(s)",

  "store.noImages": "No images in this folder.",
  "store.trashed": "Moved to trash.",
  "store.noScreen": "No screen found.",
};

const es: Record<MessageKey, string> = {
  "common.imagesFilter": "Imágenes",
  "common.or": "o",

  "app.dropHere": "Suelta la imagen aquí",
  "app.dropNothing": "No se reconoció nada en los elementos soltados.",

  "topbar.home": "Inicio",
  "topbar.capture": "Capturar",
  "topbar.themeLight": "Tema claro",
  "topbar.themeDark": "Tema oscuro",
  "topbar.settings": "Configuración",

  "home.openImageTitle": "Abrir imagen",
  "home.openFolderTitle": "Abrir carpeta de imágenes",
  "home.heroTitle": "Ve, anota y captura — sin abrir un editor pesado",
  "home.heroSub":
    "Arrastra una imagen aquí, abre una carpeta o captura la pantalla. Todo local; cada exportación elimina el EXIF.",
  "home.openImage": "Abrir imagen",
  "home.openImageHint": "png, jpg, webp, gif, bmp, tiff… Las flechas navegan la carpeta.",
  "home.openFolder": "Abrir carpeta",
  "home.openFolderHint": "Visualiza toda la carpeta con tira de miniaturas.",
  "home.captureScreen": "Capturar pantalla",
  "home.captureHint": "La captura se abre directo en el anotador (flecha, censura, texto, recorte…).",
  "home.globalShortcutLabel": "Atajo global:",
  "home.fullScreen": "Pantalla completa",
  "home.oneWindow": "Una ventana",
  "home.batchHint": "Redimensiona/convierte/comprime varios archivos a la vez (PNG/JPG).",
  "home.chooseFiles": "Elegir archivos…",
  "home.recentCaptures": "Capturas recientes",
  "home.deleteCapture": "Eliminar captura",

  "viewer.openVideoFailed": "No se pudo abrir el vídeo: {e}",
  "viewer.video": "vídeo",
  "viewer.openInPlayerTitle": "Abrir en el reproductor predeterminado (Enter)",
  "viewer.openVideo": "Abrir vídeo",
  "viewer.zoomOut": "Menos zoom (-)",
  "viewer.zoomIn": "Más zoom (+)",
  "viewer.fit": "Ajustar (0)",
  "viewer.fitLabel": "Ajustar",
  "viewer.actualSize": "Tamaño real (1)",
  "viewer.rotate": "Girar la vista (la exportación gira en el editor)",
  "viewer.fullscreen": "Pantalla completa (F)",
  "viewer.immersive": "Fondo de pantalla — pantalla completa, solo la imagen (←/→ navegan, Esc sale)",
  "viewer.wallpaperFit": "Ajuste de la imagen (M alterna)",
  "viewer.fitFree": "Libre (zoom y arrastre)",
  "viewer.fitCover": "Rellenar",
  "viewer.fitContain": "Ajustar",
  "viewer.fitStretch": "Estirar (distorsiona)",
  "viewer.fitCenter": "Centrar",
  "viewer.fitTile": "Mosaico",
  "viewer.exifTitle": "Metadatos EXIF (I)",
  "viewer.convert": "Convertir",
  "viewer.annotateTitle": "Anotar (E)",
  "viewer.annotate": "Anotar",
  "viewer.trashConfirm": "¿Papelera?",
  "viewer.no": "No",
  "viewer.delete": "Eliminar (Supr)",
  "viewer.videoPlaceholderHint":
    "LocalImage no reproduce vídeo — lo abre en el reproductor predeterminado del sistema.",
  "viewer.exifPanelTitle": "Metadatos (EXIF)",
  "viewer.exifEmpty": "Sin EXIF en esta imagen.",
  "viewer.exifNote": "Cualquier exportación de LocalImage elimina el EXIF.",
  "viewer.immersiveExit": "Salir del modo inmersivo (Esc)",

  "wpick.title": "Capturar ventana",
  "wpick.empty": "No se encontró ninguna ventana visible.",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.themeNature": "Naturaleza",
  "settings.themeDarkBlue": "Azul oscuro",
  "settings.themeCalmGreen": "Verde tranquilo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.shortcutLabel": "Atajo global de captura",
  "settings.pressKeys": "Pulsa las teclas…",
  "settings.recordShortcut": "Grabar atajo",
  "settings.turnOff": "Desactivar",
  "settings.off": "desactivado",
  "settings.orPreset": "O elige uno predefinido",
  "settings.disabled": "Desactivado",
  "settings.custom": "Personalizado…",
  "settings.orType": "O escribe/pega",
  "settings.shortcutPlaceholder": "ej.: Ctrl+Shift+X",
  "settings.apply": "Aplicar",
  "settings.hideSelfLabel": "Ocultar la app durante la captura",
  "settings.hideSelfHint": "la ventana de LocalImage desaparece antes del clic de captura de pantalla",
  "settings.autostartLabel": "Iniciar con el sistema",
  "settings.autostartHint":
    "se abre al iniciar sesión, oculto en la bandeja — el atajo queda activo enseguida",
  "settings.help1a":
    "Cerrar la ventana (X) envía la app a la bandeja para que el atajo siga funcionando; para salir del todo, usa",
  "settings.trayExit": "Salir",
  "settings.help1b": "en el icono de la bandeja.",
  "settings.help2a": "Lo más fácil es",
  "settings.help2b":
    "y pulsar la combinación (ej.: Ctrl+Shift+X); Esc cancela la grabación. Si prefieres escribirlo, el formato es",
  "settings.help2ModKey": "Modificador+Tecla",
  "settings.help2c": "(Ctrl, Alt, Shift, Super) — ej.:",
  "settings.help2d":
    ". El atajo global es opt-in a propósito — desactivado, la app no registra nada en el sistema.",

  "editor.tool.crop": "Recortar",
  "editor.tool.arrow": "Flecha",
  "editor.tool.rect": "Caja",
  "editor.tool.highlight": "Resaltado",
  "editor.tool.redact": "Censura",
  "editor.tool.pen": "Dibujo libre",
  "editor.tool.text": "Texto",
  "editor.tool.step": "Paso numerado",
  "editor.stroke": "Grosor",
  "editor.saveTitle": "Guardar imagen",
  "editor.saved": "Guardado: {out}",
  "editor.encodeFailed": "no se pudo codificar la imagen",
  "editor.encodeFailedCopy": "no se pudo codificar",
  "editor.copied": "Imagen copiada.",
  "editor.clipboardUnavailable": "Portapapeles de imagen no disponible — usa Guardar como.",
  "editor.back": "Volver",
  "editor.discardConfirm": "¿Descartar anotaciones?",
  "editor.undo": "Deshacer",
  "editor.redo": "Rehacer",
  "editor.clearCrop": "Limpiar recorte",
  "editor.copy": "Copiar",
  "editor.savePng": "Guardar PNG",
  "editor.loading": "Cargando…",
  "editor.textPlaceholder": "Escribe y Enter",

  "convert.saveAsTitle": "Guardar como",
  "convert.decodeFailed": "decodificar",
  "convert.encodeWebpFailed": "codificar WebP",
  "convert.saved": "Guardado: {name}",
  "convert.title": "Convertir — {name}",
  "convert.format": "Formato",
  "convert.quality": "Calidad",
  "convert.maxWidth": "Ancho máximo",
  "convert.original": "Original",
  "convert.exifNote":
    "La exportación recodifica la imagen — los metadatos EXIF (GPS, cámara, fecha) se eliminan.",
  "convert.converting": "Convirtiendo…",
  "convert.convert": "Convertir…",

  "batch.pickTitle": "Elegir imágenes",
  "batch.done": "{ok} de {total} convertida(s), junto a los originales.",
  "batch.title": "Convertir por lotes",
  "batch.files": "Archivos",
  "batch.choose": "Elegir…",
  "batch.noneChosen": "ninguno elegido",
  "batch.imageCount": "{n} imagen(es)",
  "batch.converting": "Convirtiendo {i}/{total}…",
  "batch.convertN": "Convertir {n} imagen(es)",

  "store.noImages": "No hay imágenes en esta carpeta.",
  "store.trashed": "Enviado a la papelera.",
  "store.noScreen": "No se encontró ninguna pantalla.",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
