# Release-kit: updates via de OpenAEC Installer

Stap 4 van [bijwerken via de installer](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/blob/main/design/bijwerken-via-installer/README.md) (OpenAEC-Blueprint#33). Met deze kit levert een app bij elke release een ondertekende `latest.json`. De installer leest die, controleert de handtekening van de download en werkt de app stil bij. Zonder `latest.json` gebruikt de installer de GitHub-API en controleert hij geen handtekening.

## Wat erin zit

| Bestand | Wat |
| --- | --- |
| [`latest-json.mjs`](latest-json.mjs) | Maakt `latest.json` uit de setups van een release, alleen als elke `.sig` klopt. Geen extra pakketten, Node 20 of nieuwer. |
| [`minisign.mjs`](minisign.mjs) | De controle van de handtekeningen, in hetzelfde formaat als de Tauri-updater en de installer (`src-tauri/src/signature.rs`). |
| [`latest-json-workflow.yml`](latest-json-workflow.yml) | Een losse workflow voor de app: maakt `latest.json` zodra een release gepubliceerd wordt, en met de hand voor een bestaande tag (noodknop). |
| [`workflow-voorbeeld.yml`](workflow-voorbeeld.yml) | Dezelfde stappen als laatste job van een releaseworkflow, voor apps die hun release in de workflow zelf publiceren. |
| [`latest-json.test.mjs`](latest-json.test.mjs) | Tests, ook in de CI van de installer: `node --test "release-kit/*.test.mjs"`. |

## Wat het script bewaakt

- **Elke handtekening klopt.** Elke setup (`*-setup.exe`, `*.msi`, `*.AppImage`, `*.app.tar.gz`) heeft een `.sig` die klopt bij de publieke sleutel van de app. Anders komt er geen `latest.json`, en dus ook geen update.
- **De tag past bij de versie.** De tag is gelijk aan de versie in `tauri.conf.json`, `Cargo.toml` of `package.json` (`--version-file`). Anders blijft een update zich eindeloos aanbieden.
- **Alleen gepubliceerd.** De workflow weigert een concept of pre-release en hangt `latest.json` er als **laatste** aan. Zo verschijnt er nooit een update waarvan de setup nog ontbreekt.
- **De sleutels die de installer leest.** `windows-x86_64-nsis` en `windows-x86_64` (de gewone setup), `windows-x86_64-msi`, `linux-x86_64-appimage` en `linux-x86_64`, en `darwin-aarch64` en `darwin-x86_64`. Een setup per gebruiker (`user-setup`) gaat via de API-route.

## Een app aansluiten

1. **Sleutelpaar.** Eén sleutelpaar per app, met een wachtwoord:

   ```bash
   npx @tauri-apps/cli signer generate -w open-calc-studio.key
   ```

   - Zet de geheime sleutel en het wachtwoord als repo-geheimen `TAURI_SIGNING_PRIVATE_KEY` en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
   - Zet de publieke sleutel (`.key.pub`) als repo-variabele `UPDATER_PUBKEY`.
   - Bewaar de sleutel daarnaast veilig buiten GitHub.
2. **Handtekeningen bij het bouwen.**
   - **Tauri-app:** zet in `tauri.conf.json` `"bundle": { "createUpdaterArtifacts": true }`. Niet `"v1Compatible"`: dan wordt de update een `.nsis.zip` in plaats van de setup zelf. De build leest de twee geheimen en zet naast elke setup een `.sig`.
   - **Andere app:** onderteken de setups na het bouwen:

     ```bash
     npx --yes @tauri-apps/cli@2 signer sign -k "$TAURI_SIGNING_PRIVATE_KEY" -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" app_2026.44.1_x64-setup.exe
     ```
3. **`latest.json` maken.** Kopieer [`latest-json-workflow.yml`](latest-json-workflow.yml) naar `.github/workflows/latest-json.yml`. Die draait bij het publiceren van een release.
   - Publiceert de releaseworkflow de release zelf met `GITHUB_TOKEN`, dan start GitHub geen andere workflows. Zet in dat geval ook [`workflow-voorbeeld.yml`](workflow-voorbeeld.yml) als laatste job in de releaseworkflow.
4. **Catalogus.** Pas na de eerste release mét `latest.json` gaat de publieke sleutel als `pubkey` in `src/data/catalog.ts` van de installer. Met een sleutel in de catalogus installeert de installer niets zonder kloppende handtekening.

## Stil bijwerken

De installer werkt een app bij met dezelfde soort setup als de bestaande installatie:
- **NSIS:** `/S /UPDATE`.
- **MSI:** `msiexec /i … /passive /norestart`.

Een Tauri-setup kan dat al. Een eigen NSIS-setup moet `/S` ondersteunen, zonder vragen. Het is beter als hij ook een open app netjes laat afsluiten door de installer, in plaats van hem zelf geforceerd te stoppen.
