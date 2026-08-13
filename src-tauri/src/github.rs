//! Laatste releases ophalen via de GitHub API (ongeauthenticeerd, 60 req/uur —
//! de frontend cachet het resultaat).
//!
//! De versie wordt uit de naam van het installer-asset geparst in plaats van
//! uit de tag: bij sommige repo's (bijv. monty-ifc-viewer v1.0.1) wijkt de tag
//! af van de daadwerkelijke bestandsversie. Welk asset gekozen wordt hangt af
//! van het platform: Windows-installers op Windows, AppImages op Linux.

use serde::{Deserialize, Serialize};

const USER_AGENT: &str = "OpenAEC-Installer (https://github.com/OpenAEC-Foundation)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    pub id: String,
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub id: String,
    pub ok: bool,
    pub error: Option<String>,
    pub tag: Option<String>,
    /// Versie geparst uit de installer-assetnaam, met de tag als fallback.
    pub version: Option<String>,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub asset_size: Option<u64>,
    pub page_url: Option<String>,
    pub published_at: Option<String>,
    /// Bij `error = "rate_limited"`: wanneer de GitHub-limiet weer vrijgeeft
    /// (epoch-seconden, uit de x-ratelimit-reset header). Hiermee kan de app
    /// tonen wanneer het weer kan en tot dan onnodige pogingen overslaan.
    pub rate_limit_reset: Option<u64>,
}

pub async fn fetch_all(repos: Vec<RepoRef>) -> Vec<ReleaseInfo> {
    let client = match reqwest::Client::builder().user_agent(USER_AGENT).build() {
        Ok(c) => c,
        Err(e) => {
            return repos
                .into_iter()
                .map(|r| error_info(r.id, format!("http client: {e}")))
                .collect()
        }
    };

    let futures = repos.into_iter().map(|r| fetch_one(client.clone(), r));
    futures_util::future::join_all(futures).await
}

async fn fetch_one(client: reqwest::Client, repo: RepoRef) -> ReleaseInfo {
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        repo.owner, repo.repo
    );
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => return error_info(repo.id, format!("netwerk: {e}")),
    };

    match resp.status().as_u16() {
        200 => {}
        404 => return error_info(repo.id, "no_releases".into()),
        403 | 429 => {
            // GitHub stuurt mee wanneer de limiet weer vrijgeeft; die geven we
            // door zodat de app dat kan tonen en tot dan niet opnieuw probeert.
            let reset = resp
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            let mut info = error_info(repo.id, "rate_limited".into());
            info.rate_limit_reset = reset;
            return info;
        }
        s => return error_info(repo.id, format!("http {s}")),
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return error_info(repo.id, format!("json: {e}")),
    };

    let tag = json["tag_name"].as_str().map(str::to_string);
    let page_url = json["html_url"].as_str().map(str::to_string);
    let published_at = json["published_at"].as_str().map(str::to_string);

    let assets = json["assets"].as_array().cloned().unwrap_or_default();
    let best = assets
        .iter()
        .filter_map(|a| {
            let name = a["name"].as_str()?;
            let score = score_asset(name)?;
            Some((score, name.to_string(), a))
        })
        .max_by_key(|(score, _, _)| *score);

    let (asset_name, asset_url, asset_size) = match &best {
        Some((_, name, a)) => (
            Some(name.clone()),
            a["browser_download_url"].as_str().map(str::to_string),
            a["size"].as_u64(),
        ),
        None => (None, None, None),
    };

    let version = asset_name
        .as_deref()
        .and_then(extract_version)
        .or_else(|| tag.as_deref().map(|t| t.trim_start_matches('v').to_string()));

    ReleaseInfo {
        id: repo.id,
        ok: true,
        error: None,
        tag,
        version,
        asset_name,
        asset_url,
        asset_size,
        page_url,
        published_at,
        rate_limit_reset: None,
    }
}

/// Kies het juiste asset voor het huidige platform. `cfg!` in plaats van
/// `#[cfg]` zodat alle scorers op elk platform meecompileren en getest worden.
fn score_asset(name: &str) -> Option<u32> {
    if cfg!(target_os = "linux") {
        score_linux_asset(name)
    } else if cfg!(target_os = "macos") {
        // macOS-installatie is nog niet geïmplementeerd; geen asset kiezen
        // betekent dat de app netjes "geen installer" toont.
        None
    } else {
        score_windows_asset(name)
    }
}

/// Voorkeursvolgorde voor Linux: alleen AppImages — die kan de app zelf
/// beheren (plaatsen, uitvoerbaar maken, starten) zonder beheerdersrechten.
/// .deb vergt root en dpkg en valt daarom af; None = geen bruikbaar asset.
fn score_linux_asset(name: &str) -> Option<u32> {
    let n = name.to_ascii_lowercase();
    if !n.ends_with(".appimage") {
        return None;
    }
    // Alleen x86-64; ARM-builds zouden op een gewone desktop niet starten.
    if ["aarch64", "arm64", "armv7", "armhf", "i386", "i686"]
        .iter()
        .any(|a| n.contains(a))
    {
        return None;
    }
    let x64 = n.contains("x64") || n.contains("x86_64") || n.contains("amd64");
    Some(if x64 { 100 } else { 90 })
}

