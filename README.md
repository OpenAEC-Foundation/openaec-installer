# OpenAEC Installer

[![Build and Release](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml)
[![CI](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/license-CC%20BY--SA%204.0-D97706)](LICENSE)

De centrale hub voor de open source bouwsoftware van de [OpenAEC Foundation](https://open-aec.com/): één plek om alle tools te ontdekken, te installeren, bij te werken en te starten.

## Functies

- **Catalogus** van alle OpenAEC-tools met omschrijving en categorie — desktop-apps én webtools
- **Installatiedetectie**: ziet via het Windows-register welke tools al geïnstalleerd zijn en welke versie
- **Updatedetectie**: vergelijkt de geïnstalleerde versie met de laatste GitHub-release
- **Eén klik installeren of bijwerken**: downloadt de officiële installer van GitHub Releases en start hem
- **Starten** van geïnstalleerde tools en openen van webtools in de browser
- Volledig in de [OpenAEC-huisstijl](https://github.com/OpenAEC-Foundation/OpenAEC-style-book), met vijf thema's (licht, Forge, OpenAEC, Blueprint, hoog contrast) en tweetalige interface (NL/EN)

> Installatie- en updatedetectie werkt momenteel op Windows. De catalogus en websnelkoppelingen werken op alle platformen.

## Downloaden

Ga naar de laatste [release](https://github.com/OpenAEC-Foundation/openaec-installer/releases/latest) en download:

| Platform | Bestand |
|----------|---------|
| Windows (aanbevolen) | `OpenAEC.Installer_x.y.z_x64-setup.exe` |
| Windows (MSI) | `OpenAEC.Installer_x.y.z_x64_en-US.msi` |
| macOS | `OpenAEC.Installer_x.y.z_universal.dmg` |
| Linux | `.deb` of `.AppImage` |

## Ontwikkelen

Vereisten: [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/) (stable) en de platform-afhankelijke [Tauri-vereisten](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # ontwikkelmodus
npm run tauri build   # productie-build + installers
```

### Een tool toevoegen aan de catalogus

Voeg een entry toe aan [`src/data/catalog.ts`](src/data/catalog.ts):

- `kind: "desktop"` — met `repo` (GitHub `owner/naam`), `registryName` (DisplayName in de Windows Uninstall-registersleutel, meestal gelijk aan de productnaam) en `exeName` als fallback
- `kind: "web"` — met alleen een `webUrl`

De laatste release en het juiste Windows-installer-asset worden automatisch via de GitHub API opgehaald.

## Release maken

Een nieuwe versie publiceren werkt zoals bij alle OpenAEC-tools:

```bash
# 1. Versie bijwerken in package.json, src-tauri/tauri.conf.json en src-tauri/Cargo.toml
# 2. Tag pushen:
git tag v0.2.0
git push origin v0.2.0
```

De [release-workflow](.github/workflows/release.yml) bouwt daarna automatisch de installers voor Windows, macOS en Linux en publiceert de GitHub-release.

## Huisstijl

Kleuren, typografie (Space Grotesk / Inter / JetBrains Mono) en componenten volgen het [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book). De applicatie is gebaseerd op de Tauri+React-template uit datzelfde stijlboek.

## Licentie

[CC BY-SA 4.0](LICENSE) — © OpenAEC Foundation
