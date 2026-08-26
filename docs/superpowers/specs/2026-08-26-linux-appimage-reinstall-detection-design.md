# Linux AppImages na herinstallatie herkennen — ontwerp

Datum: 2026-08-26

## Doel

Een Linux-gebruiker die de OpenAEC Installer opnieuw installeert, ziet meteen
weer alle OpenAEC-AppImages die eerder door die installer zijn beheerd. De
pakketvorm van de installer — AppImage, `.deb` of Snap — mag die herkenning
niet veranderen.

De herkenning blijft bewust beperkt tot de eigen OpenAEC-appmap. De installer
zoekt dus niet in `Downloads`, `~/Applications` of andere willekeurige
gebruikersmappen naar AppImages.

## Huidige situatie en probleem

De Linux-backend beheert tools nu onder
`~/.local/share/openaec-installer/apps/<tool-id>/` en scant die map bij elke
opstart. In een gewone AppImage- of `.deb`-sessie blijft die map bij een
herinstallatie van alleen de installer bestaan en is zij de juiste bron van
waarheid.

De padbepaling gebruikt echter eerst `XDG_DATA_HOME` en daarna `$HOME`. In een
strict Snap wijst `$HOME` naar versiegebonden Snap-gebruikersdata, niet naar de
oorspronkelijke gebruikershome. Een Snap kan daardoor een andere appmap
gebruiken of na een revisiewissel een lege map zien. De bestaande `home`-plug
lost dat niet op: die geeft geen toegang tot verborgen mappen als `.local`.

## Gegevenscontract

De centrale beheerde appmap blijft:

```text
<echte-gebruikersdata>/openaec-installer/apps/<tool-id>/
```

De precieze gegevenshome wordt als volgt bepaald:

1. Buiten Snap blijft de bestaande XDG-volgorde geldig: een absolute
   `XDG_DATA_HOME`, anders `$HOME/.local/share`.
2. Binnen Snap wordt de echte home bepaald met `SNAP_REAL_HOME`; de installer
   gebruikt daaruit `~/.local/share` en nooit Snap's eigen `$HOME` of
   `SNAP_USER_DATA`.
3. Ontbreekt de centrale OpenAEC-map, dan zijn er terecht geen beheerde tools.
4. Is de centrale map wel aanwezig maar niet leesbaar of ongeldig, dan is dat
   een fouttoestand en geen lege installatie.

Er worden bij herstel geen AppImages verplaatst, gekopieerd of verwijderd. Een
verse installer leest simpelweg dezelfde centrale map opnieuw uit. Wanneer er
meerdere AppImages voor een tool bestaan, blijft de hoogste parsebare versie
winnen, zoals nu al gebeurt.

## Componenten en gegevensstroom

| Onderdeel | Verantwoordelijkheid |
|---|---|
| `src-tauri/src/linux.rs` | Eén gedeelde, testbare resolver voor de beheerde gegevenshome; zowel installatie als scan gebruikt deze resolver. De scanner onderscheidt een ontbrekende map van een niet-toegankelijke map. |
| `src-tauri/src/registry.rs` | Geeft het Linux-scanresultaat door zonder een toegankelijkheidsfout in een lege lijst te veranderen. Windows-detectie blijft functioneel gelijk. |
| `src-tauri/src/lib.rs` | Laat het Tauri-commando een getypeerd scanresultaat teruggeven: gevonden tools plus optioneel een stabiele probleemcode. |
| `src/lib/api.ts` | Definieert het scanresultaat voor TypeScript, in plaats van uitsluitend een array te verwachten. |
| `src/App.tsx` | Vernieuwt de kaartstatus bij opstart, focus en handmatige refresh. Bij een expliciete scanfout blijft de laatst bekende kaartstatus intact en verschijnt één centrale melding. |
| `src/i18n/locales/{nl,en}/common.json` | Bevat de Nederlandse en Engelse tekst voor de centrale toegankelijkheidsmelding. |
| `snap/snapcraft.yaml` | Verklaart en koppelt een smalle `personal-files`-plug die alleen de beheerde OpenAEC-map op de echte gebruikershome mag lezen en schrijven. |

