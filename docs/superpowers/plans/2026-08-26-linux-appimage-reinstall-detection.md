# Linux AppImages na herinstallatie herkennen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zorg dat de Linux-installer na een eigen herinstallatie dezelfde eerder beheerde OpenAEC-AppImages herkent, ook wanneer de installer als Snap draait.

**Architecture:** De Linux-backend krijgt één testbare resolver voor de beheerde gegevenshome. Buiten Snap blijft hij de bestaande XDG-volgorde gebruiken; in Snap gebruikt hij `SNAP_REAL_HOME` om precies dezelfde hostmap te bereiken. De scanner geeft een getypeerd resultaat met gevonden tools en eventueel één toegangsprobleem terug, waarna de React-interface een centrale, vertaalde melding toont zonder bekende toolstatus te wissen.

**Tech Stack:** Rust 2021, Tauri 2 command-serialisatie, React 19, TypeScript 5.9, Vitest 4, Snapcraft strict confinement.

**Spec:** `docs/superpowers/specs/2026-08-26-linux-appimage-reinstall-detection-design.md`

## Global Constraints

- Scan uitsluitend de beheerde OpenAEC-map; zoek nooit in `Downloads`, `~/Applications` of andere willekeurige paden.
- Behoud buiten Snap de bestaande volgorde: absolute `XDG_DATA_HOME`, anders `$HOME/.local/share`.
- Gebruik binnen Snap `SNAP_REAL_HOME/.local/share`; val daar nooit terug op Snap's `$HOME` of `SNAP_USER_DATA`.
- Een ontbrekende beheerde map betekent een lege installatie; een bestaande maar niet-leesbare of ongeldige map betekent `managed_apps_unavailable`.
- Behoud de hoogst parsebare AppImage-versie per tool en verwijder, kopieer of verplaats niets tijdens een scan.
- Houd de Snap strict confined. Vraag alleen de smalle `personal-files`-toegang tot `$HOME/.local/share/openaec-installer`.
- Toon één toegankelijke, vertaalde centrale melding met tekst en vernieuwknop; kleur mag niet de enige betekenisdrager zijn.
- Geen Snap Store-verzoek, release-tag, GitHub-release, push of publicatie zonder afzonderlijk expliciet akkoord.
- Voeg geen nieuwe runtime- of testafhankelijkheden toe.

---

## Bestandsstructuur

| Bestand | Wijziging | Verantwoordelijkheid |
|---|---|---|
| `src-tauri/src/linux.rs` | Wijzigen | Los de echte gegevenshome op, scan fouten expliciet en test de AppImage-herkenning na herinstallatie. |
| `src-tauri/src/registry.rs` | Wijzigen | Definieer het platformneutrale scanresultaat en laat Windows een succesvol resultaat zonder issue teruggeven. |
| `src-tauri/src/lib.rs` | Wijzigen | Publiceer het nieuwe scanresultaat via het bestaande Tauri-commando. |
| `src/lib/api.ts` | Wijzigen | Beschrijf het serialisatiecontract in TypeScript en vraag het Tauri-commando met dat type op. |
| `src/lib/installed-tools.ts` | Maken | Pure reducer die een succesvolle scan toepast en bij een issue de eerdere kaartstatus bewaart. |
| `src/lib/installed-tools.test.ts` | Maken | Vitest-dekking voor de reducer en de centrale issuecode. |
| `src/App.tsx` | Wijzigen | Bewaar het scanissue, behoud bekende tools bij fouten en render de centrale melding. |
| `src/App.css` | Wijzigen | Maak de centrale melding leesbaar in alle thema's en bij smalle vensters. |
| `src/i18n/locales/nl/common.json` | Wijzigen | Nederlandse scanmelding en vernieuwknop. |
| `src/i18n/locales/en/common.json` | Wijzigen | Engelse scanmelding en vernieuwknop. |
| `snap/snapcraft.yaml` | Wijzigen | Verklaar en koppel de beperkte `personal-files`-plug. |
| `README.md` | Wijzigen | Beschrijf de beperkte, herinstallatiebestendige Linux-detectie. |

