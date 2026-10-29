//! Installer-assets downloaden (met voortgang-events) en installeren,
//! en geïnstalleerde tools opstarten.
//!
//! Windows: bij een nieuwe installatie wordt de gedownloade setup gestart en
//! doorloopt de gebruiker de setup-UI. Een update (`update`) draait stil, met
//! dezelfde soort setup als de bestaande installatie, nadat de gebruiker de
//! tool zelf heeft gesloten, en zet hem daarna weer aan. Linux: de AppImage wordt direct geïnstalleerd (zie `linux.rs`);
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
    let target = download_verified(&app, &id, &url, &file_name, signature, pubkey).await?;
    let mode = run_installer(&id, display_name.as_deref(), &target)?;
    Ok(InstallOutcome {
        path: target.to_string_lossy().into_owned(),
        mode,
    })
}

/// Download met voortgang naar de tempmap, met de controle van de
/// handtekening onderweg. Geeft het pad van de uitvoerbare setup terug (een
/// `.nsis.zip` is dan al uitgepakt).
async fn download_verified(
    app: &tauri::AppHandle,
    id: &str,
    url: &str,
    file_name: &str,
    signature: Option<String>,
    pubkey: Option<String>,
) -> Result<std::path::PathBuf, String> {
    // Alleen GitHub release-assets toestaan.
    if !url.starts_with("https://github.com/") {
        return Err("Alleen downloads vanaf github.com zijn toegestaan.".into());
    }
    // Geen padscheiders in de bestandsnaam.
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("OpenAEC-Installer")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // Een tool met sleutel installeert alleen met een kloppende handtekening.
    // Via de API-route komt die uit de `.sig` naast het asset.
    let signature = match (&pubkey, signature) {
        (Some(_), None) => fetch_signature(&client, &format!("{url}.sig")).await,
        (_, signature) => signature,
    };
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
    let target = dir.join(file_name);

    let resp = client
        .get(url)
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
                    id: id.to_string(),
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
            id: id.to_string(),
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

    if file_name.to_ascii_lowercase().ends_with(".nsis.zip") {
        unpack_setup(&target, &dir)
    } else {
        Ok(target)
    }
}

