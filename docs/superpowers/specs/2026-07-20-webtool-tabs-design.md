# Webtools in tabbladen — ontwerp

Datum: 2026-07-20

## Doel

Webtools uit de catalogus openen in tabbladen binnen de OpenAEC Installer in
plaats van in een externe browser. De installer wordt daarmee één werkplek voor
zowel desktop-tools als webtools.

## Uitgangspunt

De webtools hebben alleen een webview nodig. Geen enkele tool op
`*.open-aec.com` stuurt `X-Frame-Options` of een `frame-ancestors`-CSP
(gecontroleerd op alle zes de domeinen), en `tauri.conf.json` zet zelf geen CSP
(`"csp": null`). Iframes binnen het bestaande webview volstaan dus — er is geen
Rust-code en geen extra Tauri-feature nodig.

## Gedrag

**Tabmodel — browserachtig.** Een vaste, niet-sluitbare tab "Catalogus" plus een
sluitbare tab per geopende webtool. De tabbalk verschijnt alleen zodra er een
webtool open staat, zodat de gewone catalogusweergave geen overbodige chrome
krijgt.

**Reikwijdte.** Elke tool met een `webUrl` kan in een tab: de vijf web-only
tools én de webversies van desktop-tools. Installeren en starten van
desktop-tools verandert niet.

**Knopgedrag.** Bij web-only tools is "Openen" de primaire knop en opent die een
tab. Bij alle tools met een `webUrl` opent de klikbare preview eveneens een tab.
Een icoonknop "Openen in browser" blijft op elke kaart aanwezig, en ook in de
balk boven een geopende tab — dat is tevens de vluchtroute mocht een site ooit
embedding gaan blokkeren.

**Staat behouden.** Alle open tabs blijven gemount; inactieve worden met
`hidden` verborgen. Wisselen tussen tabs herlaadt de tool dus niet en behoudt
sessie en invoer. De catalogus blijft eveneens gemount (scrollpositie behouden).

**Dedupliceren.** Een tool die al open staat, opent geen tweede tab maar
activeert de bestaande.

**Sluiten.** Sluit je de actieve tab, dan springt de focus naar de rechterbuur,
anders de linker, anders terug naar de catalogus — zoals in een browser.

**Herstel.** De open tabs en de actieve tab worden bewaard in de bestaande
instellingen-store en bij het opstarten hersteld. Bewaarde ids die niet meer in
de catalogus staan of geen `webUrl` meer hebben, vallen weg. De pagina-staat
binnen een tool wordt niet bewaard — die laadt vers.

## Componenten

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/tabs.ts` | Pure tab-logica: openen, dedupliceren, sluiten, herstellen. Geen React. |
| `src/components/TabBar.tsx` | De tabbalk. |
| `src/components/WebToolView.tsx` | Eén webtool in een iframe, met herlaad- en browserknop. |
| `src/App.tsx` | Tab-state, persistentie, weergaveschakeling. |
| `src/components/ToolCard.tsx` | Roept `onOpenTab` aan in plaats van extern openen. |

De tab-logica staat bewust los van React zodat ze zonder DOM te testen is.

## Beperkingen

- Links binnen een webtool die naar een externe site wijzen, navigeren binnen de
  tab; met de herlaadknop kom je terug bij de tool.
- `target="_blank"`-popups werken binnen een iframe mogelijk niet. Als dat in de
  praktijk knelt, is de vervolgstap native child-webviews (Tauri `unstable`) —
  bewust uitgesteld tot er een concrete aanleiding is.
- Zware tools (Pointcloud) open houden kost geheugen; de tab sluiten ruimt op.
- Herladen gebeurt door de iframe te vervangen: cross-origin `location.reload()`
  is vanuit de app niet toegestaan.

## Verificatie

- `npm test` — 10 tests op de tab-logica (openen, dedupliceren, sluitfocus,
  herstelfiltering).
- `npm run build` — typecontrole en productiebuild.
- Handmatig in de draaiende frontend: tab openen, wisselen met behoud van staat,
  dubbel openen, sluiten van actieve en laatste tab, iframe-lading van
  `open-calc-studio` en `open-heatloss-studio`.