## Gedeelde interfaces

Task 1 definieert de backendrespons in `registry.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolScanIssue {
    ManagedAppsUnavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolScanResult {
    pub tools: Vec<InstalledTool>,
    pub issue: Option<ToolScanIssue>,
}
```

Task 2 gebruikt de exact overeenkomstige TypeScript-interface:

```ts
export type ToolScanIssue = "managed_apps_unavailable";

export interface ToolScanResult {
  tools: InstalledTool[];
  issue: ToolScanIssue | null;
}
```

Een succesvolle scan heeft `issue: null`. Wanneer `issue` is gezet, moet
`tools` een lege lijst zijn en moet de frontend haar eerdere kaartstatus
behouden.

### Task 1: Pakket-onafhankelijke Linux-scan

**Files:**

- Modify: `src-tauri/src/linux.rs:14-82,111-138,211-298`
- Modify: `src-tauri/src/registry.rs:23-33,162-170`
- Modify: `src-tauri/src/lib.rs:7-10`
- Test: `src-tauri/src/linux.rs:211-298`

**Interfaces:**

- Consumes: `ToolQuery` en `InstalledTool` uit `registry.rs`.
- Produces: `registry::ToolScanResult`, `registry::ToolScanIssue`, en
  `registry::scan(&[ToolQuery]) -> ToolScanResult` voor het Tauri-commando.
- Produces: een private `managed_data_home_from`-resolver in `linux.rs` die
  invoerwaarden ontvangt in plaats van testprocessen te laten muteren.

- [ ] **Step 1: Schrijf de falende Rust-tests voor de padresolver en een verse scan**

  Voeg in `linux.rs` een kleine privétestinvoer toe met de vier waarden die de
  resolver nodig heeft: `is_snap`, `snap_real_home`, `xdg_data_home` en `home`.
  Schrijf daarna deze tests naast de bestaande Linux-tests:

  ```rust
  #[test]
  fn snap_uses_real_home_instead_of_revision_home() {
      let real_home = PathBuf::from("/home/alice");
      let result = managed_data_home_from(DataHomeInput {
          is_snap: true,
          snap_real_home: Some(real_home.clone()),
          xdg_data_home: Some(PathBuf::from("/home/alice/snap/open-aec-installer/42/.local/share")),
          home: Some(PathBuf::from("/home/alice/snap/open-aec-installer/42")),
      });

      assert_eq!(result.unwrap(), real_home.join(".local/share"));
  }

  #[test]
  fn fresh_scan_finds_appimage_without_running_installation() {
      let tmp = temp_home("reinstall");
      let root = tmp.join("openaec-installer/apps");
      let tool_dir = root.join("open-2d-studio");
      std::fs::create_dir_all(&tool_dir).unwrap();
      std::fs::write(tool_dir.join("Open.2D.Studio_0.35.0_amd64.AppImage"), b"old install").unwrap();

      let result = scan_in(&root, &[ToolQuery {
          id: "open-2d-studio".into(),
          display_name: "Open 2D Studio".into(),
          exe_name: None,
      }]);

      assert_eq!(result.tools.len(), 1);
      assert_eq!(result.tools[0].version.as_deref(), Some("0.35.0"));
      assert_eq!(result.issue, None);
  }
  ```

  Voeg ook een test toe die `root` als gewoon bestand aanmaakt en verwacht dat
  `scan_in` `issue: Some(ToolScanIssue::ManagedAppsUnavailable)` teruggeeft.
  Voeg een test toe voor een ontbrekende `root` die `tools: []` en `issue: None`
  verwacht. Pas bestaande aanroepen van `scan_in` in de tests aan op
  `result.tools`.

