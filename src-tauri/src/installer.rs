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
    use std::process::Command;
    let is_msi = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("msi"))
        .unwrap_or(false);
    if is_msi {
        Command::new("msiexec")
            .arg("/i")
            .arg(path)
            .spawn()
            .map_err(|e| format!("msiexec: {e}"))?;
    } else {
        Command::new(path)
            .spawn()
            .map_err(|e| format!("installer starten: {e}"))?;
    }
    Ok(())
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
