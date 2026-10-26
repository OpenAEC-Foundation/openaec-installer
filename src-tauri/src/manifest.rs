//! `latest.json` van een release lezen: het bestand dat de Tauri-updater ook
//! gebruikt, met per platform een download-URL en de handtekening ervan.
//!
//! Het bestand komt via `releases/latest/download/latest.json`. Dat is een
//! gewone download en geen API-aanroep, dus telt het niet mee voor de limiet
//! van 60 per uur. De versie staat er expliciet in en hoeft niet uit een
//! bestandsnaam geraden te worden.

use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    pub version: String,
    #[serde(default)]
    pub pub_date: Option<String>,
    #[serde(default)]
    pub platforms: BTreeMap<String, PlatformEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlatformEntry {
    pub signature: String,
    pub url: String,
}

pub fn url(owner: &str, repo: &str) -> String {
    format!("https://github.com/{owner}/{repo}/releases/latest/download/latest.json")
}

/// Haal `latest.json` op. `Ok(None)` als de release er geen heeft (404); dan
/// valt de aanroeper terug op de GitHub-API.
pub async fn fetch(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
) -> Result<Option<Manifest>, String> {
    let resp = client
        .get(url(owner, repo))
        .send()
        .await
        .map_err(|e| format!("netwerk: {e}"))?;
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    let resp = resp.error_for_status().map_err(|e| format!("latest.json: {e}"))?;
    resp.json().await.map(Some).map_err(|e| format!("latest.json: {e}"))
}

/// Kies de update voor dit platform: de eerste sleutel die bestaat én naar
/// een bestand wijst dat de installer kan uitvoeren.
pub fn pick(manifest: &Manifest) -> Option<&PlatformEntry> {
    platform_keys().iter().find_map(|key| {
        manifest
            .platforms
            .get(*key)
            .filter(|entry| usable(file_name(&entry.url)))
    })
}

/// De NSIS-route gaat voor; de MSI-route (`windows-x86_64-msi`) volgt pas als
/// de installer weet hoe een tool geïnstalleerd is. Op Linux eerst de kale
/// AppImage: `linux-x86_64` is bij oudere bouwstraten een `.AppImage.tar.gz`.
fn platform_keys() -> &'static [&'static str] {
    if cfg!(target_os = "linux") {
        &["linux-x86_64-appimage", "linux-x86_64"]
    } else if cfg!(target_os = "macos") {
        &[]
    } else {
        &["windows-x86_64-nsis", "windows-x86_64"]
    }
}

fn usable(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    if cfg!(target_os = "linux") {
        n.ends_with(".appimage")
    } else {
        n.ends_with("-setup.exe") || n.ends_with("-setup.nsis.zip")
    }
}

/// Laatste deel van de URL, zonder query.
pub fn file_name(url: &str) -> &str {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    path.rsplit('/').next().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Naar open-planner-studio v2026.43.0 (handtekeningen ingekort), met een
    // MSI-sleutel erbij die daar niet in staat.
    const PLANNER: &str = r#"{
      "version": "2026.43.0",
      "notes": "Zie de release",
      "pub_date": "2026-10-23T09:30:39Z",
      "platforms": {
        "linux-x86_64": { "signature": "c2ln", "url": "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/Open.Planner.Studio_2026.43.0_amd64.AppImage.tar.gz" },
        "linux-x86_64-appimage": { "signature": "c2ln", "url": "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/Open.Planner.Studio_2026.43.0_amd64.AppImage" },
        "darwin-aarch64": { "signature": "c2ln", "url": "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/Open.Planner.Studio_universal.app.tar.gz" },
        "windows-x86_64-msi": { "signature": "c2ln", "url": "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/Open.Planner.Studio_2026.43.0_x64_en-US.msi" },
        "windows-x86_64-nsis": { "signature": "c2ln", "url": "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/Open.Planner.Studio_2026.43.0_x64-setup.nsis.zip" }
      }
    }"#;

    #[test]
    fn reads_the_version_and_picks_the_platform_file() {
        let m: Manifest = serde_json::from_str(PLANNER).unwrap();
        assert_eq!(m.version, "2026.43.0");
        let picked = file_name(&pick(&m).unwrap().url);
        if cfg!(target_os = "linux") {
            assert_eq!(picked, "Open.Planner.Studio_2026.43.0_amd64.AppImage");
        } else if cfg!(windows) {
            assert_eq!(picked, "Open.Planner.Studio_2026.43.0_x64-setup.nsis.zip");
        }
    }

    #[test]
    fn skips_files_the_installer_cannot_run() {
        let m: Manifest = serde_json::from_str(
            r#"{ "version": "1.0.0", "platforms": {
                "windows-x86_64": { "signature": "c2ln", "url": "https://github.com/a/b/releases/download/v1/App_1.0.0_x64_en-US.msi" },
                "linux-x86_64": { "signature": "c2ln", "url": "https://github.com/a/b/releases/download/v1/App_1.0.0_amd64.AppImage.tar.gz" }
            } }"#,
        )
        .unwrap();
        assert!(pick(&m).is_none());
    }

    /// Met de echte release: `cargo test -- --ignored`. De sleutel is dezelfde
    /// als bij open-planner-studio in `src/data/catalog.ts`.
    #[test]
    #[ignore = "haalt de echte Planner-release op (ongeveer 17 MB)"]
    fn the_planner_release_verifies_with_its_key() {
        const PLANNER_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDI4QUM4RjA4QTg3QzkwQ0QKUldUTmtIeW9DSStzS0RyRytOY0VQNVBqREY2cm5NakpIMlBnb2ZIVm8rWE12YmI0aTYyUlI0MnMK";
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder().user_agent("OpenAEC-Installer").build().unwrap();
            let m = fetch(&client, "OpenAEC-Foundation", "open-planner-studio").await.unwrap().expect("latest.json");
            let entry = pick(&m).expect("bestand voor dit platform");
            let bytes = client.get(&entry.url).send().await.unwrap().error_for_status().unwrap().bytes().await.unwrap();
            let check = crate::signature::Check::new(PLANNER_KEY, &entry.signature).unwrap();
            let mut v = check.verifier().unwrap();
            v.update(&bytes);
            assert!(v.finalize().is_ok(), "handtekening van {} klopt niet", file_name(&entry.url));
        });
    }

    #[test]
    fn file_name_drops_path_and_query() {
        assert_eq!(file_name("https://github.com/a/b/releases/download/v1/App_1.0.0_x64-setup.exe?x=1"), "App_1.0.0_x64-setup.exe");
    }
}
