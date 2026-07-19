import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { useLocale } from "./lib/i18n";
import * as ocr from "./lib/ocr";
import { useStore } from "./state/store";

// Ponte de DEV (nunca em produção): acesso aos stores pra dirigir o GUI em
// testes sem o runtime Tauri (mesmo padrão do __lp do LocalPaint).
// O `ocr` entra aqui porque a parte do OCR que só o webview exercita — worker,
// core WASM e traineddata servidos de /tesseract via HTTP — não tem como ser
// coberta pelo vitest (node) nem pelo modal (que depende do load via Rust).
if (import.meta.env.DEV) {
  (globalThis as unknown as Record<string, unknown>).__li = { store: useStore, ocr };
}

// Remonta a árvore ao trocar de idioma (todo t() é reavaliado no novo locale).
function Root() {
  const locale = useLocale();
  return <App key={locale} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
