import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LANGUAGES, changeLanguage } from "../../i18n/config";
import { compareVersions } from "../../lib/status";
import { getSetting, setSetting } from "../../store";
import Modal from "../Modal";
import ThemedSelect from "../ThemedSelect";
import "../ThemedSelect.css";
import "./SettingsDialog.css";

// De thema's van ontwerp 0.4, dezelfde als de Rust-bibliotheek en de galerij.
const THEME_OPTIONS = [
  { value: "light",               labelKey: "appearance.light",             swatches: ["#F1EEEA", "#FFFFFF", "#D97706", "#2A2A32"] },
  { value: "dark",                labelKey: "appearance.dark",              swatches: ["#2A2A32", "#33333C", "#D97706", "#EDEBE8"] },
  { value: "blueprint",           labelKey: "appearance.blueprint",         swatches: ["#0A1320", "#0F1B2D", "#60A5FA", "#E0E7FF"] },
  { value: "high-contrast-dark",  labelKey: "appearance.highContrastDark",  swatches: ["#000000", "#000000", "#F59E0B", "#FFFFFF"] },
  { value: "high-contrast-light", labelKey: "appearance.highContrastLight", swatches: ["#FFFFFF", "#FFFFFF", "#92400E", "#000000"] },
];

const TAB_IDS = ["general", "appearance", "about"] as const;

/** Het 0.4-thema bij een bewaarde waarde, ook voor de namen van eerdere versies. */
export function themeId(theme?: string): string {
  const earlier: Record<string, string> = { forge: "dark", openaec: "dark", contrast: "high-contrast-dark" };
  const id = earlier[theme ?? ""] ?? theme ?? "light";
  return THEME_OPTIONS.some((o) => o.value === id) ? id : "light";
}

export function applyTheme(theme?: string) {
  document.documentElement.setAttribute("data-oa-theme", themeId(theme));
}

/** Tekstgrootte (OpenAEC-Blueprint#27): tekst en rijhoogtes uit de 0.4-tokens. */
export const TEXT_SIZES = ["compact", "standard", "large"] as const;

export function applyTextSize(size?: string) {
  const value = TEXT_SIZES.find((s) => s === size) ?? "standard";
  if (value === "standard") document.documentElement.removeAttribute("data-oa-text");
  else document.documentElement.setAttribute("data-oa-text", value);
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
  /** Laatste beschikbare versie van de installer zelf (null = onbekend). */
  latestVersion?: string | null;
}

