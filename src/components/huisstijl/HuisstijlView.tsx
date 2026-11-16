import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import B2Icon from "../B2Icon";
import Modal from "../Modal";
import Preview from "./Preview";
import TreeEditor, { type TreeActions } from "./TreeEditor";
import {
  STANDARD_SECTIONS,
  brandFromYaml,
  checkDraft,
  clearActive,
  getOverview,
  inTauri,
  isObject,
  loadExample,
  loadFolder,
  pickFile,
  pickFolder,
  removeAt,
  renameAt,
  saveDraft,
  setAt,
  slotPath,
  useFolder,
  type Added,
  type Brand,
  type Draft,
  type Installed,
  type Json,
  type Overview,
  type Path,
} from "../../lib/huisstijl";
import "./Huisstijl.css";

/** De naam van de voorbeeldhuisstijl (`maker::EXAMPLE_NAME`). */
const EXAMPLE_NAME = "Voorbeeldbouw B.V.";
const EXAMPLE_SHORT_NAME = "Voorbeeldbouw";
const HISTORY = 100;

function Swatches({ item }: { item: Installed }) {
  return (
    <span className="hs-dots" aria-hidden="true">
      {["primary", "secondary", "accent"].map((key) => {
        const hex = item.summary.colors.find((c) => c.key === key)?.hex;
        return hex ? <span key={key} style={{ background: hex }} /> : null;
      })}
    </span>
  );
}

/**
 * De huisstijlmaker: links de huisstijlen, in het midden de onderdelen van
 * `brand.yaml`, rechts een voorbeeld. Opslaan maakt een map die elke
 * OpenAEC-tool leest.
 */