- [ ] **Step 2: Voer alleen de nieuwe tests uit en leg de rode uitgangsstatus vast**

  Run:

  ```bash
  cargo test linux::tests::snap_uses_real_home_instead_of_revision_home
  cargo test linux::tests::fresh_scan_finds_appimage_without_running_installation
  ```

  Expected: beide falen vóór de implementatie, omdat `DataHomeInput`,
  `managed_data_home_from` en het nieuwe scanresultaat nog niet bestaan.

- [ ] **Step 3: Implementeer de minimale gedeelde resolver en foutbewuste scanner**

  Definieer in `registry.rs` de interfaces uit **Gedeelde interfaces**. Maak op
  Windows van de bestaande return `found` dit resultaat:

  ```rust
  ToolScanResult {
      tools: found,
      issue: None,
  }
  ```

  Laat de Linux-variant van `registry::scan` rechtstreeks
  `crate::linux::scan(queries)` teruggeven. Laat de niet-ondersteunde
  platformvariant een succesvol leeg `ToolScanResult` teruggeven.

  Vervang in `linux.rs` de huidige `Option<PathBuf>`-route door een kleine
  invoerstructuur en deze beslisvolgorde:

  ```rust
  fn managed_data_home_from(input: DataHomeInput) -> Result<PathBuf, ToolScanIssue> {
      if input.is_snap {
          return input
              .snap_real_home
              .filter(|path| path.is_absolute())
              .map(|home| home.join(".local/share"))
              .ok_or(ToolScanIssue::ManagedAppsUnavailable);
      }

      input
          .xdg_data_home
          .filter(|path| path.is_absolute())
          .or_else(|| input.home.filter(|path| path.is_absolute()).map(|home| home.join(".local/share")))
          .ok_or(ToolScanIssue::ManagedAppsUnavailable)
  }
  ```

  Bouw de productie-invoer uitsluitend uit `SNAP`, `SNAP_REAL_HOME`,
  `XDG_DATA_HOME` en `HOME`. Bouw de app-root door
  `managed_data_home_from(...)?` met `openaec-installer/apps` uit te breiden.
  Gebruik deze resolver zowel in `scan` als in `install_appimage`; verander
  `install_appimage_in` niet, omdat die al een expliciete gegevenshome ontvangt.

  Verander `appimages_in` naar een `std::io::Result<Vec<PathBuf>>`; die helper
  blijft zo bruikbaar voor zowel scan als installatie. In `scan_in` betekent
  `ErrorKind::NotFound` op de root of een individuele toolmap een normale lege
  uitkomst. Iedere andere `read_dir`-fout wordt omgezet naar
  `ManagedAppsUnavailable`, zodat een onleesbare bestaande toolmap niet als
  ongeïnstalleerd verdwijnt. In `install_appimage_in` wordt dezelfde I/O-fout
  met `map_err(|error| format!("appmap lezen: {error}"))?` naar de bestaande
  installatiefout omgezet. Maak ook de fout van `managed_data_home_from` in
  `install_appimage` expliciet met `map_err(|_| "beheerde appmap niet beschikbaar")?`.

  Laat `linux::scan` alle foutsituaties omzetten naar precies:

  ```rust
  ToolScanResult {
      tools: Vec::new(),
      issue: Some(ToolScanIssue::ManagedAppsUnavailable),
  }
  ```

  en laat een geslaagde scan de gevonden tools met `issue: None` teruggeven.
  Pas `get_installed_tools` in `lib.rs` alleen aan voor het nieuwe concrete
  returntype; de commandonaam en invoer blijven ongewijzigd.

- [ ] **Step 4: Voer de Linux-regressies en de volledige Rust-suite uit**

  Run:

  ```bash
  cargo test linux::tests
  cargo test
  ```

  Expected: alle bestaande Linux-tests blijven slagen; de nieuwe verse-scan-,
  Snap-pad-, ontbrekende-map- en onleesbare-map-tests slagen. De volledige
  Rust-suite eindigt met exitcode 0.

- [ ] **Step 5: Commit alleen de backendscanwijziging**

  ```bash
  git add src-tauri/src/linux.rs src-tauri/src/registry.rs src-tauri/src/lib.rs
  git commit -m "Herken beheerde AppImages na Linux-herinstallatie"
  ```

