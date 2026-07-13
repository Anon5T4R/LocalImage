import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fileName, fmtDate, IMAGE_EXTENSIONS } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function HomeView() {
  const openPath = useStore((s) => s.openPath);
  const captures = useStore((s) => s.captures);
  const captureScreen = useStore((s) => s.captureScreen);
  const openEditor = useStore((s) => s.openEditor);
  const deleteCapture = useStore((s) => s.deleteCapture);
  const settings = useStore((s) => s.settings);
  const setWindowPickOpen = useUi((s) => s.setWindowPickOpen);
  const setBatchOpen = useUi((s) => s.setBatchOpen);

  async function pickImage() {
    const picked = await open({
      title: "Abrir imagem",
      filters: [{ name: "Imagens", extensions: IMAGE_EXTENSIONS }],
    }).catch(() => null);
    if (typeof picked === "string" && picked) void openPath(picked);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, title: "Abrir pasta de imagens" }).catch(
      () => null,
    );
    if (typeof picked === "string" && picked) void openPath(picked);
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>Veja, anote e capture — sem abrir editor pesado</h1>
        <p className="home-sub">
          Arraste uma imagem pra cá, abra uma pasta ou capture a tela. Tudo local; qualquer
          export remove o EXIF.
        </p>
      </div>

      <div className="home-cards">
        <div className="card drop-card" onClick={pickImage}>
          <div className="drop-icon">🖼</div>
          <div className="card-title">Abrir imagem</div>
          <p className="card-hint">png, jpg, webp, gif, bmp, tiff… As setas navegam a pasta.</p>
        </div>
        <div className="card drop-card" onClick={pickFolder}>
          <div className="drop-icon">📁</div>
          <div className="card-title">Abrir pasta</div>
          <p className="card-hint">Visualiza a pasta inteira com tira de miniaturas.</p>
        </div>
        <div className="card">
          <div className="card-title">Capturar tela</div>
          <p className="card-hint">
            A captura abre direto no anotador (seta, tarja, texto, recorte…).
            {settings.shortcut && (
              <>
                {" "}
                Atalho global: <b>{settings.shortcut}</b>.
              </>
            )}
          </p>
          <div className="capture-actions">
            <button className="btn primary" onClick={() => void captureScreen()}>
              ⛶ Tela inteira
            </button>
            <button className="btn" onClick={() => setWindowPickOpen(true)}>
              ▣ Uma janela
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Converter em lote</div>
          <p className="card-hint">
            Redimensione/converta/comprima vários arquivos de uma vez (PNG/JPG).
          </p>
          <button className="btn" onClick={() => setBatchOpen(true)}>
            Escolher arquivos…
          </button>
        </div>
      </div>

      {captures.length > 0 && (
        <div className="captures">
          <h2>Capturas recentes</h2>
          <div className="captures-grid">
            {captures.slice(0, 12).map((c) => (
              <div key={c.path} className="capture-card">
                <img
                  src={convertFileSrc(c.path)}
                  alt=""
                  loading="lazy"
                  onClick={() => openEditor(c.path)}
                  title={fileName(c.path)}
                />
                <div className="capture-meta">
                  <span>{fmtDate(c.createdMs)}</span>
                  <button
                    className="lib-item-del"
                    title="Excluir captura"
                    onClick={() => void deleteCapture(c.path)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
