/**
 * De huisstijlmaker: aanroepen naar src-tauri/src/huisstijl.rs en de pure
 * bewerkingen op `brand.yaml` (een boom van objecten, lijsten en waarden).
 */
import { invoke } from "@tauri-apps/api/core";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Brand = { [key: string]: Json };
export type Path = (string | number)[];

export interface Added {
  /** Het pad in de map van de huisstijl, zoals `logos/logo.png`. */
  path: string;
  /** Het bestand op de schijf dat daar komt bij het opslaan. */
  from: string;
}

export interface Draft {
  /** De map waar de bestanden vandaan komen; leeg voor de voorbeeldhuisstijl. */
  source: string | null;
  brand: Brand;
  yaml: string;
  files: string[];
  warnings: string[];
  /** Staat bij de eigen huisstijlen van deze computer. */
  own: boolean;
}

export interface Summary {
  origin: string;
  host: string;
  tradeName: string;
  brand: string;
  tagline: string | null;
  colors: { key: string; hex: string }[];
  fonts: Record<string, string>;
  logo: string | null;
  warnings: string[];
}

export interface Installed {
  dir: string;
  summary: Summary;
}

export interface Overview {
  own: Installed[];
  active: Installed | null;
  folder: string;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type RawDraft = Omit<Draft, "brand"> & { brand: string };
const parse = (raw: RawDraft): Draft => ({ ...raw, brand: JSON.parse(raw.brand) as Brand });

export const loadExample = async () => parse(await invoke<RawDraft>("huisstijl_example"));
export const loadFolder = async (dir: string) => parse(await invoke<RawDraft>("huisstijl_load", { dir }));
export const checkDraft = (source: string | null, brand: Brand, added: Added[]) =>
  invoke<{ yaml: string; warnings: string[] }>("huisstijl_check", { source, brand: JSON.stringify(brand), added });
export const brandFromYaml = async (text: string) => JSON.parse(await invoke<string>("huisstijl_from_yaml", { text })) as Brand;
export const saveDraft = (source: string | null, brand: Brand, added: Added[], target: string | null, activate: boolean) =>
  invoke<Installed>("huisstijl_save", { source, brand: JSON.stringify(brand), added, target, activate });
export const getOverview = () => invoke<Overview>("huisstijl_overview");
export const useFolder = (dir: string) => invoke<Installed>("huisstijl_use", { dir });
export const clearActive = () => invoke<void>("huisstijl_clear");

/** Een bestand van het concept als bytes (logo, lettertype). */
export async function readFile(source: string | null, path: string, added: Added[]): Promise<Uint8Array<ArrayBuffer>> {
  const text = atob(await invoke<string>("huisstijl_file", { source, path, added }));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ directory: true, multiple: false });
  return typeof path === "string" ? path : null;
}

export async function pickFile(extensions: string[]): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, filters: extensions.length ? [{ name: extensions.join(", "), extensions }] : undefined });
  return typeof path === "string" ? path : null;
}

// ── Pure bewerkingen ────────────────────────────────────────────────────

export const isObject = (v: Json | undefined): v is { [key: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());

export function getAt(root: Json, path: Path): Json | undefined {
  let at: Json | undefined = root;
  for (const key of path) {
    if (Array.isArray(at)) at = at[key as number];
    else if (isObject(at)) at = at[key as string];
    else return undefined;
  }
  return at;
}

function update(root: Json, path: Path, change: (parent: Json, key: string | number) => Json): Json {
  if (path.length === 1) return change(root, path[0]);
  const [head, ...rest] = path;
  if (Array.isArray(root)) return root.map((item, i) => (i === head ? update(item, rest, change) : item));
  if (isObject(root)) return Object.fromEntries(Object.entries(root).map(([k, v]) => [k, k === head ? update(v, rest, change) : v]));
  return root;
}

/** Een waarde zetten; een nieuwe sleutel komt achteraan, een bestaande blijft op zijn plek. */
export function setAt<T extends Json>(root: T, path: Path, value: Json): T {
  return update(root, path, (parent, key) => {
    if (Array.isArray(parent)) {
      const next = [...parent];
      next[key as number] = value;
      return next;
    }
    return isObject(parent) ? { ...parent, [key]: value } : parent;
  }) as T;
}

export function removeAt<T extends Json>(root: T, path: Path): T {
  return update(root, path, (parent, key) => {
    if (Array.isArray(parent)) return parent.filter((_, i) => i !== key);
    if (!isObject(parent)) return parent;
    const { [key as string]: _drop, ...rest } = parent;
    return rest;
  }) as T;
}

/** Een sleutel hernoemen zonder de volgorde te veranderen; niets als de nieuwe naam al bestaat of leeg is. */
export function renameAt<T extends Json>(root: T, path: Path, name: string): T {
  const next = name.trim();
  return update(root, path, (parent, key) => {
    if (!isObject(parent) || !next || next === key || next in parent) return parent;
    return Object.fromEntries(Object.entries(parent).map(([k, v]) => [k === key ? next : k, v]));
  }) as T;
}

/** Een lege waarde van dezelfde soort, voor een nieuw item in een lijst. */
export function blankLike(value: Json | undefined): Json {
  if (Array.isArray(value)) return value.map(blankLike);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankLike(v)]));
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (isHex(value)) return "#000000";
  return "";
}