export default function HuisstijlView({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation("huisstijl");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [brand, setBrand] = useState<Brand>({});
  const [history, setHistory] = useState<Brand[]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [dirty, setDirty] = useState(false);
  const [yaml, setYaml] = useState("");
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [section, setSection] = useState("brand");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveAs, setSaveAs] = useState<{ name: string; where: "own" | "other"; folder: string | null; activate: boolean } | null>(null);
  // Wat wacht op "Wijzigingen weggooien?".
  const [pending, setPending] = useState<(() => void) | null>(null);
  const started = useRef(false);

  const fail = (e: unknown) => setMessage({ kind: "error", text: String(e) });
  const refreshOverview = useCallback(() => getOverview().then(setOverview).catch(() => {}), []);

  const show = useCallback((next: Draft) => {
    setDraft(next);
    setBrand(next.brand);
    setHistory([]);
    setAdded([]);
    setDirty(false);
    setYaml(next.yaml);
    setYamlText(null);
    setWarnings(next.warnings);
    setSection((s) => (s in next.brand || s === "yaml" || s === "files" ? s : (Object.keys(next.brand)[0] ?? "yaml")));
  }, []);

  useEffect(() => {
    if (hidden || !inTauri) return;
    // Bij elk openen van de tab: een andere tool of een collega kan iets hebben veranderd.
    void refreshOverview();
    if (started.current) return;
    started.current = true;
    loadExample().then(show).catch(fail);
  }, [hidden, show, refreshOverview]);

  // Controleren en brand.yaml bijwerken, kort na de laatste wijziging.
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = setTimeout(() => {
      checkDraft(draft.source, brand, added)
        .then((r) => {
          setYaml(r.yaml);
          setWarnings(r.warnings);
        })
        .catch(fail);
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, brand, added, dirty]);

  const change = useCallback((next: Brand) => {
    setBrand((now) => {
      if (next === now) return now;
      setHistory((h) => [...h.slice(-HISTORY + 1), now]);
      return next;
    });
    setDirty(true);
    setMessage(null);
  }, []);

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setBrand(last);
    setDirty(true);
  };

  const actions: TreeActions = useMemo(
    () => ({
      set: (path: Path, value: Json) => change(setAt(brand, path, value)),
      remove: (path: Path) => change(removeAt(brand, path)),
      rename: (path: Path, name: string) => change(renameAt(brand, path, name)),
      pickFile: (path: Path, slot) => {
        pickFile(slot.extensions)
          .then((from) => {
            if (!from) return;
            const target = slotPath(slot.folder, from);
            setAdded((list) => [...list.filter((a) => a.path !== target), { path: target, from }]);
            change(setAt(brand, path, target));
          })
          .catch(fail);
      },
      fontNames: isObject(brand.font_files) ? Object.keys(brand.font_files) : [],
    }),
    [brand, change],
  );

  /** Iets doen dat het concept vervangt; vraagt eerst als er wijzigingen zijn. */
  const guarded = (action: () => void) => (dirty ? setPending(() => action) : action());
  const open = (load: () => Promise<Draft>) =>
    guarded(() => {
      setMessage(null);
      load().then(show).catch(fail);
    });

  const afterSave = async (saved: Installed, activated: boolean) => {
    show(await loadFolder(saved.dir));
    await refreshOverview();
    setMessage({ kind: "success", text: t(activated ? "state.savedActive" : "state.saved", { dir: saved.dir }) });
  };

  const save = async () => {
    if (!draft?.source) return;
    setBusy(true);
    try {
      await afterSave(await saveDraft(draft.source, brand, added, draft.source, false), false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveNew = async () => {
    if (!draft || !saveAs) return;
    setBusy(true);
    try {
      const names = isObject(brand.brand) ? brand.brand : {};
      // De korte naam van het voorbeeld gaat mee met de nieuwe naam.
      const short: { [key: string]: Json } = names.short_name === EXAMPLE_SHORT_NAME ? { short_name: saveAs.name.trim() } : {};
      const named = setAt(brand, ["brand"], { ...names, name: saveAs.name.trim(), ...short });
      const saved = await saveDraft(draft.source, named, added, saveAs.where === "other" ? saveAs.folder : null, saveAs.activate);
      setSaveAs(null);
      await afterSave(saved, saveAs.activate);
    } catch (e) {
      fail(e);
      setSaveAs(null);
    } finally {
      setBusy(false);
    }
  };

  const use = async () => {
    if (!draft?.source) return;
    try {
      await useFolder(draft.source);
      await refreshOverview();
      setMessage({ kind: "success", text: t("state.inUse") });
    } catch (e) {
      fail(e);
    }
  };

  const reveal = async () => {
    if (!draft?.source) return;
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(`${draft.source}/brand.yaml`);
    } catch (e) {
      fail(e);
    }
  };

  const applyYaml = async () => {
    if (yamlText == null) return;
    try {
      change(await brandFromYaml(yamlText));
      setYamlText(null);
    } catch (e) {
      fail(e);
    }
  };

  if (!inTauri) {
    return (
      <div className="hs-view" hidden={hidden}>
        <p className="hs-empty hs-desktop-only">{t("desktopOnly")}</p>
      </div>
    );
  }

  const name = isObject(brand.brand) && typeof brand.brand.name === "string" ? brand.brand.name : "";
  const keys = Object.keys(brand);
  const missing = Object.keys(STANDARD_SECTIONS).filter((k) => !(k in brand));
  const label = (key: string) => t(`sections.${key}`, { defaultValue: key });
  const activeDir = overview?.active?.dir ?? null;
  const isActive = !!draft?.source && draft.source === activeDir;
  const files = draft ? [...draft.files.filter((f) => !added.some((a) => a.path === f)).map((f) => ({ path: f, isNew: false })), ...added.map((a) => ({ path: a.path, isNew: true }))].sort((a, b) => a.path.localeCompare(b.path)) : [];

  return (
    <div className="hs-view" hidden={hidden}>
      <aside className="hs-list" aria-label={t("list.title")}>
        <h2>{t("list.title")}</h2>
        <button className="hs-item" aria-current={draft != null && draft.source == null} onClick={() => open(loadExample)}>
          <B2Icon id="file.new" />
          <span>
            {t("list.example")}
            <small>{t("list.exampleHint")}</small>
          </span>
        </button>
        <h3>{t("list.own")}</h3>
        {overview?.own.length ? (
          overview.own.map((item) => (
            <button key={item.dir} className="hs-item" aria-current={draft?.source === item.dir} onClick={() => open(() => loadFolder(item.dir))}>
              <Swatches item={item} />
              <span>
                {item.summary.brand}
                {item.dir === activeDir && <small className="hs-active">{t("list.active")}</small>}
              </span>
            </button>
          ))
        ) : (
          <p className="hs-empty">{t("list.none")}</p>
        )}
        <button
          className="oa-button hs-open"
          onClick={() =>
            pickFolder()
              .then((dir) => dir && open(() => loadFolder(dir)))
              .catch(fail)
          }
        >
          <B2Icon id="file.open" />
          {t("list.openFolder")}
        </button>
        <div className="hs-in-use">
          <p>{overview?.active ? t("list.activeNow", { name: overview.active.summary.brand }) : t("list.activeDefault")}</p>
          {overview?.active && (
            <button
              className="oa-button oa-button--compact"
              onClick={() =>
                clearActive()
                  .then(refreshOverview)
                  .catch(fail)
              }
            >
              {t("list.useDefault")}
            </button>
          )}
        </div>
      </aside>

      <section className="hs-editor">
        <header className="hs-bar">
          <div className="hs-title">
            <B2Icon id="report.branding" size={24} />
            <div>
              <h1>{name || t("title")}</h1>
              <p>{!draft ? "" : dirty ? t("state.changed") : draft.source ? t("state.folder", { dir: draft.source }) : t("state.example")}</p>
            </div>
          </div>
          <div className="hs-buttons">
            <button className="oa-button" disabled={!history.length} onClick={undo}>
              <B2Icon id="edit.undo" />
              {t("actions.undo")}
            </button>
            {draft?.source && (
              <>
                <button className="oa-button" onClick={() => void reveal()}>
                  {t("actions.reveal")}
                </button>
                <button className="oa-button" disabled={dirty || isActive} onClick={() => void use()}>
                  {isActive ? t("list.active") : t("actions.use")}
                </button>
                <button className="oa-button" disabled={!dirty || busy} onClick={() => void save()}>
                  <B2Icon id="file.save" />
                  {t("actions.save")}
                </button>
              </>
            )}
            <button className="oa-button oa-button--primary" disabled={!draft || busy} onClick={() => setSaveAs({ name, where: "own", folder: null, activate: true })}>
              <B2Icon id="file.save-as" />
              {t("actions.saveAs")}
            </button>
          </div>
        </header>

        {message && (
          <div className={`oa-banner oa-banner--${message.kind} hs-message`} role="status">
            <B2Icon id={message.kind === "error" ? "status.error" : "status.success"} />
            <span>{message.text}</span>
            <button className="oa-icon-button" aria-label={t("actions.cancel")} onClick={() => setMessage(null)}>
              <B2Icon id="ui.close" />
            </button>
          </div>
        )}

        <div className="hs-work">
          <nav className="hs-sections" aria-label="brand.yaml">
            {keys.map((key) => (
              <button key={key} aria-current={section === key} onClick={() => setSection(key)}>
                {label(key)}
              </button>
            ))}
            <hr />
            <button aria-current={section === "files"} onClick={() => setSection("files")}>
              {label("files")}
              <span className="oa-count">{files.length}</span>
            </button>
            <button aria-current={section === "yaml"} onClick={() => setSection("yaml")}>
              {label("yaml")}
            </button>
            {missing.length > 0 && (
              <select
                className="oa-field oa-field--compact"
                aria-label={t("actions.addSection")}
                value=""
                onChange={(e) => {
                  const key = e.target.value;
                  if (!key) return;
                  change({ ...brand, [key]: STANDARD_SECTIONS[key] });
                  setSection(key);
                }}
              >
                <option value="">{t("actions.addSection")}</option>
                {missing.map((key) => (
                  <option key={key} value={key}>
                    {label(key)}
                  </option>
                ))}
              </select>
            )}
          </nav>

          <div className="hs-fields">
            <div className="hs-fields-head">
              <h2>{label(section)}</h2>
              <p>{t(`hints.${section}`, { defaultValue: "" })}</p>
            </div>
            <datalist id="hs-font-names">
              {actions.fontNames.map((font) => (
                <option key={font} value={font} />
              ))}
            </datalist>
            {section === "yaml" ? (
              <div className="hs-yaml">
                <textarea className="oa-field" aria-label="brand.yaml" spellCheck={false} value={yamlText ?? yaml} onChange={(e) => setYamlText(e.target.value)} />
                <div className="hs-yaml-actions">
                  <button className="oa-button oa-button--primary" disabled={yamlText == null} onClick={() => void applyYaml()}>
                    {t("actions.apply")}
                  </button>
                  <button className="oa-button" disabled={yamlText == null} onClick={() => setYamlText(null)}>
                    {t("actions.cancel")}
                  </button>
                </div>
              </div>
            ) : section === "files" ? (
              <ul className="hs-files">
                {files.map((f) => (
                  <li key={f.path}>
                    <code>{f.path}</code>
                    {f.isNew && <span className="oa-chip">{t("tree.added")}</span>}
                  </li>
                ))}
              </ul>
            ) : section in brand ? (
              <>
                <TreeEditor key={section} value={brand[section]} path={[section]} actions={actions} />
                <button className="oa-button oa-button--quiet hs-remove-section" onClick={() => change(removeAt(brand, [section]))}>
                  <B2Icon id="edit.delete" />
                  {label(section)}: {t("actions.remove").toLowerCase()}
                </button>
              </>
            ) : null}
          </div>

          <aside className="hs-side">
            <h2>{t("preview.title")}</h2>
            {draft && <Preview brand={brand} source={draft.source} added={added} />}
            <p className="hs-note">{t("preview.note")}</p>
            <div className={`hs-warnings${warnings.length ? "" : " hs-warnings--ok"}`} role="status">
              <strong>
                <B2Icon id={warnings.length ? "status.warning" : "status.success"} />
                {warnings.length ? t("warnings.title", { count: warnings.length }) : t("warnings.none")}
              </strong>
              {warnings.length > 0 && (
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </section>

      <Modal
        open={saveAs != null}
        onClose={() => setSaveAs(null)}
        title={t("saveAs.title")}
        width={520}
        footer={
          <>
            <button className="oa-button" onClick={() => setSaveAs(null)}>
              {t("actions.cancel")}
            </button>
            <button className="oa-button oa-button--primary" disabled={busy || !saveAs?.name.trim() || (saveAs?.where === "other" && !saveAs.folder)} onClick={() => void saveNew()}>
              {t("saveAs.save")}
            </button>
          </>
        }
      >
        {saveAs && (
          <div className="hs-save-as">
            <label className="oa-label">
              {t("saveAs.name")}
              <input className="oa-field" autoFocus value={saveAs.name} onChange={(e) => setSaveAs({ ...saveAs, name: e.target.value })} />
            </label>
            {saveAs.name.trim() === EXAMPLE_NAME && <p className="hs-note">{t("saveAs.exampleName")}</p>}
            <fieldset>
              <legend>{t("saveAs.where")}</legend>
              <label className="hs-check">
                <input type="radio" name="hs-where" checked={saveAs.where === "own"} onChange={() => setSaveAs({ ...saveAs, where: "own" })} />
                {t("saveAs.own")}
              </label>
              <label className="hs-check">
                <input type="radio" name="hs-where" checked={saveAs.where === "other"} onChange={() => setSaveAs({ ...saveAs, where: "other" })} />
                {t("saveAs.other")}
              </label>
              {saveAs.where === "other" && (
                <div className="hs-folder">
                  <button
                    className="oa-button oa-button--compact"
                    onClick={() =>
                      pickFolder()
                        .then((folder) => folder && setSaveAs((s) => s && { ...s, folder }))
                        .catch(fail)
                    }
                  >
                    {t("saveAs.choose")}
                  </button>
                  <code>{saveAs.folder ?? t("saveAs.noFolder")}</code>
                </div>
              )}
            </fieldset>
            <label className="hs-check">
              <input type="checkbox" checked={saveAs.activate} onChange={(e) => setSaveAs({ ...saveAs, activate: e.target.checked })} />
              {t("saveAs.activate")}
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={pending != null}
        onClose={() => setPending(null)}
        title={t("discard.title")}
        width={420}
        footer={
          <>
            <button className="oa-button" onClick={() => setPending(null)}>
              {t("actions.cancel")}
            </button>
            <button
              className="oa-button oa-button--danger"
              onClick={() => {
                const action = pending;
                setPending(null);
                action?.();
              }}
            >
              {t("actions.discard")}
            </button>
          </>
        }
      >
        <p className="hs-discard">{t("discard.text")}</p>
      </Modal>
    </div>
  );
}