### Task 2: Getypeerd frontend-scanresultaat en behoud van status

**Files:**

- Modify: `src/lib/api.ts:5-54`
- Create: `src/lib/installed-tools.ts`
- Create: `src/lib/installed-tools.test.ts`

**Interfaces:**

- Consumes: de `ToolScanResult`-JSONvorm uit Task 1.
- Produces: `getInstalledTools(): Promise<ToolScanResult>`.
- Produces: `applyToolScan(current, scan): InstalledToolsViewState` voor Task 3.

- [ ] **Step 1: Schrijf de falende Vitest-tests voor het scanresultaat**

  Maak `src/lib/installed-tools.test.ts` met een bekende kaartstatus en de twee
  essentiële gevallen:

  ```ts
  import { describe, expect, it } from "vitest";
  import { applyToolScan } from "./installed-tools";

  const known = {
    "open-2d-studio": {
      id: "open-2d-studio",
      displayName: "Open 2D Studio",
      version: "0.35.0",
      exePath: "/home/alice/.local/share/openaec-installer/apps/open-2d-studio/Open.2D.Studio_0.35.0_amd64.AppImage",
    },
  };

  describe("applyToolScan", () => {
    it("vervangt de status bij een geslaagde scan", () => {
      expect(applyToolScan(known, { tools: [], issue: null })).toEqual({
        installed: {},
        issue: null,
      });
    });

    it("behoudt bekende tools wanneer de beheerde map niet leesbaar is", () => {
      expect(applyToolScan(known, { tools: [], issue: "managed_apps_unavailable" })).toEqual({
        installed: known,
        issue: "managed_apps_unavailable",
      });
    });
  });
  ```

- [ ] **Step 2: Voer de nieuwe test uit en bevestig de rode uitgangsstatus**

  Run:

  ```bash
  npm test -- src/lib/installed-tools.test.ts
  ```

  Expected: FAIL omdat `./installed-tools` en `applyToolScan` nog niet bestaan.

- [ ] **Step 3: Definieer het API-contract en implementeer de pure reducer**

  Vervang in `src/lib/api.ts` de huidige arrayreturn door:

  ```ts
  export type ToolScanIssue = "managed_apps_unavailable";

  export interface ToolScanResult {
    tools: InstalledTool[];
    issue: ToolScanIssue | null;
  }

  export async function getInstalledTools(): Promise<ToolScanResult> {
    const queries = DESKTOP_TOOLS.map((t) => ({
      id: t.id,
      displayName: t.registryName ?? t.name,
      exeName: t.exeName ?? null,
    }));
    return invoke<ToolScanResult>("get_installed_tools", { queries });
  }
  ```

  Maak `src/lib/installed-tools.ts` zonder React-imports:

  ```ts
  import type { InstalledTool, ToolScanIssue, ToolScanResult } from "./api";

  export type InstalledToolsById = Record<string, InstalledTool>;

  export interface InstalledToolsViewState {
    installed: InstalledToolsById;
    issue: ToolScanIssue | null;
  }

  export function applyToolScan(
    current: InstalledToolsById,
    scan: ToolScanResult,
  ): InstalledToolsViewState {
    if (scan.issue) return { installed: current, issue: scan.issue };
    return {
      installed: Object.fromEntries(scan.tools.map((tool) => [tool.id, tool])),
      issue: null,
    };
  }
  ```

  Voeg één Vitest-geval toe dat een succesvolle scan met één tool omzet naar
  een `Record` op id. Daarmee is zowel de positieve als de foutstroom gedekt.

- [ ] **Step 4: Voer de frontendtest en de typecontrole uit**

  Run:

  ```bash
  npm test -- src/lib/installed-tools.test.ts
  npm run build
  ```

  Expected: de drie reducergevallen slagen en de TypeScript-productiebouw
  eindigt met exitcode 0.

