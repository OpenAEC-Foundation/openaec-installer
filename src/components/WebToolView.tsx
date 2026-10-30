import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogTool } from "../data/catalog";
import B2Icon from "./B2Icon";
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
          <B2Icon id="view.web-reload" />
        </button>
        <span className="webtool-url" title={url}>{url}</span>
        {loading && <span className="webtool-loading">{t("tabs.loading")}</span>}
        <button
          className="webtool-btn"
          onClick={() => openUrl(url).catch(() => {})}
          title={t("tabs.openExternal")}
          aria-label={t("tabs.openExternal")}
        >
          <B2Icon id="link.open-external" />
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
