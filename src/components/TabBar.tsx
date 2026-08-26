import { useTranslation } from "react-i18next";
import { CATALOG_TAB, toolForTab } from "../lib/tabs";
import CategoryIcon from "./CategoryIcon";
import "./TabBar.css";

interface TabBarProps {
  open: string[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Browserachtige tabbalk: een vaste catalogus-tab plus een sluitbare tab per
 * geopende webtool. Verschijnt alleen zodra er webtools open staan, zodat de
 * gewone catalogusweergave niet onnodig chrome krijgt.
 */
export default function TabBar({ open, active, onSelect, onClose }: TabBarProps) {
  const { t } = useTranslation();
  if (open.length === 0) return null;

  return (
    <div className="tab-bar" role="tablist">
      <button
        role="tab"
        aria-selected={active === CATALOG_TAB}
        className={`tab${active === CATALOG_TAB ? " active" : ""}`}
        onClick={() => onSelect(CATALOG_TAB)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        <span className="tab-label">{t("tabs.catalog")}</span>
      </button>

      {open.map((id) => {
        const tool = toolForTab(id);
        if (!tool) return null;
        return (
          <div key={id} className={`tab${active === id ? " active" : ""}`}>
            <button
              role="tab"
              aria-selected={active === id}
              className="tab-main"
              onClick={() => onSelect(id)}
              title={tool.name}
            >
              <CategoryIcon category={tool.category} size={13} />
              <span className="tab-label">{tool.name}</span>
            </button>
            <button
              className="tab-close"
              onClick={() => onClose(id)}
              title={t("tabs.close")}
              aria-label={`${tool.name} — ${t("tabs.close")}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
