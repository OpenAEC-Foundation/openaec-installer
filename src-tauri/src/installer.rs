//! Installer-assets downloaden (met voortgang-events) en starten,
//! en geïnstalleerde tools opstarten.

use serde::Serialize;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    done: bool,
}

/// Download het asset naar %TEMP%\openaec-installer\ en start daarna de
/// installer. De gebruiker doorloopt zelf de setup-UI van de tool.
pub async fn download_and_run(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
) -> Result<String, String> {
    // Alleen GitHub release-assets toestaan.
    if !url.starts_with("https://github.com/") {
        return Err("Alleen downloads vanaf github.com zijn toegestaan.".into());
    }
    // Geen padscheiders in de bestandsnaam.
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }

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

    run_installer(&target)?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    let is_msi = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("msi"))
        .unwrap_or(false);
    if is_msi {
        // msiexec vraagt zelf om elevatie voor een perMachine-installatie.
        shell_execute("msiexec.exe", Some(&format!("/i \"{}\"", path.display())))
    } else {
        // Direct starten via CreateProcess (std::process::Command) faalt met
        // "os error 740" (ERROR_ELEVATION_REQUIRED) zodra de installer
        // beheerdersrechten vereist — CreateProcess kan niet eleveren.
        // ShellExecuteW honoreert het uitvoerbaar-manifest en toont zo nodig
        // de UAC-prompt (net als dubbelklikken in Verkenner).
        shell_execute(&path.to_string_lossy(), None)
    }
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

#[cfg(not(windows))]
fn run_installer(_path: &std::path::Path) -> Result<(), String> {
    Err("Installeren wordt momenteel alleen op Windows ondersteund.".into())
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

#[cfg(not(windows))]
pub fn launch(_exe_path: &str) -> Result<(), String> {
    Err("Starten wordt momenteel alleen op Windows ondersteund.".into())
}
