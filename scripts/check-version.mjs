#!/usr/bin/env node
// Versiepoort volgens het versieschema van OpenAEC-Blueprint: jaar.week,
// `JJJJ.W.N` (jaar, ISO-weeknummer zonder voorloopnul, volgnummer binnen de
// week vanaf 0), met tag en GitHub-release `vJJJJ.W.N`.
//
//   node scripts/check-version.mjs            controleert de bestanden onderling
//   node scripts/check-version.mjs v2026.47.0 controleert ook de tag
//
// package.json, package-lock.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock
// en src-tauri/tauri.conf.json moeten hetzelfde nummer dragen. Een MSI-versie
// mag niet boven 255 beginnen; daarom staat in tauri.conf.json onder
// bundle.windows.wix.version hetzelfde nummer zonder de eeuw (`26.47.0`).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

export const SCHEME = /^(\d{4})\.([1-9]\d?)\.(0|[1-9]\d*)$/;

export function versions() {
  const pkg = JSON.parse(read("package.json")).version;
  const lock = JSON.parse(read("package-lock.json"));
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargo = read("src-tauri/Cargo.toml").match(/^\[package\][^[]*?^version = "([^"]+)"/m)?.[1];
  const cargoLock = read("src-tauri/Cargo.lock").match(/name = "openaec-installer"\r?\nversion = "([^"]+)"/)?.[1];
  return {
    "package.json": pkg,
    "package-lock.json": lock.version,
    "package-lock.json (packages)": lock.packages?.[""]?.version,
    "src-tauri/Cargo.toml": cargo,
    "src-tauri/Cargo.lock": cargoLock,
    "src-tauri/tauri.conf.json": conf.version,
    wix: conf.bundle?.windows?.wix?.version,
  };
}

export function problems(found, tag) {
  const out = [];
  const version = found["package.json"];
  const m = SCHEME.exec(version ?? "");
  if (!m) out.push(`package.json: "${version}" volgt niet JJJJ.W.N`);
  else if (Number(m[2]) > 53) out.push(`package.json: week ${m[2]} bestaat niet`);
  for (const [file, v] of Object.entries(found)) {
    if (file === "wix") continue;
    if (v !== version) out.push(`${file}: "${v}" wijkt af van package.json "${version}"`);
  }
  if (m) {
    const wix = `${Number(m[1]) % 100}.${m[2]}.${m[3]}`;
    if (found.wix !== wix) out.push(`tauri.conf.json bundle.windows.wix.version: "${found.wix}", verwacht "${wix}"`);
  }
  if (tag !== undefined && tag !== `v${version}`) out.push(`tag "${tag}" hoort "v${version}" te zijn`);
  return out;
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  const tag = process.argv[2];
  const found = versions();
  const list = problems(found, tag);
  if (list.length) {
    for (const p of list) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log(`✓ versie ${found["package.json"]}${tag ? ` past bij tag ${tag}` : ""}`);
}