- [ ] **Step 5: Commit alleen het API- en reducercontract**

  ```bash
  git add src/lib/api.ts src/lib/installed-tools.ts src/lib/installed-tools.test.ts
  git commit -m "Geef Linux-scanfouten expliciet door aan de interface"
  ```

### Task 3: Centrale melding, beperkte Snap-toegang en productbewijs

**Files:**

- Modify: `src/App.tsx:75-98,148-154,449-505`
- Modify: `src/App.css` bij de catalogus- en knopstijlen
- Modify: `src/i18n/locales/nl/common.json:10-91`
- Modify: `src/i18n/locales/en/common.json:10-91`
- Modify: `snap/snapcraft.yaml:19-35`
- Modify: `README.md:12-23`

**Interfaces:**

- Consumes: `getInstalledTools` en `applyToolScan` uit Task 2.
- Consumes: `ToolScanIssue` met de waarde `managed_apps_unavailable` uit
  Task 1 en Task 2.
- Produces: één `role="alert"`-melding boven de catalogus, met een knop die
  `refresh(true)` aanroept.

- [ ] **Step 1: Voeg de centrale UI-stroom toe zonder de bestaande preview-fallback te veranderen**

  Importeer `applyToolScan` én `InstalledToolsViewState` in `App.tsx`. Vervang
  de losse `installed`-state door één samengestelde scanstate, zodat een
  functionele update altijd de actuele kaartstatus ziet zonder dat
  `scanInstalled` van die status afhankelijk wordt:

  ```ts
  const [installedState, setInstalledState] = useState<InstalledToolsViewState>({
    installed: {},
    issue: null,
  });
  const { installed, issue: scanIssue } = installedState;
  ```

  Vervang de inhoud van `scanInstalled` door een scan die het reducerresultaat
  als één functionele state-update toepast:

  ```ts
  const result = await getInstalledTools();
  setInstalledState((current) => applyToolScan(current.installed, result));
  ```

  Houd de dependency-array van `scanInstalled` leeg. Behoud de bestaande
  `catch` volledig: een Vite-preview zonder Tauri-bridge wijzigt geen
  kaartstatus en toont geen native foutmelding.

  Plaats als eerste element in `<main className="app-main">` deze melding:

  ```tsx
  {scanIssue && (
    <div className="scan-issue" role="alert">
      <span>{t(`errors.${scanIssue}`)}</span>
      <button type="button" onClick={() => refresh(true)}>
        {t("actions.retry")}
      </button>
    </div>
  )}
  ```

- [ ] **Step 2: Voeg vertalingen en toegankelijke styling toe**

  Voeg toe aan beide taalbestanden:

  ```json
  "actions": {
    "retry": "Vernieuwen"
  },
  "errors": {
    "managed_apps_unavailable": "De beheerde OpenAEC-appmap kan niet worden gelezen. Controleer de Linux- of Snap-toegang en vernieuw daarna."
  }
  ```

  Gebruik in het Engelse bestand respectievelijk `Refresh` en `The managed
  OpenAEC app folder cannot be read. Check Linux or Snap access, then refresh.`
  Voeg in `App.css` een `.scan-issue`-regel toe met flex-layout, zichtbare
  rand, voldoende padding, normale tekst en een expliciet gelabelde knop. De
  tekst en `role="alert"` dragen de betekenis; de rand is alleen een extra
  visueel signaal. Voeg een smalle-vensterregel toe die de knop onder de tekst
  mag plaatsen zonder de melding onleesbaar te maken.

- [ ] **Step 3: Leg de minimale Snap- en gebruikersdocumentatie vast**

  Voeg op rootniveau van `snap/snapcraft.yaml` deze benoemde plug toe:

  ```yaml
  plugs:
    openaec-managed-apps:
      interface: personal-files
      write:
        - $HOME/.local/share/openaec-installer
  ```

  Voeg vervolgens `openaec-managed-apps` toe aan de `plugs` van
  `apps.open-aec-installer`. Laat `confinement: strict`, `home`,
  `removable-media`, `network` en `browser-support` ongewijzigd.

  Maak de Linux-bullet in `README.md` concreet: benoem dat de installer alleen
  door OpenAEC beheerde AppImages uit de centrale gebruikersmap detecteert en
  ze na een herinstallatie van de installer opnieuw herkent. Voeg geen claim
  toe dat een Store-permissie al is goedgekeurd.