export default function SettingsDialog({
  open,
  onClose,
  theme,
  onThemeChange,
  latestVersion,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState("general");

  // Draft state — only committed on Save
  const [draftTheme, setDraftTheme] = useState(themeId(theme));
  const [draftLang, setDraftLang] = useState("auto");
  const [draftText, setDraftText] = useState("standard");
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Snapshot of original values when dialog opens, for reverting on Cancel
  const originalTheme = useRef(theme);
  const originalLang = useRef("");
  const originalText = useRef("standard");

  useEffect(() => {
    if (open) {
      originalTheme.current = themeId(theme);
      setDraftTheme(themeId(theme));
      getSetting("textSize", "standard").then((size) => {
        originalText.current = size;
        setDraftText(size);
      });
      getSetting("language", "auto").then((lang) => {
        originalLang.current = lang;
        setDraftLang(lang);
      });
    }
  }, [open, theme]);

  const handleThemePreview = (value: string) => {
    setDraftTheme(value);
    applyTheme(value);
  };

  const handleTextPreview = (value: string) => {
    setDraftText(value);
    applyTextSize(value);
  };

  const handleLangPreview = (value: string) => {
    setDraftLang(value);
    changeLanguage(value);
  };

  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    applyTheme(originalTheme.current);
    setDraftText(originalText.current);
    applyTextSize(originalText.current);
    setDraftLang(originalLang.current);
    changeLanguage(originalLang.current);
    onClose();
  };

  const handleSave = () => {
    onThemeChange(draftTheme);
    applyTheme(draftTheme);
    setSetting("theme", draftTheme);
    setSetting("textSize", draftText);
    applyTextSize(draftText);

    setSetting("language", draftLang);
    changeLanguage(draftLang);

    onClose();
  };

  const handleReset = () => {
    setConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setDraftTheme("light");
    applyTheme("light");
    setDraftText("standard");
    applyTextSize("standard");
    setDraftLang("auto");
    changeLanguage("auto");
    setConfirmResetOpen(false);
  };

  const footer = (
    <>
      <button className="settings-btn settings-btn-secondary" onClick={handleReset}>
        {t("resetToDefaults")}
      </button>
      <div className="settings-footer-right">
        <button className="settings-btn settings-btn-secondary" onClick={handleCancel}>
          {tCommon("cancel")}
        </button>
        <button className="settings-btn settings-btn-primary" onClick={handleSave}>
          {tCommon("save")}
        </button>
      </div>
    </>
  );

  return (
    <>
    <Modal open={open} onClose={handleCancel} title={t("title")} width={560} height={500} className="settings-dialog" footer={footer}>
      <div className="settings-body">
        <div className="settings-sidebar">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`settings-tab${activeTab === id ? " active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeTab === "general" && (
            <GeneralTabContent lang={draftLang} onLangChange={handleLangPreview} />
          )}
          {activeTab === "appearance" && (
            <AppearanceTabContent theme={draftTheme} onThemeSelect={handleThemePreview} textSize={draftText} onTextSizeSelect={handleTextPreview} />
          )}
          {activeTab === "about" && <AboutTabContent latestVersion={latestVersion} />}
        </div>
      </div>
    </Modal>

    <Modal
      open={confirmResetOpen}
      onClose={() => setConfirmResetOpen(false)}
      title={t("resetToDefaults")}
      width={340}
      footer={
        <>
          <button className="settings-btn settings-btn-secondary" onClick={() => setConfirmResetOpen(false)}>
            {tCommon("cancel")}
          </button>
          <button className="settings-btn settings-btn-primary" onClick={handleConfirmReset}>
            {t("resetToDefaults")}
          </button>
        </>
      }
    >
      <div style={{ padding: 12, fontSize: 12 }}>{t("resetConfirm")}</div>
    </Modal>
    </>
  );
}

function GeneralTabContent({
  lang,
  onLangChange,
}: {
  lang: string;
  onLangChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-section">
      <h3>{t("general.application")}</h3>
      <div className="settings-row">
        <span className="settings-label">{t("general.language")}</span>
        <ThemedSelect
          value={lang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onChange={onLangChange}
          style={{ width: 180 }}
        />
      </div>
    </div>
  );
}

function AppearanceTabContent({
  theme,
  onThemeSelect,
  textSize,
  onTextSizeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
  textSize: string;
  onTextSizeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-section">
      <h3>{t("appearance.theme")}</h3>
      <ThemeDropdown theme={theme} onThemeSelect={onThemeSelect} />
      <div className="settings-row">
        <span className="settings-label">{t("appearance.textSize")}</span>
        <ThemedSelect
          value={textSize}
          options={TEXT_SIZES.map((s) => ({ value: s, label: t(`appearance.textSizes.${s}`) }))}
          onChange={onTextSizeSelect}
          style={{ width: 180 }}
        />
      </div>
    </div>
  );
}

function ThemeDropdown({
  theme,
  onThemeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = THEME_OPTIONS.find((o) => o.value === theme) || THEME_OPTIONS[0];

  const swatchRow = (swatches: string[]) => (
    <div className="theme-dropdown-swatches">
      {swatches.map((color, i) => (
        <span key={i} className="theme-dropdown-swatch" style={{ backgroundColor: color } as CSSProperties} />
      ))}
    </div>
  );

  return (
    <div className="theme-dropdown" ref={ref}>
      <button className="theme-dropdown-trigger" onClick={() => setOpen(!open)}>
        {swatchRow(selected.swatches)}
        <span className="theme-dropdown-label">{t(selected.labelKey)}</span>
        <svg className="theme-dropdown-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="theme-dropdown-menu">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`theme-dropdown-item${theme === opt.value ? " active" : ""}`}
              onClick={() => { onThemeSelect(opt.value); setOpen(false); }}
            >
              {swatchRow(opt.swatches)}
              <span className="theme-dropdown-label">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AboutTabContent({ latestVersion }: { latestVersion?: string | null }) {
  const { t } = useTranslation("settings");
  const [version, setVersion] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  // Statusregel: is dit de laatste versie? (De banner in het hoofdscherm biedt
  // de daadwerkelijke bijwerk-actie aan.)
  const updateStatus = (() => {
    if (!version || !latestVersion) return null;
    return compareVersions(version, latestVersion) < 0
      ? t("about.updateAvailable", { version: latestVersion })
      : t("about.upToDate");
  })();

  return (
    <div className="settings-section">
      <h3>{t("about.appName")}</h3>
      <div style={{ fontSize: 11, lineHeight: 1.8 }}>
        <p><strong>{t("about.version")}:</strong> {version || "—"}</p>
        {updateStatus && (
          <p style={{ color: "var(--theme-accent)" }}>{updateStatus}</p>
        )}
        <p><strong>{t("about.framework")}:</strong> Tauri + React + TypeScript</p>
        <p><strong>{t("about.license")}:</strong> CC BY-SA 4.0</p>
        <p style={{ marginTop: 8, color: "var(--theme-dialog-content-secondary)" }}>
          {t("about.description")}
        </p>
        <p style={{ marginTop: 8 }}>
          <a
            href="#"
            style={{ color: "var(--theme-accent)" }}
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://open-aec.com/").catch(() => {});
            }}
          >
            {t("about.website")}
          </a>
        </p>
      </div>
    </div>
  );
}
