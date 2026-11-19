# OpenAEC Installer

[![Laatste release](https://img.shields.io/github/v/release/OpenAEC-Foundation/openaec-installer?color=D97706&label=release)](https://github.com/OpenAEC-Foundation/openaec-installer/releases/latest)
[![Build and Release](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/release.yml)
[![CI](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenAEC-Foundation/openaec-installer/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/OpenAEC-Foundation/openaec-installer/total?color=D97706)](https://github.com/OpenAEC-Foundation/openaec-installer/releases)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-D97706)](#downloaden)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/license-CC%20BY--SA%204.0-D97706)](LICENSE)

De centrale hub voor de open source bouwsoftware van de [OpenAEC Foundation](https://open-aec.com/): één plek om alle tools te ontdekken, te installeren, bij te werken en te starten, en om de huisstijl van je bedrijf te maken. Niet te verwarren met de [OpenAEC Desktop App](https://github.com/OpenAEC-Foundation/openaec-cloud-desktop), de sync-client van de OpenAEC SuperCloud.

## Functies

- **Huisstijlmaker**: begin met de voorbeeldhuisstijl, pas alles in `brand.yaml` aan (naam, kleuren, lettertypen, logo's, kop- en voettekst, tekststijlen, briefpapier), bekijk een voorbeeld en sla het op als nieuwe huisstijl. Rapporten uit elke OpenAEC-tool op de computer gebruiken hem daarna. Zie [docs/huisstijl.md](docs/huisstijl.md)
- **Catalogus** van alle OpenAEC-tools met omschrijving en categorie — desktop-apps én webtools
- **Installatiedetectie**: ziet welke tools al geïnstalleerd zijn en welke versie (Windows: via het register; Linux: via de beheerde AppImage-map)
- **Updatedetectie**: vergelijkt de geïnstalleerde versie met de laatste GitHub-release; tools met een publieke sleutel worden via hun `latest.json` gecontroleerd en alleen geïnstalleerd als de handtekening klopt
- **Eén klik installeren of bijwerken**: downloadt de officiële installer van GitHub Releases en start hem
- **Starten** van geïnstalleerde tools
- **Webtools in tabbladen**: webtools (en de webversies van desktop-tools) draaien in tabs binnen de app zelf; open tabs worden onthouden en behouden hun staat bij wisselen. Openen in de externe browser blijft mogelijk
- **Werkt zichzelf bij**: de app controleert ook zijn eigen versie en meldt het wanneer er een nieuwe versie is — bijwerken kan met één klik vanuit de app
- **Ontwerp 0.4 van [OpenAEC-Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint)**, voorstel E: het donkere vlak en de tegels van open-aec.com, met filterpillen op status en discipline (Architecture, Engineering, Construction, Infra & GWW), een uitgelichte tool en Alles bijwerken. Tokens, fonts, websitestijl en B2-iconen komen uit het webpakket van Blueprint (`node scripts/sync-openaec.mjs <pad naar OpenAEC-Blueprint>`). Vijf thema's (Licht, Donker, Blueprint, High contrast donker en licht), drie tekstgroottes en een tweetalige interface (NL/EN)

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

De catalogus volgt [open-aec.com](https://open-aec.com/): alleen tools die in het ecosysteemoverzicht van de website staan, in dezelfde volgorde, met de naam, omschrijving en schermafbeelding van de website. Een tool die de website als "retired" markeert of niet meer toont, gaat uit de catalogus. Kaarten zonder iets om te installeren of te openen (alleen "binnenkort", een standaard of een uitbreiding op een andere tool) staan er niet in.

Voeg een entry toe aan [`src/data/catalog.ts`](src/data/catalog.ts), op de plek die de tool op de website heeft:

- `kind: "desktop"` — met `repo` (GitHub `owner/naam`), `registryName` (DisplayName in de Windows Uninstall-registersleutel, meestal gelijk aan de productnaam) en `exeName` als fallback. Levert de release de setups van meerdere apps (zoals Open Office Studio), zet dan `assetPrefix` op het begin van de bestandsnaam van de juiste setup
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

Een nieuwe versie publiceren werkt zoals bij alle OpenAEC-tools. Versienummers volgen het schema van [OpenAEC-Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint): **jaar.week**, `JJJJ.W.N` (jaar, ISO-weeknummer zonder voorloopnul, volgnummer binnen de week vanaf 0). De tag en de GitHub-release heten `vJJJJ.W.N`, de release "OpenAEC Installer vJJJJ.W.N".

```bash
# 1. Versie bijwerken in package.json, package-lock.json, src-tauri/Cargo.toml,
#    src-tauri/Cargo.lock en src-tauri/tauri.conf.json; in die laatste ook
#    bundle.windows.wix.version, hetzelfde nummer zonder de eeuw (2026.47.0 → 26.47.0),
#    omdat een MSI-versie niet boven 255 mag beginnen.
# 2. Controleren:
node scripts/check-version.mjs v2026.47.0
# 3. Tag pushen:
git tag v2026.47.0
git push origin v2026.47.0
```

De [release-workflow](.github/workflows/release.yml) weigert een tag die niet bij de versie past, bouwt daarna de installers voor Windows, macOS en Linux, ondertekent ze (Windows via Azure Trusted Signing, macOS met notarisatie bij Apple), controleert de handtekeningen en publiceert de GitHub-release.

## Huisstijl

Kleuren, typografie (Space Grotesk / Inter / JetBrains Mono) en componenten volgen het [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book). De applicatie is gebaseerd op de Tauri+React-template uit datzelfde stijlboek.

## Licentie

[CC BY-SA 4.0](LICENSE) — © OpenAEC Foundation