De frontend toont één centrale foutmelding, niet een fout op elke kaart. Het is
namelijk één probleem met de bron van alle beheerde tools. Buiten Tauri, zoals
in een Vite-preview, blijft een ontbrekende native bridge stil zodat de gewone
frontend-preview niet als defect wordt gepresenteerd.

## Snap-toegang

De Snap blijft strict confined. Er komt geen classic confinement en geen brede
home-scan. De manifestwijziging vraagt alleen toegang tot
`$HOME/.local/share/openaec-installer/` via een benoemde
`personal-files`-plug. De applicatie koppelt die plug expliciet aan de
OpenAEC Installer.

Voor een publieke Store-release moet de maintainer de automatische verbinding
van deze smalle plug laten goedkeuren. Zonder die externe Store-goedkeuring
kan een strict Snap de verborgen hostmap niet betrouwbaar gebruiken; de app
meldt dan de toegangsvoorwaarde in plaats van onjuist te zeggen dat er geen
tools zijn. Dit ontwerp voert geen Store-verzoek, Snap-publicatie of release
uit.

## Foutafhandeling

- Een ontbrekende centrale map is normaal: de toollijst is leeg.
- Een bestaande maar niet-leesbare map levert een stabiele backendcode op.
- De interface vertaalt die code naar een centrale melding met een
  vernieuwactie; bestaande gedetecteerde tools blijven zichtbaar zolang een
  nieuwe scan niet met succes is afgerond.
- Ongeldige of niet-parsebare bestandsnamen blijven geen installatie bewijzen;
  zij worden niet als toolkaart opgevoerd.
- De scanner valt nooit terug naar een Snap-specifieke map, want dat zou juist
  een tweede waarheid en schijnbare herinstallatiebreuk creëren.

## Teststrategie

De padresolver krijgt pure unit-tests met geïnjecteerde omgevingswaarden, zodat
tests geen procesbrede omgevingsvariabelen hoeven te wijzigen.

- Een vooraf gevulde `apps/<tool-id>`-map wordt door een nieuwe scan herkend
  zonder dat die testsessie eerst een installatie uitvoert. Dit is de directe
  regressietest voor herinstallatie van de installer.
- Gewone AppImage- en `.deb`-omgevingen met dezelfde gebruikershome leiden tot
  dezelfde beheerde map.
- Een Snap-omgeving met afwijkend `$HOME` maar een vaste `SNAP_REAL_HOME`
  leidt tot dezelfde beheerde map als de gewone omgeving.
- Een Snap zonder bruikbare echte home of zonder toegang tot de beheerde map
  levert de expliciete foutcode op; hij leest niet uit `SNAP_USER_DATA`.
- Bestaande tests voor versies, namen met spaties, installatie, update en
  menusnelkoppelingen blijven groen.
- Frontend-tests dekken de omzetting van scanresultaat naar kaartstatus en
  centrale foutmelding.

Na implementatie zijn minimaal `cargo test`, `npm test`, `npm run build` en
een Linux Tauri-productiebouw zonder bundeling vereist. Daarna volgt een echte
lokale gebruikershandeling met een vooraf gevulde, geïsoleerde OpenAEC-appmap:
een nieuwe installersessie moet de kaart met geïnstalleerde versie,
update-status en startknop tonen. Voor die visuele controle wordt vooraf
vastgesteld dat de draaiende Tauri-app uit deze werkmap komt.

Een Snap-build wordt alleen als niet-publicerende validatie uitgevoerd. Een
release-tag, GitHub-release, Snap Store-verzoek of publicatie blijft buiten dit
ontwerp en vereist afzonderlijk expliciet akkoord.

## Buiten scope

- Detectie van AppImages buiten de centrale OpenAEC-appmap.
- Verwijderen of automatisch verplaatsen van bestaande AppImages.
- Classic Snap confinement.
- Uitbreiding van macOS-ondersteuning.
- Publicatie of wijziging van een bestaande release.