- [ ] **Step 4: Controleer de Snap-declaratie vóór de productievalidatie**

  Run:

  ```bash
  node --input-type=module -e 'import { readFileSync } from "node:fs"; const yaml = readFileSync("snap/snapcraft.yaml", "utf8"); if (!/openaec-managed-apps:\n\s+interface: personal-files\n\s+write:\n\s+- \$HOME\/.local\/share\/openaec-installer/.test(yaml) || !/- openaec-managed-apps/.test(yaml)) process.exit(1);'
  ```

  Expected: exitcode 0 pas nadat de benoemde plug én de koppeling aan de app
  aanwezig zijn. Deze controle voorkomt een stille manifestvergetelheid; de
  niet-publicerende Snap-build in CI valideert vervolgens de volledige
  Snapcraft-syntaxis.

- [ ] **Step 5: Voer de geautomatiseerde productiecontroles uit**

  Run:

  ```bash
  cargo test
  npm test
  npm run build
  npm run tauri build -- --no-bundle
  ```

  Expected: alle opdrachten eindigen met exitcode 0. Bewaar stdout, stderr en
  exitstatus afzonderlijk als één opdracht faalt; een gedeeltelijke testteller
  is geen groen bewijs.

- [ ] **Step 6: Lever het lokale gebruikersbewijs**

  Maak vóór het starten één unieke tijdelijke gegevenshome en vul alleen de
  beheerde map met een testbestand:

  ```bash
  APPIMAGE_TEST_DATA="$(mktemp -d)"
  mkdir -p "$APPIMAGE_TEST_DATA/openaec-installer/apps/open-2d-studio"
  touch "$APPIMAGE_TEST_DATA/openaec-installer/apps/open-2d-studio/Open.2D.Studio_0.35.0_amd64.AppImage"
  XDG_DATA_HOME="$APPIMAGE_TEST_DATA" npm run tauri dev
  ```

  Controleer vóór de visuele controle met `pwd`, de Vite-procesopdracht en de
  Tauri-terminaluitvoer dat deze werkmap de actieve frontend en backend levert.
  Controleer vervolgens in het Tauri-venster dat Open 2D Studio in de groep
  “Al geïnstalleerd” verschijnt met versie `0.35.0`, een startknop en de
  normale update-status. Sluit daarna de ontwikkelsessie en verwijder alleen
  de exact aangemaakte tijdelijke map via het volledige gevalideerde pad.

  Start tenslotte de bestaande, niet-publicerende Snap-workflow met
  `publish: false` of wacht op een pull-request-CI-run die de Snap bouwt. Leg
  een ontbrekende Store-autoconnect als externe voorwaarde vast; voer geen
  Store-aanvraag uit.

- [ ] **Step 7: Commit de interface-, manifest- en documentatiewijziging**

  ```bash
  git add src/App.tsx src/App.css src/i18n/locales/nl/common.json src/i18n/locales/en/common.json snap/snapcraft.yaml README.md
  git commit -m "Toon Linux AppImage-scanfouten duidelijk"
  ```

## Uitvoeringsvolgorde en reviewpunten

1. Review Task 1 op het formele padcontract en op het verschil tussen een
   ontbrekende en een onleesbare map.
2. Review Task 2 op het TypeScript-serialisatiecontract en het behoud van
   bekende kaartstatus.
3. Review Task 3 op de toegankelijke melding, de beperkte Snap-toegang en het
   echte Linux-vensterbewijs.
4. Controleer vóór iedere commit `git diff --check` en stage alleen de in die
   task genoemde bestanden.
5. Push, pull request, release en Snap-publicatie horen niet bij dit plan.
