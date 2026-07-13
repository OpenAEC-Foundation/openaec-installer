import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import SettingsDialog, { applyTheme } from "./components/settings/SettingsDialog";
import ToolCard from "./components/ToolCard";
import OpenAecLogo from "./components/OpenAecLogo";
import { DESKTOP_TOOLS, WEB_TOOLS, type CatalogTool } from "./data/catalog";
import {
  downloadAndRunInstaller,
  getInstalledTools,
  getLatestReleases,
  launchTool,
  onDownloadProgress,
  type DownloadProgress,
  type InstalledTool,
  type ReleaseInfo,
} from "./lib/api";
import { deriveStatus } from "./lib/status";
import { getSetting, setSetting } from "./store";
import "./themes.css";
import "./App.css";

const RELEASE_CACHE_KEY = "releaseCache";
const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;

interface ReleaseCache {
  ts: number;
  data: ReleaseInfo[];
}

function App() {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [search, setSearch] = useState("");
  // false = huidige indeling (Desktop-apps / Webtools); true = op status
  // (Al geïnstalleerd / Nog te installeren). Keuze wordt bewaard.
  const [groupByStatus, setGroupByStatus] = useState(false);

  const [installed, setInstalled] = useState<Record<string, InstalledTool>>({});
  const [releases, setReleases] = useState<Record<string, ReleaseInfo>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refreshingRef = useRef(false);
  // Voorkomt dat de trage opstart-load van groupByStatus een klik overschrijft
  // die de gebruiker doet vóór die load klaar is (race bij opstart).
  const groupTouchedRef = useRef(false);

  const scanInstalled = useCallback(async () => {
    try {
      const list = await getInstalledTools();
      setInstalled(Object.fromEntries(list.map((i) => [i.id, i])));
    } catch {
      // buiten Tauri (bijv. vite preview) — laat leeg
    }
  }, []);

  const fetchReleases = useCallback(async (force: boolean) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      if (!force) {
        const cache = await getSetting<ReleaseCache | null>(RELEASE_CACHE_KEY, null);
        if (cache && Date.now() - cache.ts < RELEASE_CACHE_TTL_MS) {
          setReleases(Object.fromEntries(cache.data.map((r) => [r.id, r])));
          setLastRefresh(new Date(cache.ts));
          return;
        }
      }
      const data = await getLatestReleases();
      const ts = Date.now();
      setReleases(Object.fromEntries(data.map((r) => [r.id, r])));
      setLastRefresh(new Date(ts));
      await setSetting<ReleaseCache>(RELEASE_CACHE_KEY, { ts, data });
    } catch {
      // invoke-fout — bestaande data laten staan
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(
    (force: boolean) => {
      void scanInstalled();
      void fetchReleases(force);
    },
    [scanInstalled, fetchReleases],
  );

  // Opstart: thema laden, venster tonen, eerste scan + release-fetch.
  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
    getSetting("groupByStatus", false).then((saved) => {
      if (!groupTouchedRef.current) setGroupByStatus(saved);
    });
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().show())
      .catch(() => {});
    refresh(false);
  }, [refresh]);

  // Wanneer het venster focus terugkrijgt (bijv. na het doorlopen van een
  // installer) de geïnstalleerde tools opnieuw scannen.
  useEffect(() => {
    const onFocus = () => void scanInstalled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scanInstalled]);

  // Download-voortgang uit de backend.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onDownloadProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const handleInstall = useCallback(
    async (tool: CatalogTool) => {
      const release = releases[tool.id];
      if (!release?.assetUrl || !release.assetName) return;
      setBusy((b) => ({ ...b, [tool.id]: true }));
      setErrors(({ [tool.id]: _drop, ...rest }) => rest);
      setNotes(({ [tool.id]: _drop, ...rest }) => rest);
      try {
        await downloadAndRunInstaller(tool.id, release.assetUrl, release.assetName);
        setNotes((n) => ({ ...n, [tool.id]: t("installerStarted") }));
      } catch (e) {
        setErrors((er) => ({
          ...er,
          [tool.id]: `${t("errors.installFailed")}: ${String(e)}`,
        }));
      } finally {
        setBusy(({ [tool.id]: _drop, ...rest }) => rest);
        setProgress(({ [tool.id]: _drop, ...rest }) => rest);
      }
    },
    [releases, t],
  );

  const handleLaunch = useCallback(
    async (tool: CatalogTool) => {
      const exe = installed[tool.id]?.exePath;
      if (!exe) return;
      try {
        await launchTool(exe);
      } catch (e) {
        setErrors((er) => ({ ...er, [tool.id]: String(e) }));
      }
    },
    [installed],
  );

  // Zoeken over naam, omschrijving en categorie.
  const lang = i18n.language?.startsWith("en") ? "en" : "nl";
  const matches = useCallback(
    (tool: CatalogTool) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.description[lang].toLowerCase().includes(q) ||
        t(`categories.${tool.category}`).toLowerCase().includes(q)
      );
    },
    [search, lang, t],
  );

  const desktopTools = useMemo(() => DESKTOP_TOOLS.filter(matches), [matches]);
  const webTools = useMemo(() => WEB_TOOLS.filter(matches), [matches]);

  // Statusindeling: geïnstalleerde tools (updates eerst) vs. nog te installeren.
  const installedGroup = useMemo(() => {
    const rank = (tool: CatalogTool) =>
      deriveStatus(tool, installed[tool.id], releases[tool.id]) === "update_available" ? 0 : 1;
    return desktopTools
      .filter((tool) => installed[tool.id])
      .sort((a, b) => rank(a) - rank(b));
  }, [desktopTools, installed, releases]);

  const toInstallGroup = useMemo(
    () => desktopTools.filter((tool) => !installed[tool.id]),
    [desktopTools, installed],
  );

  const toggleGroupByStatus = useCallback((value: boolean) => {
    groupTouchedRef.current = true;
    setGroupByStatus(value);
    void setSetting("groupByStatus", value);
  }, []);

  const updateCount = useMemo(
    () =>
      DESKTOP_TOOLS.filter(
        (tool) => deriveStatus(tool, installed[tool.id], releases[tool.id]) === "update_available",
      ).length,
    [installed, releases],
  );

  const renderCard = (tool: CatalogTool) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      status={deriveStatus(tool, installed[tool.id], releases[tool.id])}
      installed={installed[tool.id]}
      release={releases[tool.id]}
      progress={progress[tool.id]}
      busy={busy[tool.id]}
      error={errors[tool.id]}
      note={notes[tool.id]}
      onInstall={handleInstall}
      onLaunch={handleLaunch}
    />
  );

  return (
    <>
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

      <header className="app-header">
        <div className="app-brand">
          <OpenAecLogo size={44} />
          <div>
            <h1 className="app-title">
              Open<span className="app-title-accent">AEC</span>
              <span className="app-title-sub"> Installer</span>
            </h1>
            <p className="app-subtitle">{t("subtitle")}</p>
          </div>
        </div>

        <div className="app-header-actions">
          <label className="view-toggle">
            <input
              type="checkbox"
              checked={groupByStatus}
              onChange={(e) => toggleGroupByStatus(e.target.checked)}
            />
            <span>{t("groupByStatus")}</span>
          </label>
          <div className="search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              placeholder={t("search")}
              onChange={(e) => setSearch(e.target.value)}
              spellCheck={false}
            />
          </div>
          <button
            className="refresh-btn"
            onClick={() => refresh(true)}
            disabled={refreshing}
            title={t("refresh")}
          >
            <svg
              className={refreshing ? "spinning" : ""}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
        </div>
      </header>

      <main className="app-main">
        {groupByStatus ? (
          <>
            {installedGroup.length > 0 && (
              <section>
                <div className="section-label">
                  {t("sections.installedGroup")} ({installedGroup.length})
                </div>
                <div className="tool-grid">{installedGroup.map(renderCard)}</div>
              </section>
            )}
            {toInstallGroup.length > 0 && (
              <section>
                <div className="section-label">
                  {t("sections.toInstall")} ({toInstallGroup.length})
                </div>
                <div className="tool-grid">{toInstallGroup.map(renderCard)}</div>
              </section>
            )}
          </>
        ) : (
          desktopTools.length > 0 && (
            <section>
              <div className="section-label">{t("sections.desktop")}</div>
              <div className="tool-grid">{desktopTools.map(renderCard)}</div>
            </section>
          )
        )}

        {webTools.length > 0 && (
          <section>
            <div className="section-label">{t("sections.web")}</div>
            <div className="tool-grid">{webTools.map(renderCard)}</div>
          </section>
        )}

        {desktopTools.length === 0 && webTools.length === 0 && (
          <div className="no-results">
            <p>{t("noResults", { query: search.trim() })}</p>
          </div>
        )}
      </main>

      <StatusBar
        installedCount={Object.keys(installed).length}
        totalDesktop={DESKTOP_TOOLS.length}
        updateCount={updateCount}
        lastRefresh={lastRefresh}
        refreshing={refreshing}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />
    </>
  );
}

export default App;
