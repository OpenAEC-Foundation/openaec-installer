//! Installer-assets downloaden (met voortgang-events) en installeren,
//! en geïnstalleerde tools opstarten.
//!
//! Windows: de gedownloade setup wordt gestart en de gebruiker doorloopt de
//! setup-UI. Linux: de AppImage wordt direct geïnstalleerd (zie `linux.rs`);
//! er is geen setup-UI. Het verschil wordt via `InstallOutcome.mode` aan de
//! frontend doorgegeven zodat die de juiste melding toont.
//!
//! Heeft de tool een publieke sleutel in de catalogus, dan loopt de controle
//! van de handtekening mee met het downloaden (zie `signature.rs`). Ontbreekt
//! de handtekening of klopt hij niet, dan wordt er niets gestart. Een
//! `.nsis.zip` (het oudere updateformaat van Tauri) wordt na die controle
//! uitgepakt tot de setup die erin zit.

use serde::Serialize;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub path: String,
    /// "ranInstaller" — setup-UI gestart (Windows);
    /// "installed" — direct geïnstalleerd, klaar voor gebruik (Linux);
    /// "selfReplaced" — eigen AppImage vervangen, herstart nodig (Linux).
    pub mode: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    done: bool,
}

/// Download het asset naar de tempmap en installeer het daarna op de manier
/// die bij het platform past.
pub async fn download_and_run(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
    display_name: Option<String>,
    signature: Option<String>,
    pubkey: Option<String>,
) -> Result<InstallOutcome, String> {
    // Alleen GitHub release-assets toestaan.
    if !url.starts_with("https://github.com/") {
        return Err("Alleen downloads vanaf github.com zijn toegestaan.".into());
    }
    // Geen padscheiders in de bestandsnaam.
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }
    // Een tool met sleutel installeert alleen met een kloppende handtekening.
    let check = match (pubkey.as_deref(), signature.as_deref()) {
        (Some(key), Some(sig)) => Some(crate::signature::Check::new(key, sig)?),
        (Some(_), None) => {
            return Err("Deze release heeft geen handtekening; er is niets gedownload of geïnstalleerd.".into())
        }
        (None, _) => None,
    };
    let mut verifier = check.as_ref().map(|c| c.verifier()).transpose()?;

    let dir = std::env::temp_dir().join("openaec-installer");
    std::fs::create_dir_all(&dir).map_err(|e| format!("tempmap: {e}"))?;
    let target = dir.join(&file_name);

    let client = reqwest::Client::builder()
        .user_agent("OpenAEC-Installer")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download: {e}"))?;

    let total = resp.content_length();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut file = std::fs::File::create(&target).map_err(|e| format!("bestand: {e}"))?;

    use futures_util::StreamExt;
    use std::io::Write;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download: {e}"))?;
        file.write_all(&chunk).map_err(|e| format!("bestand: {e}"))?;
        if let Some(v) = verifier.as_mut() {
            v.update(&chunk);
        }
        downloaded += chunk.len() as u64;
        // Niet elke chunk een event — throttle op 512 kB.
        if downloaded - last_emit >= 512 * 1024 {
            last_emit = downloaded;
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    id: id.clone(),
                    downloaded,
                    total,
                    done: false,
                },
            );
        }
    }
    drop(file);

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: id.clone(),
            downloaded,
            total,
            done: true,
        },
    );

    if let Some(mut v) = verifier {
        if v.finalize().is_err() {
            let _ = std::fs::remove_file(&target);
            return Err("De handtekening klopt niet; het bestand is verwijderd en er is niets geïnstalleerd.".into());
        }
    }

    let target = if file_name.to_ascii_lowercase().ends_with(".nsis.zip") {
        unpack_setup(&target, &dir)?
    } else {
        target
    };

    let mode = run_installer(&id, display_name.as_deref(), &target)?;
    Ok(InstallOutcome {
        path: target.to_string_lossy().into_owned(),
        mode,
    })
}

/// Haal de setup uit een `.nsis.zip`: precies één `.exe` in de hoofdmap.
#[cfg(windows)]
fn unpack_setup(
    zip_path: &std::path::Path,
    dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("uitpakken: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("uitpakken: {e}"))?;
    let names = archive
        .file_names()
        .map(|n| n.map(|n| n.into_owned()))
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| format!("uitpakken: {e}"))?;
    let setups: Vec<String> = names
        .into_iter()
        .filter(|n| n.to_ascii_lowercase().ends_with(".exe"))
        .collect();
    let [name] = setups.as_slice() else {
        return Err("uitpakken: verwacht precies één setup in het zip-bestand".into());
    };
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("uitpakken: ongeldige bestandsnaam in het zip-bestand".into());
    }
    let out = dir.join(name);
    let mut entry = archive.by_name(name).map_err(|e| format!("uitpakken: {e}"))?;
    let mut dest = std::fs::File::create(&out).map_err(|e| format!("uitpakken: {e}"))?;
    std::io::copy(&mut entry, &mut dest).map_err(|e| format!("uitpakken: {e}"))?;
    Ok(out)
}

