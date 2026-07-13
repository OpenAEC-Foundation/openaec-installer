import { useTranslation } from "react-i18next";
import "./StatusBar.css";

interface StatusBarProps {
  installedCount: number;
  totalDesktop: number;
  updateCount: number;
  lastRefresh: Date | null;
  refreshing: boolean;
}

export default function StatusBar({
  installedCount,
  totalDesktop,
  updateCount,
  lastRefresh,
  refreshing,
}: StatusBarProps) {
  const { t, i18n } = useTranslation();

  const refreshLabel = refreshing
    ? t("refreshing")
    : lastRefresh
      ? `${t("statusbar.lastRefresh")}: ${new Intl.DateTimeFormat(i18n.language, {
          timeStyle: "short",
        }).format(lastRefresh)}`
      : t("statusbar.never");

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-item-value">{installedCount}/{totalDesktop}</span>
          <span className="status-item-label">{t("statusbar.installed")}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-value">{updateCount}</span>
          <span className="status-item-label">{t("statusbar.updates")}</span>
        </div>
      </div>

      <div className="status-bar-center">
        <span className="status-item-label" style={{ fontSize: "11px" }}>
          OpenAEC Foundation — open-aec.com
        </span>
      </div>

      <div className="status-bar-right">
        <div className="status-item">
          <span className="status-item-label">{refreshLabel}</span>
        </div>
      </div>
    </div>
  );
}
