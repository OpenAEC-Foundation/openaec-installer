#!/usr/bin/env node
// Maakt de `latest.json` van een app-release voor de OpenAEC Installer
// (stap 4 van OpenAEC-Blueprint#33). Fail-closed: zonder kloppende handtekening
// bij elke setup komt er geen `latest.json`, dus ook geen update.
//
//   node latest-json.mjs --repo OpenAEC-Foundation/open-calc-studio --tag v2026.44.1 \
//     --dir dist --pubkey "$UPDATER_PUBKEY" [--version-file src-tauri/tauri.conf.json] \
//     [--notes "…"] [--out latest.json]
//
// - `--dir` bevat de setups van de release met naast elk bestand een `.sig`
//   (Tauri met `bundle.createUpdaterArtifacts: true`, of `tauri signer sign`).
// - `--pubkey` is de publieke sleutel van de app (base64, zoals Tauri hem geeft),
//   dezelfde die in de catalogus van de installer staat; of `@bestand`.
// - `--version-file` is de poort: de tag moet gelijk zijn aan de versie in die
//   `tauri.conf.json`, `Cargo.toml` of `package.json`. Anders blijft een update
//   zich eindeloos aanbieden.
//
// Hang `latest.json` als laatste aan de release, pas als de release geen concept
// of pre-release is (zie workflow-voorbeeld.yml).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifySignature } from "./minisign.mjs";

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`onbekend argument: ${a}`);
    out[a.slice(2)] = argv[++i];
  }
  return out;
}

function fail(message) {
  console.error(`latest.json niet gemaakt: ${message}`);
  process.exit(1);
}

/** De versie in een tauri.conf.json, Cargo.toml of package.json. */
export function versionIn(path) {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".toml")) {
    const m = text.match(/\[package\][^[]*?\nversion\s*=\s*"([^"]+)"/);
    if (!m) throw new Error(`geen [package] version in ${path}`);
    return m[1];
  }
  const json = JSON.parse(text);
  if (!json.version) throw new Error(`geen version in ${path}`);
  return json.version;
}

/** Welke platformsleutels een bestand krijgt, of `null` als het geen setup is. */
export function platformsFor(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".sig") || n.endsWith(".sha256") || n.endsWith(".asc")) return null;
  // Een setup per gebruiker naast de gewone setup is een andere soort; die
  // biedt de installer via de API-route, niet via latest.json.
  if (n.endsWith("-setup.exe") && !n.includes("user-setup") && /x64|x86_64|amd64/.test(n)) return ["windows-x86_64-nsis", "windows-x86_64"];
  if (n.endsWith(".msi") && /x64|x86_64|amd64/.test(n)) return ["windows-x86_64-msi"];
  if (n.endsWith(".appimage") && /amd64|x86_64/.test(n)) return ["linux-x86_64-appimage", "linux-x86_64"];
  if (n.endsWith(".appimage") && /arm64|aarch64/.test(n)) return ["linux-aarch64-appimage", "linux-aarch64"];
  if (n.endsWith(".app.tar.gz")) {
    if (n.includes("universal")) return ["darwin-aarch64", "darwin-x86_64"];
    if (/aarch64|arm64/.test(n)) return ["darwin-aarch64"];
    if (/x64|x86_64/.test(n)) return ["darwin-x86_64"];
  }
  return null;
}

export function build({ repo, tag, dir, pubkey, versionFile, notes = "", now = new Date() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("--repo moet eigenaar/naam zijn");
  if (!tag) throw new Error("--tag ontbreekt");
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) throw new Error(`tag ${tag} is geen versie`);
  if (versionFile) {
    const declared = versionIn(versionFile);
    if (declared !== version) throw new Error(`tag ${tag} hoort bij versie ${version}, maar ${versionFile} zegt ${declared}`);
  }
  if (!pubkey) throw new Error("--pubkey ontbreekt");
  const key = pubkey.startsWith("@") ? readFileSync(pubkey.slice(1), "utf8").trim() : pubkey.trim();
  if (!dir || !existsSync(dir)) throw new Error(`map ${dir} bestaat niet`);

  const platforms = {};
  const checked = [];
  for (const name of readdirSync(dir).sort()) {
    const keys = platformsFor(name);
    if (!keys) continue;
    const sigPath = join(dir, `${name}.sig`);
    if (!existsSync(sigPath)) throw new Error(`${name} heeft geen .sig`);
    const signature = readFileSync(sigPath, "utf8").trim();
    try {
      verifySignature(key, signature, readFileSync(join(dir, name)));
    } catch (e) {
      throw new Error(`${name}: ${e.message}`);
    }
    const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
    for (const k of keys) {
      if (platforms[k]) throw new Error(`twee bestanden voor ${k}: ${platforms[k].url} en ${name}`);
      platforms[k] = { signature, url };
    }
    checked.push(name);
  }
  if (!platforms["windows-x86_64"] && !platforms["windows-x86_64-msi"] && !platforms["linux-x86_64"]) {
    throw new Error("geen ondertekende setup voor Windows of Linux gevonden");
  }
  return { manifest: { version, notes, pub_date: now.toISOString().replace(/\.\d{3}Z$/, "Z"), platforms }, checked };
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  try {
    const a = args(process.argv);
    const { manifest, checked } = build({ repo: a.repo, tag: a.tag, dir: a.dir, pubkey: a.pubkey ?? process.env.UPDATER_PUBKEY, versionFile: a["version-file"], notes: a.notes });
    const out = a.out ?? "latest.json";
    writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${out}: versie ${manifest.version}, ${checked.length} setups gecontroleerd (${checked.join(", ")}), platforms ${Object.keys(manifest.platforms).join(", ")}`);
  } catch (e) {
    fail(e.message);
  }
}
