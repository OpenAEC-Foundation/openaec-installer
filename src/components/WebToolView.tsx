import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogTool } from "../data/catalog";
import { updateIfccadTab } from "../lib/ifccadTab";
import B2Icon from "./B2Icon";
import "./WebToolView.css";

interface WebToolViewProps {
  tool: CatalogTool;
  /** Inactieve tabs blijven gemount (verborgen) zodat hun staat behouden blijft. */
  hidden: boolean;
  obscured: boolean;
}

export default function WebToolView({ tool, hidden, obscured }: WebToolViewProps) {
  const { t } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const appliedReload = useRef(0);

  const url = tool.webUrl!;
  const isExplorer = tool.id === "ifccad";
  const native = isExplorer && isTauri() && navigator.userAgent.includes("Windows");

  useLayoutEffect(() => {
    if (!native) return;
    return () => { void updateIfccadTab({ kind: "close" }).catch(console.error); };
  }, [native]);

  useLayoutEffect(() => {
    const element = slot.current;
    if (!native || !element) return;
    if (hidden || obscured) {
      void updateIfccadTab({ kind: "hide" }).catch(console.error);
      return;
    }

    let current = true;
    let previousBounds: DOMRect | undefined;
    const sync = () => {
      const bounds = element.getBoundingClientRect();
      const { x, y, width, height } = bounds;
      if (width <= 0 || height <= 0) return;
      if (previousBounds?.x === x && previousBounds.y === y &&
          previousBounds.width === width && previousBounds.height === height) return;
      previousBounds = bounds;
      const reload = appliedReload.current !== reloadKey;
      appliedReload.current = reloadKey;
      void updateIfccadTab({ kind: "show", bounds: { x, y, width, height }, reload }).then(
        () => { if (current) setFailed(false); },
        (error) => {
          console.error(error);
          if (current) setFailed(true);
        },
      );
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [native, hidden, obscured, reloadKey]);

  const reload = () => {
    if (!isExplorer) setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const openExternal = () => {
    if (isTauri()) void openUrl(url).catch(() => {});
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="webtool-view" hidden={hidden}>
      <div className="webtool-bar">
        <button className="webtool-btn" onClick={reload} disabled={isExplorer && !native} title={t("tabs.reload")} aria-label={t("tabs.reload")}>
          <B2Icon id="view.web-reload" />
        </button>
        <span className="webtool-url" title={url}>{url}</span>
        {!isExplorer && loading && <span className="webtool-loading">{t("tabs.loading")}</span>}
        <button
          className="webtool-btn"
          onClick={openExternal}
          title={t("tabs.openExternal")}
          aria-label={t("tabs.openExternal")}
        >
          <B2Icon id="link.open-external" />
        </button>
      </div>

      {isExplorer ? (
        <div className="webtool-frame" ref={slot}>
          {(!native || failed) && <p className="webtool-error" role="status">{t("tabs.explorerUnavailable")}</p>}
        </div>
      ) : (
        <iframe
          key={reloadKey}
          className="webtool-frame"
          src={url}
          title={tool.name}
          onLoad={() => setLoading(false)}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      )}
    </div>
  );
}
