# Monta public/tesseract (gitignored): worker+core copiados do node_modules e
# os idiomas por/eng baixados do tessdata_fast. O vite empacota public/ no dist,
# então o OCR fica 100% offline no app final.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/fetch-tessdata.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# COMMIT FIXO + SHA256 (2026-07-18)
#
# Era `tessdata_fast/raw/main/...` — o HEAD de um BRANCH. Era o pior caso de
# toda a suíte: pior que uma tag `latest` (que ao menos aponta pra uma release
# publicada), porque qualquer commit no branch mudava o que entrava no app, na
# hora, sem release nenhuma no meio.
#
# Agora: commit fixo (imutável) + sha256 por arquivo. Modelo de OCR trocado sem
# aviso muda o RESULTADO do reconhecimento nos documentos do usuário.
#
# PRA ATUALIZAR: pegar o commit novo em
# github.com/tesseract-ocr/tessdata_fast/commits/main, baixar os .traineddata
# daquele commit, rodar `sha256sum` e trocar as constantes aqui e no
# `fetch-tessdata.sh`.
# ---------------------------------------------------------------------------
$tdCommit = "87416418657359cb625c412a48b6e1d6d41c29bd"
$tdSha256 = @{
    "por" = "c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb"
    "eng" = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
}

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "public\tesseract"
$lang = Join-Path $dest "lang"
$core = Join-Path $dest "core"
New-Item -ItemType Directory -Force -Path $lang | Out-Null
New-Item -ItemType Directory -Force -Path $core | Out-Null

# Só as variantes LSTM (o tesseract.js usa OEM LSTM_ONLY; as "full" dobram o tamanho)
Copy-Item (Join-Path $root "node_modules\tesseract.js\dist\worker.min.js") $dest -Force
Copy-Item (Join-Path $root "node_modules\tesseract.js-core\tesseract-core*lstm*") $core -Force

foreach ($l in @("por", "eng")) {
    $out = Join-Path $lang "$l.traineddata"
    if (Test-Path $out) { Write-Host "$l.traineddata já existe"; continue }
    $url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$tdCommit/$l.traineddata"
    Write-Host "Baixando $l.traineddata ..."
    $tmp = Join-Path $env:TEMP "$l.traineddata.tmp"
    Invoke-WebRequest -Uri $url -OutFile $tmp

    # Confere ANTES de mover pro destino: modelo adulterado não vira asset do app.
    $got = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $tdSha256[$l]) {
        Remove-Item $tmp -Force
        throw "SHA256 NAO BATE em $l.traineddata!`n  esperado: $($tdSha256[$l])`n  recebido: $got`nDownload corrompido ou adulterado. Nada foi instalado."
    }
    Move-Item $tmp $out -Force
    Write-Host "  sha256 conferido: $got"
}
Write-Host "OCR assets em $dest"
