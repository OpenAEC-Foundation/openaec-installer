import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogTool } from "../data/catalog";
import "./WebToolView.css";

interface WebToolViewProps {
  tool: CatalogTool;
  /** Inactieve tabs blijven gemount (verborgen) zodat hun staat behouden blijft. */
  hidden: boolean;
}

/**
 * Een webtool in een tabblad. De tool draait in een iframe binnen het
 * webview van de app, dus sessies en localStorage blijven bewaard zolang de
 * tab open is. Een smalle balk biedt herladen en de vluchtroute naar de
 * externe browser.
 */
export default function WebToolView({ tool, hidden }: WebToolViewProps) {
  const { t } = useTranslation();
  // Ophogen forceert een verse iframe: cross-origin herladen kan niet vanaf hier.
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const url = tool.webUrl!;

  const reload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="webtool-view" hidden={hidden}>
      <div className="webtool-bar">
        <button className="webtool-btn" onClick={reload} title={t("tabs.reload")} aria-label={t("tabs.reload")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <span className="webtool-url" title={url}>{url}</span>
        {loading && <span className="webtool-loading">{t("tabs.loading")}</span>}
        <button
          className="webtool-btn"
          onClick={() => openUrl(url).catch(() => {})}
          title={t("tabs.openExternal")}
          aria-label={t("tabs.openExternal")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>

      <iframe
        key={reloadKey}
        className="webtool-frame"
        src={url}
        title={tool.name}
        onLoad={() => setLoading(false)}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