#[cfg(not(windows))]
fn unpack_setup(
    _zip_path: &std::path::Path,
    _dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    Err("Een .nsis.zip is alleen voor Windows.".into())
}

#[cfg(windows)]
fn run_installer(
    _id: &str,
    _display_name: Option<&str>,
    path: &std::path::Path,
) -> Result<&'static str, String> {
    let is_msi = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("msi"))
        .unwrap_or(false);
    if is_msi {
        // msiexec vraagt zelf om elevatie voor een perMachine-installatie.
        shell_execute("msiexec.exe", Some(&format!("/i \"{}\"", path.display())))?;
    } else {
        // Direct starten via CreateProcess (std::process::Command) faalt met
        // "os error 740" (ERROR_ELEVATION_REQUIRED) zodra de installer
        // beheerdersrechten vereist — CreateProcess kan niet eleveren.
        // ShellExecuteW honoreert het uitvoerbaar-manifest en toont zo nodig
        // de UAC-prompt (net als dubbelklikken in Verkenner).
        shell_execute(&path.to_string_lossy(), None)?;
    }
    Ok("ranInstaller")
}

/// Start een bestand via de Windows-shell (ShellExecuteW). Met een leeg werkwoord
/// gebruikt Windows de standaardactie ("open") en wordt het programma zo nodig
/// geëleveerd volgens zijn manifest.
#[cfg(windows)]
fn shell_execute(file: &str, params: Option<&str>) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let file_w = wide(file);
    let params_w = params.map(wide);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),                                     // geen ouder-venster
            std::ptr::null(),                                        // standaardwerkwoord ("open")
            file_w.as_ptr(),
            params_w.as_ref().map_or(std::ptr::null(), |p| p.as_ptr()),
            std::ptr::null(),                                        // standaard-werkmap
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW geeft een pseudo-HINSTANCE > 32 terug bij succes.
    let code = result as isize;
    if code > 32 {
        Ok(())
    } else {
        // 1223 = ERROR_CANCELLED (UAC geweigerd), 5 = SE_ERR_ACCESSDENIED.
        let msg = match code {
            5 | 1223 => "installatie geannuleerd (geen beheerdersrechten gegeven)".to_string(),
            other => format!("installer starten (code {other})"),
        };
        Err(msg)
    }
}

#[cfg(target_os = "linux")]
fn run_installer(
    id: &str,
    display_name: Option<&str>,
    path: &std::path::Path,
) -> Result<&'static str, String> {
    let is_appimage = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("appimage"))
        .unwrap_or(false);
    if !is_appimage {
        return Err("Geen ondersteund installatiebestand voor Linux (AppImage verwacht).".into());
    }
    if id == "openaec-installer" {
        // Zelf-update: vervang de draaiende AppImage; herstart daarna.
        crate::linux::self_update(path)?;
        Ok("selfReplaced")
    } else {
        crate::linux::install_appimage(id, display_name.unwrap_or(id), path)?;
        Ok("installed")
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
fn run_installer(
    _id: &str,
    _display_name: Option<&str>,
    _path: &std::path::Path,
) -> Result<&'static str, String> {
    Err("Installeren wordt op dit platform nog niet ondersteund.".into())
}

/// Start een geïnstalleerde tool.
#[cfg(windows)]
pub fn launch(exe_path: &str) -> Result<(), String> {
    let path = std::path::Path::new(exe_path);
    if !path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false)
        || !path.exists()
    {
        return Err("Programma niet gevonden.".into());
    }
    let mut cmd = std::process::Command::new(path);
    if let Some(parent) = path.parent() {
        cmd.current_dir(parent);
    }
    cmd.spawn().map_err(|e| format!("starten: {e}"))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn launch(exe_path: &str) -> Result<(), String> {
    crate::linux::launch(exe_path)
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn launch(_exe_path: &str) -> Result<(), String> {
    Err("Starten wordt op dit platform nog niet ondersteund.".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_with(dir: &std::path::Path, entries: &[(&str, &[u8])]) -> std::path::PathBuf {
        let path = dir.join("test.nsis.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for (name, data) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
        path
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("openaec-installer-test-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn unpacks_the_single_setup() {
        let dir = temp_dir("ok");
        let zip = zip_with(&dir, &[("Open Planner Studio_2026.43.0_x64-setup.exe", b"MZ setup")]);
        let out = unpack_setup(&zip, &dir).unwrap();
        assert_eq!(out.file_name().unwrap(), "Open Planner Studio_2026.43.0_x64-setup.exe");
        assert_eq!(std::fs::read(&out).unwrap(), b"MZ setup");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_zero_two_or_nested_setups() {
        let dir = temp_dir("bad");
        let none = zip_with(&dir, &[("readme.txt", b"x")]);
        assert!(unpack_setup(&none, &dir).is_err());
        let two = zip_with(&dir, &[("a-setup.exe", b"a"), ("b-setup.exe", b"b")]);
        assert!(unpack_setup(&two, &dir).is_err());
        let nested = zip_with(&dir, &[("../evil-setup.exe", b"x")]);
        assert!(unpack_setup(&nested, &dir).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
