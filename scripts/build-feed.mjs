#!/usr/bin/env node
// Maakt het releasebestand van de installer: per repository uit de catalogus
// de laatste release, in de vorm van de GitHub API (tag, pagina, datum en de
// bestanden). De installer leest dit ene bestand van GitHub Pages in plaats van
// per tool de GitHub API, die zonder account 60 aanvragen per uur per netwerk
// toestaat. Kiezen welke setup bij het platform past, doet de installer zelf
// (src-tauri/src/github.rs).
//
//   GITHUB_TOKEN=… node scripts/build-feed.mjs --out site/releases.json
//
// Een repository die niet te lezen is, blijft uit het bestand; daarvoor valt
// de installer terug op de API. Lukt geen enkele, dan stopt het script met een
// fout, zodat het vorige bestand blijft staan.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** De repositories in src/data/catalog.ts, ook die van de installer zelf. */
export function catalogRepos(source) {
  const repos = new Set();
  for (const m of source.matchAll(/\brepo: "([\w.-]+\/[\w.-]+)"/g)) repos.add(m[1]);
  const self = source.match(/SELF_REPO = "([\w.-]+\/[\w.-]+)"/);
  if (self) repos.add(self[1]);
  return [...repos].sort((a, b) => a.localeCompare(b));
}

/** Alleen wat de installer gebruikt uit een release van de API. */
export function slim(release) {
  return {
    tag_name: release.tag_name,
    html_url: release.html_url,
    published_at: release.published_at,
    assets: (release.assets ?? []).map((a) => ({ name: a.name, browser_download_url: a.browser_download_url, size: a.size })),
  };
}

async function latest(repo, token) {
  const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "OpenAEC-Installer release feed",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`${repo}: HTTP ${resp.status}`);
  return slim(await resp.json());
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  const out = process.argv[process.argv.indexOf("--out") + 1] ?? "site/releases.json";
  const token = process.env.GITHUB_TOKEN;
  if (!token) console.warn("Zonder GITHUB_TOKEN geldt de limiet van 60 aanvragen per uur.");
  const repos = catalogRepos(readFileSync(join(ROOT, "src/data/catalog.ts"), "utf8"));
  const releases = {};
  const failed = [];
  for (const repo of repos) {
    try {
      releases[repo.toLowerCase()] = await latest(repo, token);
    } catch (e) {
      failed.push(e.message);
    }
  }
  if (!Object.keys(releases).length) {
    console.error(`Geen enkele release gelezen: ${failed.join("; ")}`);
    process.exit(1);
  }
  const now = new Date();
  const feed = { generated: now.toISOString(), generated_unix: Math.floor(now.getTime() / 1000), releases };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(feed) + "\n");
  const none = Object.values(releases).filter((r) => r === null).length;
  console.log(`${out}: ${Object.keys(releases).length} repositories (${none} zonder release)${failed.length ? `, niet gelezen: ${failed.join("; ")}` : ""}`);
}
