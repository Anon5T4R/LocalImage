# LocalImage

**Visualizador, anotador e captura de tela 100% offline.** Ver imagem rápido, anotar
screenshot (seta, tarja, texto) e converter/redimensionar sem abrir editor pesado — o combo
ShareX/Flameshot, local e em português.

Parte da suíte **Local/Taylor** de aplicativos offline-first. Instale pelo
[TaylorHub](https://github.com/Anon5T4R/TaylorHub) ou baixe o instalador na
[última release](https://github.com/Anon5T4R/LocalImage/releases/latest).

## O que ele faz

- **Visualizador rápido**: abra um arquivo e navegue a pasta com ← →, tira de miniaturas,
  zoom por passos (Ctrl+roda), ajustar/100%, pan por arrasto, tela cheia, girar a exibição.
  TIFF e formatos que o webview não mostra caem num decodificador Rust automaticamente.
- **Anotador de screenshot**: seta, caixa, realce, tarja (censura), texto com contorno,
  desenho à mão, **passos numerados** ①②③ e **recorte**. Undo/redo, copiar pro clipboard,
  salvar PNG/JPG/WebP. As anotações queimam em resolução nativa.
- **Captura de tela**: tela inteira (escondendo o app) ou uma janela específica — cai
  direto no anotador. Histórico de capturas na tela inicial. **Atalho global opcional**
  (desligado por padrão, configurável).
- **Converter/redimensionar/comprimir**: PNG/JPG/WebP/BMP/TIFF/GIF com qualidade e largura
  máxima; **lote** pra várias imagens de uma vez.
- **EXIF**: painel com câmera, data, GPS… e **privacidade por construção** — qualquer
  export re-encoda a imagem e o EXIF não sobrevive.
- **Excluir = lixeira do sistema**, nunca delete permanente.

## Atalhos

`← →` navegar · `+ −` zoom · `0` ajustar · `1` 100% · `F` tela cheia · `E` anotar ·
`I` EXIF · `Del` lixeira · no editor: `Ctrl+Z/Y` desfazer/refazer · `Esc` limpar recorte.

## Desenvolvimento

Stack: Tauri 2 + React 19 + Vite + TypeScript (front) e Rust (back) — crates `image`,
`kamadak-exif`, `xcap`, `trash`. Porta dev **1448**. Sem sidecar e sem IA de propósito.

```bash
npm install
npm run tauri dev
npm test          # vitest (front); cargo test roda no CI
```

Release: bump de versão em `package.json` + `src-tauri/tauri.conf.json` +
`src-tauri/Cargo.toml`, tag `vX.Y.Z`, push — o GitHub Actions builda (Windows NSIS + Linux
AppImage) e publica.

> **Associação de arquivos:** de propósito, o instalador NÃO registra associação de
> imagens (ninguém gosta de app que rouba o visualizador padrão). No Wayland a captura
> usa os portais do sistema — pode pedir permissão na primeira vez.

## Licença

[MIT](LICENSE).