/// Een `.sig` is een gewone download (geen API-aanroep). Ontbreekt hij, dan
/// blijft de handtekening leeg en weigert de installatie.
async fn fetch_signature(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?.error_for_status().ok()?;
    let text = resp.text().await.ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOutcome {
    /// "updated" — stil bijgewerkt (Windows);
    /// "installed" — AppImage vervangen (Linux).
    pub mode: &'static str,
    /// De tool draaide voor de update en is daarna weer gestart.
    pub relaunched: bool,
    /// msiexec meldde dat Windows opnieuw moet opstarten (code 3010).
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePhase {
    id: String,
    /// "waiting" — wacht tot de gebruiker de tool sluit;
    /// "installing" — de setup draait stil.
    phase: &'static str,
}

/// Werk een geïnstalleerde tool bij met een setup van dezelfde soort
/// (`kind`: "nsis", "nsisUser" of "msi"; "appimage" op Linux).
///
/// Volgorde: eerst downloaden en controleren terwijl de tool gewoon openblijft.
/// Draait hij, dan wacht de installer tot de gebruiker hem zelf sluit: een
/// stille Tauri-setup zou hem anders geforceerd afsluiten, en dan gaat niet
/// opgeslagen werk verloren. Daarna draait de setup stil in updatemodus, en
/// een tool die openstond gaat weer open.
#[allow(clippy::too_many_arguments)]
pub async fn update(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
    display_name: Option<String>,
    signature: Option<String>,
    pubkey: Option<String>,
    kind: String,
    exe_path: Option<String>,
) -> Result<UpdateOutcome, String> {
    clear_cancel(&id);
    let setup = download_verified(&app, &id, &url, &file_name, signature, pubkey).await?;

    if kind == "appimage" {
        // Een draaiende AppImage mag vervangen worden: het proces houdt het
        // oude bestand vast tot het stopt.
        let mode = run_installer(&id, display_name.as_deref(), &setup)?;
        return Ok(UpdateOutcome { mode, relaunched: false, restart_required: false });
    }

    let silent = silent_command(&kind, &setup)?;
    let exe = exe_path.filter(|p| std::path::Path::new(p).is_file());
    let was_running = exe.as_deref().is_some_and(process::is_running);

    if was_running {
        let _ = app.emit("update-phase", UpdatePhase { id: id.clone(), phase: "waiting" });
        let (wait_id, wait_exe) = (id.clone(), exe.clone().unwrap_or_default());
        tauri::async_runtime::spawn_blocking(move || wait_until_closed(&wait_id, &wait_exe))
            .await
            .map_err(|e| format!("wachten: {e}"))??;
    }

    let _ = app.emit("update-phase", UpdatePhase { id: id.clone(), phase: "installing" });
    let code = tauri::async_runtime::spawn_blocking(move || process::run_and_wait(&silent.0, &silent.1))
        .await
        .map_err(|e| format!("setup: {e}"))??;
    let restart_required = setup_result(&kind, code)?;

    let relaunched = was_running && exe.as_deref().is_some_and(|p| launch(p).is_ok());
    Ok(UpdateOutcome { mode: "updated", relaunched, restart_required })
}

/// Stop het wachten op het sluiten van een tool (knop "Annuleren").
pub fn cancel(id: &str) {
    let mut set = CANCELLED.lock().unwrap_or_else(|e| e.into_inner());
    if !set.iter().any(|c| c == id) {
        set.push(id.to_string());
    }
}

static CANCELLED: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn clear_cancel(id: &str) -> bool {
    let mut set = CANCELLED.lock().unwrap_or_else(|e| e.into_inner());
    let before = set.len();
    set.retain(|c| c != id);
    set.len() != before
}

fn wait_until_closed(id: &str, exe: &str) -> Result<(), String> {
    while process::is_running(exe) {
        if clear_cancel(id) {
            return Err("Bijwerken geannuleerd; de tool is niet gewijzigd.".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(700));
    }
    Ok(())
}

/// Programma en argumenten voor een stille update.
///
/// NSIS (Tauri): `/S` stil, `/UPDATE` updatemodus (geen WebView2-installatie,
/// app-gegevens en autostart blijven staan); zonder `/R`, want het opnieuw
/// starten doet de installer zelf. MSI: `/passive` toont alleen een
/// voortgangsbalk, `/norestart` laat het herstarten van Windows aan de gebruiker.
/// Inno Setup: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART`, met `/CURRENTUSER` of
/// `/ALLUSERS` zodat de update in dezelfde modus en map landt als de installatie.
fn silent_command(kind: &str, setup: &std::path::Path) -> Result<(String, String), String> {
    let ext = setup
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match (kind, ext.as_str()) {
        ("nsis" | "nsisUser", "exe") => Ok((setup.to_string_lossy().into_owned(), "/S /UPDATE".into())),
        ("innoUser", "exe") => Ok((setup.to_string_lossy().into_owned(), "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER".into())),
        ("inno", "exe") => Ok((setup.to_string_lossy().into_owned(), "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /ALLUSERS".into())),
        ("msi", "msi") => {
            let msiexec = std::env::var("SYSTEMROOT")
                .map(|r| format!(r"{r}\System32\msiexec.exe"))
                .unwrap_or_else(|_| "msiexec.exe".into());
            Ok((msiexec, format!("/i \"{}\" /passive /norestart", setup.display())))
        }
        _ => Err(format!("De setup ({}) past niet bij deze installatie ({kind}).", setup.display())),
    }
}

/// Exitcode van de setup naar een oordeel; `Ok(true)` als Windows opnieuw moet
/// opstarten om het af te ronden.
fn setup_result(kind: &str, code: u32) -> Result<bool, String> {
    match (kind, code) {
        (_, 0) => Ok(false),
        ("msi", 3010) | ("msi", 1641) => Ok(true),
        ("msi", 1602) | ("nsis" | "nsisUser", 1) | ("inno" | "innoUser", 2 | 5) => Err("De setup is geannuleerd.".into()),
        ("msi", 1618) => Err("Er loopt al een andere installatie; probeer het straks opnieuw.".into()),
        (_, code) => Err(format!("De setup stopte met code {code}.")),
    }
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

/// Processen: draait een tool nog, en een setup starten en op het einde wachten.
#[cfg(windows)]
mod process {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject, INFINITE,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    fn from_wide(buf: &[u16]) -> String {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    }

    /// Draait er een proces vanaf precies dit exe-bestand? Eerst op naam, dan
    /// op het volledige pad. Is het pad niet op te vragen (een proces met
    /// meer rechten), dan telt de naam: liever te lang wachten dan een tool
    /// met open werk laten afsluiten.
    pub fn is_running(exe: &str) -> bool {
        let path = std::path::Path::new(exe);
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_lowercase()) else {
            return false;
        };
        let wanted = exe.to_lowercase();
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return false;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut found = false;
            let mut ok = Process32FirstW(snapshot, &mut entry) != 0;
            while ok && !found {
                if from_wide(&entry.szExeFile).to_lowercase() == name {
                    found = match full_path(entry.th32ProcessID) {
                        Some(p) => p.to_lowercase() == wanted,
                        None => true,
                    };
                }
                ok = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
            found
        }
    }

    fn full_path(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0;
            CloseHandle(handle);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    /// Start `file` via de Windows-shell (zo nodig met UAC-vraag, volgens het
    /// manifest van de setup) en wacht tot het proces klaar is.
    pub fn run_and_wait(file: &str, params: &str) -> Result<u32, String> {
        let file_w = wide(file);
        let params_w = wide(params);
        unsafe {
            let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS;
            info.lpFile = file_w.as_ptr();
            info.lpParameters = params_w.as_ptr();
            info.nShow = SW_SHOWNORMAL;
            if ShellExecuteExW(&mut info) == 0 {
                return Err(match GetLastError() {
                    // ERROR_CANCELLED: de UAC-vraag is geweigerd.
                    1223 => "bijwerken geannuleerd (geen beheerdersrechten gegeven)".to_string(),
                    code => format!("setup starten (code {code})"),
                });
            }
            if info.hProcess.is_null() {
                return Err("setup starten: geen proces".into());
            }
            WaitForSingleObject(info.hProcess, INFINITE);
            let mut code = 0u32;
            let ok = GetExitCodeProcess(info.hProcess, &mut code) != 0;
            CloseHandle(info.hProcess);
            if ok {
                Ok(code)
            } else {
                Err("setup: geen exitcode".into())
            }
        }
    }
}

#[cfg(not(windows))]
mod process {
    pub fn is_running(_exe: &str) -> bool {
        false
    }

    pub fn run_and_wait(_file: &str, _params: &str) -> Result<u32, String> {
        Err("Stil bijwerken kan alleen op Windows.".into())
    }
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

#[cfg(test)]
mod update_tests {
    use super::*;

    #[test]
    fn silent_arguments_follow_the_kind_of_setup() {
        let exe = std::path::Path::new(r"C:\Temp\Open Planner Studio_2026.43.0_x64-setup.exe");
        let msi = std::path::Path::new(r"C:\Temp\App_1.0.0_x64_en-US.msi");
        assert_eq!(silent_command("nsis", exe).unwrap().1, "/S /UPDATE");
        assert_eq!(silent_command("nsisUser", exe).unwrap().1, "/S /UPDATE");
        assert_eq!(silent_command("innoUser", exe).unwrap().1, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER");
        assert_eq!(silent_command("inno", exe).unwrap().1, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /ALLUSERS");
        assert!(silent_command("inno", msi).is_err());
        let (prog, args) = silent_command("msi", msi).unwrap();
        assert!(prog.to_ascii_lowercase().ends_with("msiexec.exe"));
        assert_eq!(args, r#"/i "C:\Temp\App_1.0.0_x64_en-US.msi" /passive /norestart"#);
        // Een MSI-installatie nooit met een NSIS-setup bijwerken, en andersom.
        assert!(silent_command("msi", exe).is_err());
        assert!(silent_command("nsis", msi).is_err());
    }

    #[test]
    fn exit_codes_become_a_verdict() {
        assert_eq!(setup_result("nsis", 0), Ok(false));
        assert_eq!(setup_result("msi", 3010), Ok(true));
        assert!(setup_result("nsis", 1).unwrap_err().contains("geannuleerd"));
        assert!(setup_result("msi", 1602).unwrap_err().contains("geannuleerd"));
        assert!(setup_result("msi", 1603).unwrap_err().contains("1603"));
    }

    #[test]
    fn cancel_is_used_once() {
        cancel("test-tool");
        assert!(clear_cancel("test-tool"));
        assert!(!clear_cancel("test-tool"));
    }
}

#[cfg(all(test, windows))]
mod process_tests {
    #[test]
    fn sees_a_running_exe_by_its_full_path() {
        let me = std::env::current_exe().unwrap();
        assert!(super::process::is_running(&me.to_string_lossy()));
        // Zelfde bestandsnaam, andere map: geen treffer.
        let elsewhere = std::env::temp_dir().join(me.file_name().unwrap());
        assert!(!super::process::is_running(&elsewhere.to_string_lossy()));
    }
}
