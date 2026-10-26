# OpenAEC Installer

[![Laatste release](https://img.shields.io/github/v/release/OpenAEC-Foundation/openaec-installer?color=D97706&label=release)](https://github.com/OpenAEC-Foundation/openaec-installer/releases/latest)
[![Build and Release](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml)
[![CI](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/OpenAEC-Foundation/openaec-installer/total?color=D97706)](https://github.com/OpenAEC-Foundation/openaec-installer/releases)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-D97706)](#downloaden)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/license-CC%20BY--SA%204.0-D97706)](LICENSE)

De centrale hub voor de open source bouwsoftware van de [OpenAEC Foundation](https://open-aec.com/): één plek om alle tools te ontdekken, te installeren, bij te werken en te starten.

## Functies

- **Catalogus** van alle OpenAEC-tools met omschrijving en categorie — desktop-apps én webtools
- **Installatiedetectie**: ziet welke tools al geïnstalleerd zijn en welke versie (Windows: via het register; Linux: via de beheerde AppImage-map)
- **Updatedetectie**: vergelijkt de geïnstalleerde versie met de laatste GitHub-release; tools met een publieke sleutel worden via hun `latest.json` gecontroleerd en alleen geïnstalleerd als de handtekening klopt
- **Eén klik installeren of bijwerken**: downloadt de officiële installer van GitHub Releases en start hem
- **Starten** van geïnstalleerde tools
- **Webtools in tabbladen**: webtools (en de webversies van desktop-tools) draaien in tabs binnen de installer zelf; open tabs worden onthouden en behouden hun staat bij wisselen. Openen in de externe browser blijft mogelijk
- **Werkt zichzelf bij**: de installer controleert ook zijn eigen versie en meldt het wanneer er een nieuwe versie is — bijwerken kan met één klik vanuit de app
- Volledig in de [OpenAEC-huisstijl](https://github.com/OpenAEC-Foundation/OpenAEC-style-book), met vijf thema's (licht, Forge, OpenAEC, Blueprint, hoog contrast) en tweetalige interface (NL/EN)

> Installeren, bijwerken en starten werkt op Windows (via de officiële installers) en Linux (via AppImages, zonder beheerdersrechten — inclusief menu-snelkoppeling). De catalogus en websnelkoppelingen werken op alle platformen; macOS-installatie volgt nog.

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
npm test              # frontend-tests (vitest)
cd src-tauri && cargo test   # backend-tests
```

### Een tool toevoegen aan de catalogus

Voeg een entry toe aan [`src/data/catalog.ts`](src/data/catalog.ts):

- `kind: "desktop"` — met `repo` (GitHub `owner/naam`), `registryName` (DisplayName in de Windows Uninstall-registersleutel, meestal gelijk aan de productnaam) en `exeName` als fallback
- `kind: "web"` — met alleen een `webUrl`

De laatste release en het juiste installer-asset voor het platform (Windows: `-setup.exe`/`.msi`, Linux: `.AppImage`) worden automatisch via de GitHub API opgehaald.

### Ondertekende updates

Levert de release van een tool een ondertekende `latest.json` (Tauri: `bundle.createUpdaterArtifacts` plus de secrets `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`), zet dan zijn publieke sleutel als `pubkey` in de catalogus. Die is gelijk aan `plugins.updater.pubkey` in de `tauri.conf.json` van de tool. De installer:

- leest eerst `releases/latest/download/latest.json`; dat is een gewone download en telt niet mee voor de API-limiet van 60 per uur;
- valt terug op de GitHub API als die ontbreekt of geen bruikbaar bestand voor het platform heeft, en haalt dan de `.sig` naast het asset op;
- controleert de handtekening tijdens het downloaden en start niets als die ontbreekt of niet klopt;
- pakt een `.nsis.zip` (het oudere updateformaat) na de controle uit tot de setup.

### Bijwerken

Een tool die al geïnstalleerd is, wordt stil bijgewerkt (Windows):

- **Dezelfde soort setup** als de bestaande installatie. De registerscan geeft per tool de soort (`nsis` of `msi`) en het bereik (`user` voor HKCU, `machine` voor HKLM). Een MSI-installatie krijgt de MSI; een installatie per gebruiker krijgt de `…_user-setup.exe` als die er is, anders de gewone NSIS-setup; een systeembrede installatie krijgt nooit de per-gebruiker-setup. Is er geen passende setup, dan meldt de kaart dat en gebeurt er niets, want anders zou de tool er twee keer op komen te staan.
- **Eerst downloaden en controleren**, terwijl de tool gewoon openblijft.
- **Wachten tot de tool dicht is.** Draait hij, dan vraagt de kaart om hem te sluiten (met Annuleren). De installer sluit hem niet zelf: een stille Tauri-setup zou hem anders geforceerd afsluiten en dan gaat open werk verloren.
- **Stil installeren**: NSIS met `/S /UPDATE`, MSI met `msiexec /i … /passive /norestart`. Een systeembrede installatie vraagt nog steeds om beheerdersrechten. De exitcode bepaalt of het gelukt is; MSI-code 3010 betekent dat Windows opnieuw moet opstarten.
- **Opnieuw starten**: stond de tool open, dan start de installer hem daarna weer.

Op Linux wordt de AppImage vervangen zoals bij installeren; een draaiende AppImage mag dat. Een nieuwe installatie doorloopt op Windows nog steeds de gewone setup.

Zet een sleutel alleen als `latest.json` dezelfde soort setup aanbiedt als de API-route. Open PDF Studio ondertekent bijvoorbeeld alleen zijn systeembrede setup, terwijl de installer de per-gebruiker-setup kiest.

Controle tegen de echte release van Open Planner Studio (ongeveer 17 MB): `cd src-tauri && cargo test --lib -- --ignored`.

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
