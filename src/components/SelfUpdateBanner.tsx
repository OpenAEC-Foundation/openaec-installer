import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { DownloadProgress } from "../lib/api";
import "./SelfUpdateBanner.css";

interface SelfUpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
  pageUrl?: string | null;
  canInstall: boolean;
  busy?: boolean;
  progress?: DownloadProgress;
  error?: string;
  note?: string;
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Melding dat er een nieuwere versie van de OpenAEC Installer zelf is.
 * Volgt het alert-patroon uit het stijlboek: zachte amber-tint met een amber
 * randlijn links — amber wordt nooit als vol achtergrondvlak gebruikt.
 */
export default function SelfUpdateBanner({
  currentVersion,
  latestVersion,
  pageUrl,
  canInstall,
  busy,
  progress,
  error,
  note,
  onUpdate,
  onDismiss,
}: SelfUpdateBannerProps) {
  const { t } = useTranslation();

  const downloading = !!progress && !progress.done;
  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <div className="self-update" role="status">
      <div className="self-update-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>

      <div className="self-update-body">
        <p className="self-update-title">{t("selfUpdate.available")}</p>
        <p className="self-update-text">
          {t("selfUpdate.description", { current: currentVersion, latest: latestVersion })}
        </p>

        {downloading && (
          <div className="self-update-progress" role="progressbar" aria-valuenow={pct ?? undefined}>
            <div className="self-update-progress-track">
              <div
                className={`self-update-progress-fill${pct === null ? " indeterminate" : ""}`}
                style={pct !== null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <span className="self-update-progress-label">
              {t("actions.downloading")} {pct !== null ? `${pct}%` : ""}
            </span>
          </div>
        )}

        {error && <p className="self-update-error">{error}</p>}
        {!error && !downloading && note && <p className="self-update-note">{note}</p>}
        {!error && !downloading && !note && !canInstall && (
          <p className="self-update-note">{t("selfUpdate.noInstaller")}</p>
        )}
      </div>

      <div className="self-update-actions">
        {pageUrl && (
          <button
            className="self-update-link"
            onClick={() => openUrl(pageUrl).catch(() => {})}
          >
            {t("selfUpdate.notes")}
          </button>
        )}
        {canInstall && (
          <button className="btn btn-primary" disabled={busy} onClick={onUpdate}>
            {busy ? t("actions.downloading") : t("selfUpdate.update")}
          </button>
        )}
        <button
          className="self-update-dismiss"
          onClick={onDismiss}
          title={t("selfUpdate.dismiss")}
          aria-label={t("selfUpdate.dismiss")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