/// Voorkeursvolgorde voor Windows-installers; None = geen installer-asset.
fn score_windows_asset(name: &str) -> Option<u32> {
    let n = name.to_ascii_lowercase();
    if n.ends_with(".sig") || n.ends_with(".sha256") || n.ends_with(".zip") || n.ends_with(".json")
    {
        return None;
    }
    let x64 = n.contains("x64") || n.contains("x86_64") || n.contains("amd64");
    if n.ends_with("-setup.exe") || n.ends_with("_setup.exe") {
        // Voorkeur voor de per-gebruiker-installer: die vraagt geen
        // beheerdersrechten (geen UAC) en vermijdt zo ERROR_ELEVATION_REQUIRED
        // (os error 740). Past bij een tool die apps voor de huidige gebruiker
        // installeert. Valt terug op de systeem-installer als die er niet is.
        // Binnen dezelfde installer-klasse blijft x64 altijd boven niet-x64,
        // zodat architectuur nooit door install-scope wordt omgedraaid.
        if n.contains("user-setup") {
            return Some(if x64 { 110 } else { 95 });
        }
        return if x64 { Some(100) } else { Some(85) };
    }
    if n.ends_with(".msi") {
        return if x64 || n.contains("windows") {
            Some(60)
        } else {
            Some(50)
        };
    }
    None
}

/// Zoek een versienummer (minimaal `x.y`) in een assetnaam,
/// bijv. "Open.Frame.Studio_0.5.2_x64-setup.exe" → "0.5.2".
/// Ook gebruikt door de Linux-detectie om de versie uit een
/// geïnstalleerde AppImage-bestandsnaam te halen.
pub(crate) fn extract_version(name: &str) -> Option<String> {
    name.split(['_', '-'])
        .map(|t| t.trim_start_matches('v').trim_start_matches('V'))
        .find(|t| {
            !t.is_empty()
                && t.contains('.')
                && t.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
        })
        .map(str::to_string)
}

fn error_info(id: String, error: String) -> ReleaseInfo {
    ReleaseInfo {
        id,
        ok: false,
        error: Some(error),
        tag: None,
        version: None,
        asset_name: None,
        asset_url: None,
        asset_size: None,
        page_url: None,
        published_at: None,
        rate_limit_reset: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_from_tauri_asset() {
        assert_eq!(
            extract_version("Open.Frame.Studio_0.5.2_x64-setup.exe").as_deref(),
            Some("0.5.2")
        );
        assert_eq!(
            extract_version("Open.Planner.Studio_2026.7.10_x64-setup.exe").as_deref(),
            Some("2026.7.10")
        );
        assert_eq!(
            extract_version("OpenCADStudio-v0.8.0-windows-x86_64-installer.msi").as_deref(),
            Some("0.8.0")
        );
        assert_eq!(extract_version("latest.json"), None);
    }

    #[test]
    fn prefers_user_setup_to_avoid_elevation() {
        let system = score_windows_asset("Open.PDF.Studio_1.67.0_x64-setup.exe");
        let user = score_windows_asset("Open.PDF.Studio_1.67.0_x64_user-setup.exe");
        let msi = score_windows_asset("Open.PDF.Studio_1.67.0_x64_en-US.msi");
        // De per-gebruiker-installer (geen UAC) wint van de systeem-installer,
        // die weer van de msi wint.
        assert!(user > system && system > msi && msi.is_some());
        assert_eq!(score_windows_asset("Open.PDF.Studio_1.67.0_x64-setup.exe.sig"), None);
        assert_eq!(score_windows_asset("Open.2D.Studio_0.35.0_amd64.AppImage"), None);
    }

    #[test]
    fn linux_picks_only_x86_64_appimages() {
        // AppImage wint; Windows-installers en .deb (root vereist) vallen af.
        assert!(score_linux_asset("Open.2D.Studio_0.35.0_amd64.AppImage").is_some());
        assert!(score_linux_asset("OpenAEC.Installer_0.1.6_x86_64.AppImage").is_some());
        assert_eq!(score_linux_asset("Open.2D.Studio_0.35.0_amd64.deb"), None);
        assert_eq!(score_linux_asset("Open.PDF.Studio_1.67.0_x64-setup.exe"), None);
        assert_eq!(score_linux_asset("Open.2D.Studio_0.35.0_amd64.AppImage.sig"), None);
        // ARM- en 32-bits-builds starten niet op een x86-64-desktop.
        assert_eq!(score_linux_asset("Open.2D.Studio_0.35.0_aarch64.AppImage"), None);
        assert_eq!(score_linux_asset("Open.2D.Studio_0.35.0_i386.AppImage"), None);
    }

    #[test]
    fn handles_appimage_names_with_spaces() {
        // Tauri leidt de bestandsnaam af van productName, dus een tool met
        // spaties in zijn naam levert een asset met spaties op.
        let name = "Open 3D Studio_0.8.0_amd64.AppImage";
        assert!(score_linux_asset(name).is_some());
        assert_eq!(extract_version(name).as_deref(), Some("0.8.0"));
    }
}
