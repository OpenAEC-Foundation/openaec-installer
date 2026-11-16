import { useState } from "react";
import { useTranslation } from "react-i18next";
import B2Icon from "../B2Icon";
import { blankLike, fileSlot, isHex, isObject, type Json, type Path } from "../../lib/huisstijl";

export interface TreeActions {
  set(path: Path, value: Json): void;
  remove(path: Path): void;
  rename(path: Path, name: string): void;
  pickFile(path: Path, slot: { folder: string; extensions: string[] }): void;
  /** Namen onder font_files, als keuzes voor een lettertyperol. */
  fontNames: string[];
}

type Kind = "text" | "number" | "color" | "yesNo" | "group" | "list";
const BLANK: Record<Kind, Json> = { text: "", number: 0, color: "#000000", yesNo: false, group: {}, list: [] };

const isContainer = (v: Json) => typeof v === "object" && v !== null;

/** Wat een dichtgeklapte groep of een item in een lijst over zichzelf zegt. */
function describe(value: Json): string {
  if (Array.isArray(value)) return `${value.length}`;
  if (!isObject(value)) return "";
  for (const key of ["label", "content", "type", "name", "source", "src"]) {
    const v = value[key];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function Scalar({ value, path, actions }: { value: Json; path: Path; actions: TreeActions }) {
  const { t } = useTranslation("huisstijl");
  const label = String(path[path.length - 1]);
  if (typeof value === "boolean") {
    return (
      <label className="hs-check">
        <input type="checkbox" checked={value} onChange={(e) => actions.set(path, e.target.checked)} />
        {t("tree.yes")}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <input
        className="oa-field oa-field--compact hs-number"
        type="number"
        step="any"
        aria-label={label}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => actions.set(path, e.target.value === "" ? 0 : Number(e.target.value))}
      />
    );
  }
  const text = value == null ? "" : String(value);
  const hex: boolean = isHex(text);
  const slot = fileSlot(path, value);
  const fontRole = path[0] === "fonts" && path.length === 2 && actions.fontNames.length > 0;
  return (
    <span className="hs-value">
      {hex && (
        <input className="hs-swatch" type="color" aria-label={`${label}: ${t("tree.color")}`} value={text.trim().toLowerCase()} onChange={(e) => actions.set(path, e.target.value.toUpperCase())} />
      )}
      <input
        className={`oa-field oa-field--compact${hex || text.startsWith("#") ? " hs-hex" : ""}`}
        type="text"
        aria-label={label}
        value={text}
        list={fontRole ? "hs-font-names" : undefined}
        spellCheck={false}
        onChange={(e) => actions.set(path, e.target.value)}
      />
      {slot && (
        <button className="oa-button oa-button--compact" onClick={() => actions.pickFile(path, slot)}>
          <B2Icon id="file.open" />
          {t("actions.chooseFile")}
        </button>
      )}
    </span>
  );
}

/** De naam van een regel; in een groep is hij te wijzigen. */
function KeyName({ name, path, actions }: { name: string; path: Path; actions: TreeActions }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="hs-key"
      aria-label={`${name}: naam`}
      value={draft ?? name}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && draft.trim() && draft !== name) actions.rename(path, draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

function AddRow({ parent, path, actions }: { parent: { [key: string]: Json }; path: Path; actions: TreeActions }) {
  const { t } = useTranslation("huisstijl");
  const values = Object.values(parent);
  // Een nieuwe regel is van de soort die er al staat: in Kleuren een kleur.
  const guess: Kind = values.length && values.every(isHex) ? "color" : values.length && values.every((v) => typeof v === "number") ? "number" : values.length && values.every(isObject) ? "group" : "text";
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const chosen = kind ?? guess;
  const key = name.trim();
  const ok = key !== "" && !(key in parent);
  const add = () => {
    if (!ok) return;
    const like = chosen === "group" ? values.find(isObject) : undefined;
    actions.set([...path, key], like ? blankLike(like) : BLANK[chosen]);
    setName("");
  };
  return (
    <div className="hs-add">
      <input className="oa-field oa-field--compact" placeholder={t("tree.newName")} aria-label={t("tree.newName")} value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <select className="oa-field oa-field--compact" aria-label={t("tree.kind")} value={chosen} onChange={(e) => setKind(e.target.value as Kind)}>
        {(Object.keys(BLANK) as Kind[]).map((k) => (
          <option key={k} value={k}>
            {t(`tree.${k}`)}
          </option>
        ))}
      </select>
      <button className="oa-button oa-button--compact" disabled={!ok} onClick={add}>
        {t("actions.add")}
      </button>
    </div>
  );
}

function RemoveButton({ path, name, actions }: { path: Path; name: string; actions: TreeActions }) {
  const { t } = useTranslation("huisstijl");
  return (
    <button className="oa-icon-button hs-remove" title={t("actions.remove")} aria-label={`${name}: ${t("actions.remove")}`} onClick={() => actions.remove(path)}>
      <B2Icon id="edit.delete" />
    </button>
  );
}

/** Een groep of lijst uit brand.yaml: elke regel te wijzigen, te hernoemen, te verwijderen en aan te vullen. */
export default function TreeEditor({ value, path, actions, depth = 0 }: { value: Json; path: Path; actions: TreeActions; depth?: number }) {
  const { t } = useTranslation("huisstijl");
  const list = Array.isArray(value);
  const entries: [string | number, Json][] = list ? value.map((v, i) => [i, v]) : isObject(value) ? Object.entries(value) : [];
  return (
    <div className="hs-tree" data-depth={depth}>
      {entries.length === 0 && <p className="hs-empty">{t("tree.empty")}</p>}
      {entries.map(([key, child]) => {
        const childPath = [...path, key];
        const name = list ? t("tree.item", { n: (key as number) + 1 }) : String(key);
        if (isContainer(child)) {
          return (
            <details key={String(key)} className="hs-group" open={depth === 0 && entries.length <= 6 ? true : undefined}>
              <summary>
                <span className="hs-group-name">{name}</span>
                <span className="hs-group-about">{describe(child)}</span>
                <RemoveButton path={childPath} name={name} actions={actions} />
              </summary>
              <TreeEditor value={child} path={childPath} actions={actions} depth={depth + 1} />
            </details>
          );
        }
        return (
          <div key={String(key)} className="hs-row">
            {list ? <span className="hs-key hs-key--fixed">{name}</span> : <KeyName name={name} path={childPath} actions={actions} />}
            <Scalar value={child} path={childPath} actions={actions} />
            <RemoveButton path={childPath} name={name} actions={actions} />
          </div>
        );
      })}
      {list ? (
        <div className="hs-add">
          <button className="oa-button oa-button--compact" onClick={() => actions.set([...path, value.length], value.length ? blankLike(value[value.length - 1]) : "")}>
            {t("actions.addItem")}
          </button>
        </div>
      ) : (
        isObject(value) && <AddRow parent={value} path={path} actions={actions} />
      )}
    </div>
  );
}
