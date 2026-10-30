#!/usr/bin/env node
// Neemt het webpakket van ontwerp 0.4 over uit een checkout van OpenAEC-Blueprint
// (map web/), zodat de installer dezelfde tokens, websitestijl, fonts en B2-iconen
// heeft als de Rust-bibliotheek en de galerij (installervoorstel E,
// OpenAEC-Blueprint#13 en #16):
//
//   src/openaec/openaec-tokens.css       de tokens, ongewijzigd
//   src/openaec/openaec-components.css   de componenten met de websitestijl
//   src/openaec/openaec-fonts.css        de fonts, alleen WOFF2 (de webview leest dat)
//   src/openaec/fonts/                   de WOFF2-bestanden en hun licenties
//   public/icons/installer.svg           alleen de B2-iconen die de installer gebruikt
//   crates/openaec-update/src/update_core.rs   het updatecontract van openaec-ui
//                                        (crates/openaec-ui/src/design/update_core.rs)
//
//   node scripts/sync-openaec.mjs ../OpenAEC-Blueprint           schrijven
//   node scripts/sync-openaec.mjs ../OpenAEC-Blueprint --check   alleen vergelijken
//
// Pas een kleur of icoon aan in OpenAEC-Blueprint, niet hier.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NOTE = "/* Copied from OpenAEC-Blueprint web/ by scripts/sync-openaec.mjs; do not edit here. */\n";

/** De iconen die de installer gebruikt, met de sprite in web/icons/ waar ze in staan. */
export const ICONS = {
  installer: [
    "software.install", "software.update", "software.launch", "software.open-webtab", "view.web-reload",
    "status.software-installed",
    "tools.category-ai", "tools.category-bim", "tools.category-cad", "tools.category-calculatie",
    "tools.category-constructief", "tools.category-documenten", "tools.category-energie",
    "tools.category-geotechniek", "tools.category-gis", "tools.category-planning", "tools.category-veld",
  ],
  standard: [
    "link.open-external", "status.error", "status.info", "status.success", "status.warning",
    "ui.close", "ui.settings", "view.search",
    "window.close", "window.maximize", "window.minimize", "window.restore",
  ],
  pdf: ["ui.check-updates"],
  calc: ["nav.back"],
};

function sprite(web) {
  const symbols = [];
  for (const [name, ids] of Object.entries(ICONS)) {
    const text = readFileSync(join(web, "icons", `${name}.svg`), "utf8");
    for (const id of ids) {
      for (const size of [16, 24]) {
        const m = text.match(new RegExp(`<symbol id="i${size}-${id.replace(/\./g, "\\.")}"[\\s\\S]*?</symbol>`));
        if (!m) throw new Error(`i${size}-${id} staat niet in web/icons/${name}.svg`);
        symbols.push(m[0]);
      }
    }
  }
  const revision = readFileSync(join(web, "icons", "installer.svg"), "utf8").match(/revision (\d+)/)?.[1] ?? "?";
  const count = Object.values(ICONS).flat().length;
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n<!-- OpenAEC B2 icons for the installer, revision ${revision}: ${count} icons in 16 and 24 px. Copied from OpenAEC-Blueprint web/icons by scripts/sync-openaec.mjs; do not edit. -->\n${symbols.join("\n")}\n</svg>\n`;
}

function files(web) {
  const out = new Map();
  for (const name of ["openaec-tokens.css", "openaec-components.css"]) {
    out.set(join(ROOT, "src/openaec", name), NOTE + readFileSync(join(web, name), "utf8"));
  }
  const fonts = readFileSync(join(web, "openaec-fonts.css"), "utf8").replace(/, url\("fonts\/[^"]+\.ttf"\) format\("truetype"\)/g, "");
  out.set(join(ROOT, "src/openaec/openaec-fonts.css"), NOTE + fonts);
  for (const font of readdirSync(join(web, "fonts")).sort()) {
    if (font.endsWith(".woff2") || font.endsWith(".txt")) out.set(join(ROOT, "src/openaec/fonts", font), readFileSync(join(web, "fonts", font)));
  }
  out.set(join(ROOT, "public/icons/installer.svg"), sprite(web));
  const contract = readFileSync(join(web, "..", "crates/openaec-ui/src/design/update_core.rs"), "utf8");
  out.set(join(ROOT, "crates/openaec-update/src/update_core.rs"), "// Copied from OpenAEC-Blueprint crates/openaec-ui/src/design/update_core.rs by scripts/sync-openaec.mjs; do not edit here.\n" + contract);
  return out;
}

const args = process.argv.slice(2);
const blueprint = args.find((a) => !a.startsWith("--"));
if (!blueprint) {
  console.error("Gebruik: node scripts/sync-openaec.mjs <pad naar OpenAEC-Blueprint> [--check]");
  process.exit(2);
}
const web = resolve(blueprint, "web");
if (!existsSync(join(web, "openaec-tokens.css"))) {
  console.error(`${web} is geen webpakket van OpenAEC-Blueprint`);
  process.exit(2);
}
const want = files(web);
// Tekstbestanden gelijk ongeacht regeleindes: Git zet ze op Windows om naar CRLF.
const text = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");
const same = (path, data) => {
  if (!existsSync(path)) return false;
  const have = readFileSync(path);
  const want = Buffer.from(data);
  return path.endsWith(".woff2") ? Buffer.compare(have, want) === 0 : text(have) === text(want);
};
const stale = [...want].filter(([path, data]) => !same(path, data)).map(([path]) => path);
const fontDir = join(ROOT, "src/openaec/fonts");
const extra = existsSync(fontDir) ? readdirSync(fontDir).map((f) => join(fontDir, f)).filter((p) => !want.has(p)) : [];
if (args.includes("--check")) {
  if (stale.length || extra.length) {
    console.error(`Loopt achter op het webpakket: ${stale.length + extra.length} bestanden, bijvoorbeeld ${(stale[0] ?? extra[0]).slice(ROOT.length + 1)}`);
    process.exit(1);
  }
  console.log(`Gelijk met het webpakket: ${want.size} bestanden`);
} else {
  for (const path of stale) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, want.get(path));
  }
  for (const path of extra) unlinkSync(path);
  console.log(`Bijgewerkt: ${stale.length} bestanden geschreven, ${extra.length} verwijderd, ${want.size} in totaal`);
}
