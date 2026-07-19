#!/usr/bin/env bash
# Monta public/tesseract (gitignored): worker+core do node_modules e os idiomas
# por/eng do tessdata_fast. O vite empacota public/ no dist → OCR 100% offline.
set -euo pipefail

# ---------------------------------------------------------------------------
# COMMIT FIXO + SHA256 (2026-07-18) — ver o comentário no fetch-tessdata.ps1.
#
# Era `tessdata_fast/raw/main/` — o HEAD de um BRANCH, o pior caso da suíte:
# qualquer commit no branch mudava o que entrava no app na hora, sem release
# nenhuma no meio. Agora commit imutável + sha256 por arquivo.
# PRA ATUALIZAR: trocar as constantes aqui E no .ps1, sempre no MESMO commit.
# ---------------------------------------------------------------------------
TD_COMMIT="87416418657359cb625c412a48b6e1d6d41c29bd"
TD_SHA_POR="c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb"
TD_SHA_ENG="7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/public/tesseract"
mkdir -p "$dest/lang" "$dest/core"

# Só as variantes LSTM (o tesseract.js usa OEM LSTM_ONLY; as "full" dobram o tamanho)
cp "$root/node_modules/tesseract.js/dist/worker.min.js" "$dest/"

# ---------------------------------------------------------------------------
# SÓ OS `.wasm.js` (2026-07-19) — ver o comentário longo no fetch-tessdata.ps1.
#
# Resumo: o core publica `X.js`+`X.wasm` (arquivo separado) E `X.wasm.js` (mesmo
# módulo em base64 — NÃO é asm.js). O getCore.js do tesseract.js, com corePath
# de diretório, só monta nome terminado em `.wasm.js`; a outra forma nunca é
# pedida. As 3 variantes `.wasm.js` ficam porque a escolha relaxedsimd/simd/
# plana é feita em runtime por wasm-feature-detect.
# ---------------------------------------------------------------------------
cp "$root"/node_modules/tesseract.js-core/tesseract-core*lstm*.wasm.js "$dest/core/"

# Higiene: instalação antiga deixou os .wasm/.js soltos em public/ (gitignored,
# então `git clean` não pega) e eles seguiriam entrando no dist.
find "$dest/core" -name 'tesseract-core*' ! -name '*.wasm.js' -delete

for l in por eng; do
  out="$dest/lang/$l.traineddata"
  if [ -f "$out" ]; then echo "$l.traineddata já existe"; continue; fi

  case "$l" in
    por) want="$TD_SHA_POR" ;;
    eng) want="$TD_SHA_ENG" ;;
  esac

  echo "Baixando $l.traineddata ..."
  curl -fsSL --retry 3 --retry-delay 2 \
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$TD_COMMIT/$l.traineddata" \
    -o "$out.tmp"

  # Confere ANTES de mover pro destino: modelo adulterado não vira asset do app.
  got=$(sha256sum "$out.tmp" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    rm -f "$out.tmp"
    echo "SHA256 NAO BATE em $l.traineddata!" >&2
    echo "  esperado: $want" >&2
    echo "  recebido: $got" >&2
    echo "Download corrompido ou adulterado. Nada foi instalado." >&2
    exit 1
  fi
  mv "$out.tmp" "$out"
  echo "  sha256 conferido: $got"
done
echo "OCR assets em $dest"
