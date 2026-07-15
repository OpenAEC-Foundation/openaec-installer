import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogTool } from "../data/catalog";
import type { DownloadProgress, InstalledTool, ReleaseInfo } from "../lib/api";
import type { ToolStatus } from "../lib/status";
import CategoryIcon from "./CategoryIcon";
import "./ToolCard.css";

interface ToolCardProps {
  tool: CatalogTool;
  status: ToolStatus;
  installed?: InstalledTool;
  release?: ReleaseInfo;
  progress?: DownloadProgress;
  busy?: boolean;
  error?: string;
  note?: string;
  onInstall?: (tool: CatalogTool) => void;
  onLaunch?: (tool: CatalogTool) => void;
}

function statusBadge(status: ToolStatus): { className: string; labelKey: string } {
  switch (status) {
    case "installed_latest":
    case "installed_unknown":
      return { className: "badge badge-success", labelKey: "status.installed" };
    case "update_available":
      return { className: "badge badge-update", labelKey: "status.updateAvailable" };
    case "web_only":
      return { className: "badge badge-info", labelKey: "status.web" };
    default:
      return { className: "badge badge-muted", labelKey: "status.notInstalled" };
  }
}

export default function ToolCard({
  tool,
  status,
  installed,
  release,
  progress,
  busy,
  error,
  note,
  onInstall,
  onLaunch,
}: ToolCardProps) {
  const { t, i18n } = useTranslation();
  const [previewFailed, setPreviewFailed] = useState(false);
  const lang = i18n.language?.startsWith("en") ? "en" : "nl";
  const badge = statusBadge(status);

  const latestVersion = release?.ok ? release.version : null;
  const canInstall =
    tool.kind === "desktop" &&
    !!release?.assetUrl &&
    (status === "not_installed" || status === "update_available");
  const canLaunch = !!installed?.exePath;
  const downloading = !!progress && !progress.done;
  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const releaseError = (() => {
    if (tool.kind !== "desktop") return null;
    if (release && !release.ok) {
      // Bij de GitHub-limiet is "wanneer kan het weer" veel nuttiger dan
      // "probeer later opnieuw".
      if (release.error === "rate_limited" && release.rateLimitReset) {
        return t("errors.rateLimitedUntil", {
          time: new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(
            new Date(release.rateLimitReset * 1000),
          ),
        });
      }
      return t([`errors.${release.error}`, "errors.network"]);
    }
    if (release?.ok && !release.assetUrl) return t("errors.noInstaller");
    return null;
  })();

  const open = (url?: string) => {
    if (url) openUrl(url).catch(() => {});
  };

  // Lokaal gebundelde previewafbeelding (screenshot van open-aec.com);
  // valt terug op het categorie-icoon als er geen afbeelding is of laden faalt.
  const previewUrl = tool.preview ?? null;

  // Snelkoppeling op de preview: de tool bekijken of gebruiken — bewust nooit
  // installeren (dat blijft een expliciete knop, zodat een klik geen ongewenste
  // download start). Geïnstalleerd → starten; anders → web-demo/productpagina.
  const openTarget =
    tool.webUrl ?? tool.siteUrl ?? (tool.repo ? `https://github.com/${tool.repo}` : undefined);
  const shortcut = (() => {
    if (tool.kind !== "web" && canLaunch) {
      return { kind: "launch" as const, label: t("actions.launch"), run: () => onLaunch?.(tool) };
    }
    if (openTarget) {
      return { kind: "open" as const, label: t("actions.open"), run: () => open(openTarget) };
    }
    return null;
  })();

  return (
    <article className={`tool-card${status === "update_available" ? " update" : ""}`}>
      <button
        type="button"
        className="tool-preview"
        onClick={() => shortcut?.run()}
        disabled={!shortcut}
        title={shortcut?.label}
        aria-label={shortcut ? `${tool.name} — ${shortcut.label}` : tool.name}
      >
        <div className="tool-preview-fallback">
          <CategoryIcon category={tool.category} size={46} />
        </div>
        {previewUrl && !previewFailed && (
          <img
            className="tool-preview-img"
            src={previewUrl}
            loading="lazy"
            alt=""
            onError={() => setPreviewFailed(true)}
          />
        )}
        {shortcut && (
          <div className="tool-preview-overlay">
            <span className="tool-preview-action">
              {shortcut.kind === "launch" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              )}
              {shortcut.label}
            </span>
          </div>
        )}
      </button>

      <div className="tool-card-head">
        <div className="tool-icon">
          <CategoryIcon category={tool.category} size={22} />
        </div>
        <div className="tool-card-titles">
          <h3 className="tool-name">{tool.name}</h3>
          <div className="tool-meta">
            <span className="tool-category">{t(`categories.${tool.category}`)}</span>
            {tool.community && <span className="tool-community">{t("community")}</span>}
          </div>
        </div>
        <span className={badge.className}>{t(badge.labelKey)}</span>
      </div>

      <p className="tool-desc">{tool.description[lang]}</p>

      {tool.kind === "desktop" && (
        <div className="tool-versions">
          {installed?.version && (
            <span title={t("versions.installed")}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              v{installed.version}
            </span>
          )}
          {installed?.version && latestVersion && <span className="tool-versions-arrow">→</span>}
          {latestVersion && (
            <span title={t("versions.latest")} className={status === "update_available" ? "latest-highlight" : ""}>
              v{latestVersion}
            </span>
          )}
          {!installed?.version && !latestVersion && <span>—</span>}
        </div>
      )}

      {downloading && (
        <div className="tool-progress" role="progressbar" aria-valuenow={pct ?? undefined}>
          <div className="tool-progress-track">
            <div
              className={`tool-progress-fill${pct === null ? " indeterminate" : ""}`}
              style={pct !== null ? { width: `${pct}%` } : undefined}
            />
          </div>
          <span className="tool-progress-label">
            {t("actions.downloading")} {pct !== null ? `${pct}%` : ""}
          </span>
        </div>
      )}

      {error && <p className="tool-error">{error}</p>}
      {!error && !downloading && note && <p className="tool-note">{note}</p>}
      {!error && !downloading && !note && releaseError && (
        <p className="tool-hint">{releaseError}</p>
      )}

      <div className="tool-actions">
        {tool.kind === "web" ? (
          <button className="btn btn-primary" onClick={() => open(tool.webUrl)}>
            {t("actions.openWeb")}
          </button>
        ) : (
          <>
            {canInstall && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => onInstall?.(tool)}
              >
                {busy
                  ? t("actions.downloading")
                  : status === "update_available"
                    ? t("actions.update")
                    : t("actions.install")}
              </button>
            )}
            {canLaunch && (
              <button
                className={`btn ${canInstall ? "btn-secondary" : "btn-primary"}`}
                onClick={() => onLaunch?.(tool)}
              >
                {t("actions.launch")}
              </button>
            )}
          </>
        )}

        <div className="tool-links">
          {tool.repo && (
            <button
              className="icon-btn"
              title={t("actions.github")}
              aria-label={t("actions.github")}
              onClick={() => open(`https://github.com/${tool.repo}`)}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </button>
          )}
          {tool.kind === "desktop" && (tool.webUrl || tool.siteUrl) && (
            <button
              className="icon-btn"
              title={t("actions.website")}
              aria-label={t("actions.website")}
              onClick={() => open(tool.webUrl ?? tool.siteUrl)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
