//! Detectie van geïnstalleerde tools.
//!
//! Windows: via de Uninstall-registersleutels. NSIS-installaties (Tauri
//! `x64-setup.exe`) registreren onder
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{ProductName}` met
//! DisplayIcon = pad naar de exe. MSI-installaties registreren onder HKLM,
//! vaak zonder InstallLocation — daarvoor zoeken we op bekende paden.
//!
//! Linux: via de beheerde AppImage-map (zie `linux.rs`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolQuery {
    pub id: String,
    /// DisplayName zoals die in het register staat (bijv. "Open Frame Studio").
    pub display_name: String,
    /// Verwachte exe-naam, als fallback wanneer het register geen pad geeft.
    pub exe_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledTool {
    pub id: String,
    pub display_name: String,
    pub version: Option<String>,
    pub exe_path: Option<String>,
    /// "user" (HKCU, per gebruiker) of "machine" (HKLM, voor de hele pc).
    pub scope: Option<&'static str>,
    /// "nsis", "msi", "inno" of "appimage": met welk soort setup de tool erop kwam.
    /// Een update moet dezelfde soort gebruiken, anders ontstaat er een tweede
    /// installatie naast de eerste.
    pub kind: Option<&'static str>,
    /// Andere installaties van dezelfde tool, bijvoorbeeld per gebruiker én voor
    /// de hele pc. Zonder deze lijst bleef zo'n tweede kopie voor altijd oud.
    pub copies: Vec<InstalledCopy>,
}

/// Een tweede (of verdere) installatie van een tool; de eerste staat in `InstalledTool`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCopy {
    pub version: Option<String>,
    pub exe_path: Option<String>,
    pub scope: Option<&'static str>,
    pub kind: Option<&'static str>,
}

#[cfg(windows)]
pub fn scan(queries: &[ToolQuery]) -> Vec<InstalledTool> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hives: [(winreg::HKEY, &str); 3] = [
        (
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];

    let mut found: Vec<InstalledTool> = Vec::new();

    for (hive, path) in hives {
        let root = RegKey::predef(hive);
        let Ok(uninstall) = root.open_subkey(path) else {
            continue;
        };
        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sub) = uninstall.open_subkey(&key_name) else {
                continue;
            };
            let Ok(display_name) = sub.get_value::<String, _>("DisplayName") else {
                continue;
            };
            let display_trim = display_name.trim();
            let Some(query) = queries
                .iter()
                .find(|q| q.display_name.eq_ignore_ascii_case(display_trim))
            else {
                continue;
            };
            let version = sub.get_value::<String, _>("DisplayVersion").ok();
            let display_icon = sub.get_value::<String, _>("DisplayIcon").ok();
            let install_location = sub.get_value::<String, _>("InstallLocation").ok();
            let exe_path = resolve_exe(query, display_icon, install_location);
            let windows_installer = sub.get_value::<u32, _>("WindowsInstaller").ok();
            let uninstall = sub.get_value::<String, _>("UninstallString").ok();
            // Inno Setup zet een eigen sleutel `<AppId>_is1` met "Inno Setup: App Path".
            let inno = key_name.to_ascii_lowercase().ends_with("_is1")
                || sub.get_value::<String, _>("Inno Setup: App Path").is_ok();

            let scope = Some(if hive == HKEY_CURRENT_USER { "user" } else { "machine" });
            let kind = Some(install_kind(windows_installer, uninstall.as_deref(), inno));
            // De eerste treffer per tool (HKCU vóór HKLM) is de hoofdkopie; een
            // volgende installatie van dezelfde tool komt in `copies`.
            if let Some(first) = found.iter_mut().find(|f| f.id == query.id) {
                first.copies.push(InstalledCopy { version, exe_path, scope, kind });
                continue;
            }
            found.push(InstalledTool {
                id: query.id.clone(),
                display_name: display_trim.to_string(),
                version,
                exe_path,
                scope,
                kind,
                copies: Vec::new(),
            });
        }
    }

    found
}

/// MSI-installaties zetten `WindowsInstaller = 1` en verwijderen via msiexec;
/// een Inno Setup-installatie (zoals Open Pointcloud Studio) herkent de aanroeper
/// aan de `_is1`-sleutel; alles anders komt bij deze tools van een NSIS-setup (Tauri).
#[cfg(windows)]
fn install_kind(windows_installer: Option<u32>, uninstall_string: Option<&str>, inno: bool) -> &'static str {
    let msiexec = uninstall_string
        .map(|u| u.to_ascii_lowercase().contains("msiexec"))
        .unwrap_or(false);
    if windows_installer == Some(1) || msiexec {
        "msi"
    } else if inno {
        "inno"
    } else {
        "nsis"
    }
}

/// Bepaal het exe-pad: DisplayIcon → InstallLocation + exe-naam → bekende mappen.
#[cfg(windows)]
fn resolve_exe(
    query: &ToolQuery,
    display_icon: Option<String>,
    install_location: Option<String>,
) -> Option<String> {
    use std::path::{Path, PathBuf};

    // DisplayIcon kan er zo uitzien: "C:\...\app.exe", soms met ",0"-suffix.
    if let Some(icon) = display_icon {
        let cleaned = icon
            .trim()
            .trim_matches('"')
            .rsplit_once(",")
            .map(|(p, idx)| {
                if idx.trim().chars().all(|c| c.is_ascii_digit()) {
                    p.to_string()
                } else {
                    icon.trim().trim_matches('"').to_string()
                }
            })
            .unwrap_or_else(|| icon.trim().trim_matches('"').to_string());
        let cleaned = cleaned.trim().trim_matches('"');
        if cleaned.to_ascii_lowercase().ends_with(".exe") && Path::new(cleaned).exists() {
            return Some(cleaned.to_string());
        }
    }

    let exe_name = query.exe_name.as_deref()?;

    if let Some(loc) = install_location {
        let loc = loc.trim().trim_matches('"');
        if !loc.is_empty() {
            let candidate = Path::new(loc).join(exe_name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }

    // Best-effort zoeken op gebruikelijke installatiepaden.
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(&local));
        roots.push(PathBuf::from(&local).join("Programs"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        roots.push(PathBuf::from(pf));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        roots.push(PathBuf::from(pf86));
    }

    let exe_stem = exe_name.trim_end_matches(".exe");
    for root in roots {
        for folder in [&query.display_name, &exe_stem.to_string()] {
            let candidate = root.join(folder).join(exe_name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }

    None
}

#[cfg(target_os = "linux")]
pub fn scan(queries: &[ToolQuery]) -> Vec<InstalledTool> {
    crate::linux::scan(queries)
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn scan(_queries: &[ToolQuery]) -> Vec<InstalledTool> {
    Vec::new()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn recognises_msi_and_nsis_installations() {
        assert_eq!(install_kind(Some(1), Some("MsiExec.exe /I{B839249A-32F4-404D-A4E8-D9D35E9E9E48}"), false), "msi");
        assert_eq!(install_kind(None, Some("MsiExec.exe /X{B839249A}"), false), "msi");
        assert_eq!(install_kind(None, Some(r#""C:\Users\nino\AppData\Local\Programs\Open Pointcloud Studio\unins000.exe""#), true), "inno");
        assert_eq!(install_kind(None, Some(r#""C:\Users\nino\AppData\Local\Open Planner Studio\uninstall.exe""#), false), "nsis");
        assert_eq!(install_kind(None, None, false), "nsis");
    }
}