const FILE = /\.(png|jpe?g|svg|pdf|ttf|otf|woff2?|ya?ml)$/i;

/** In welke map een gekozen bestand komt, en welke soorten passen, voor een waarde op dit pad; null als het geen bestand is. */
export function fileSlot(path: Path, value: Json | undefined): { folder: string; extensions: string[] } | null {
  const top = path[0];
  const key = String(path[path.length - 1]);
  if (top === "font_files" && path.length === 2) return { folder: "fonts", extensions: ["ttf", "otf"] };
  if (top === "logos" && path.length === 2) return { folder: "logos", extensions: ["png", "jpg", "jpeg", "svg"] };
  if (top === "stationery" && key === "source") return { folder: "stationery", extensions: ["pdf", "png", "jpg", "jpeg"] };
  if (key === "src" || key === "illustration" || (typeof value === "string" && FILE.test(value))) {
    const folder = typeof value === "string" && value.includes("/") ? value.split("/")[0] : "assets";
    return { folder, extensions: ["png", "jpg", "jpeg", "svg", "pdf"] };
  }
  return null;
}

/** Het pad in de huisstijl voor een gekozen bestand: de map van het vak en een nette bestandsnaam. */
export function slotPath(folder: string, from: string): string {
  const name = (from.split(/[/\\]/).pop() ?? "bestand").replace(/[^A-Za-z0-9._-]/g, "_");
  return `${folder}/${name}`;
}

/** Een kleur van de huisstijl onder een van deze namen, anders de terugval. */
export function color(brand: Brand, keys: string[], fallback: string): string {
  const colors = isObject(brand.colors) ? brand.colors : {};
  for (const key of keys) {
    const value = colors[key];
    if (isHex(value)) return value.trim();
  }
  return fallback;
}

/** Het bestand van het lettertype voor een rol (`heading`, `body`), als er een is. */
export function fontFile(brand: Brand, roles: string[]): string | null {
  const fonts = isObject(brand.fonts) ? brand.fonts : {};
  const files = isObject(brand.font_files) ? brand.font_files : {};
  for (const role of roles) {
    const name = fonts[role];
    const file = typeof name === "string" ? files[name] : undefined;
    if (typeof file === "string" && file) return file;
  }
  return null;
}

/** Het logo voor een lichte of donkere ondergrond, als er een is. */
export function logoFile(brand: Brand, keys: string[]): string | null {
  const logos = isObject(brand.logos) ? brand.logos : {};
  for (const key of keys) {
    const value = logos[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Of tekst op deze kleur licht moet zijn. */
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 150;
}

/** De onderdelen die elke huisstijl kan hebben, met een begin voor wie ze toevoegt. */
export const STANDARD_SECTIONS: Record<string, Json> = {
  brand: { name: "", short_name: "", tagline: "" },
  colors: { primary: "#D97706", secondary: "#36363E", text: "#36363E", background: "#FAFAF9" },
  fonts: { heading: "", body: "" },
  font_files: {},
  logos: { main: "", light: "" },
  contact: { name: "", address: "", postal_code: "", city: "", phone: "", email: "", website: "", kvk: "", btw: "", iban: "" },
  margins: { top_mm: 20, bottom_mm: 20, left_mm: 20, right_mm: 20 },
  gradient: { accent_strip: ["#D97706", "#F59E0B", "#EA580C"] },
  header: { height: 30, elements: [] },
  footer: { height: 15, elements: [] },
  styles: { Normal: { fontName: "", fontSize: 9.5, leading: 13.5, textColor: "#36363E" } },
  stationery: { cover: { source: "" }, content: { source: "" } },
};
