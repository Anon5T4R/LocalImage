import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { t } from "../lib/i18n";
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
      title: t("home.openImageTitle"),
      filters: [{ name: t("common.imagesFilter"), extensions: IMAGE_EXTENSIONS }],
    }).catch(() => null);
    if (typeof picked === "string" && picked) void openPath(picked);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, title: t("home.openFolderTitle") }).catch(
      () => null,
    );
    if (typeof picked === "string" && picked) void openPath(picked);
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>{t("home.heroTitle")}</h1>
        <p className="home-sub">{t("home.heroSub")}</p>
      </div>

      <div className="home-cards">
        <div className="card drop-card" onClick={pickImage}>
          <div className="drop-icon">🖼</div>
          <div className="card-title">{t("home.openImage")}</div>
          <p className="card-hint">{t("home.openImageHint")}</p>
        </div>
        <div className="card drop-card" onClick={pickFolder}>
          <div className="drop-icon">📁</div>
          <div className="card-title">{t("home.openFolder")}</div>
          <p className="card-hint">{t("home.openFolderHint")}</p>
        </div>
        <div className="card">
          <div className="card-title">{t("home.captureScreen")}</div>
          <p className="card-hint">
            {t("home.captureHint")}
            {settings.shortcut && (
              <>
                {" "}
                {t("home.globalShortcutLabel")} <b>{settings.shortcut}</b>.
              </>
            )}
          </p>
          <div className="capture-actions">
            <button className="btn primary" onClick={() => void captureScreen()}>
              ⛶ {t("home.fullScreen")}
            </button>
            <button className="btn" onClick={() => setWindowPickOpen(true)}>
              ▣ {t("home.oneWindow")}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t("batch.title")}</div>
          <p className="card-hint">{t("home.batchHint")}</p>
          <button className="btn" onClick={() => setBatchOpen(true)}>
            {t("home.chooseFiles")}
          </button>
        </div>
      </div>

      {captures.length > 0 && (
        <div className="captures">
          <h2>{t("home.recentCaptures")}</h2>
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
                    title={t("home.deleteCapture")}
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
