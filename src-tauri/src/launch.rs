//! Opstartopdrachten en statusbestand (stap 3 van het voorstel, OpenAEC-Blueprint#33).
//!
//! - `--update <id>` opent de installer en werkt die tool meteen bij. Apps roepen
//!   dit aan via de knop Bijwerken (`openaec_ui::design::update::open_installer`).
//! - `--check` kijkt zonder venster of er updates zijn, schrijft het
//!   statusbestand en sluit af.
//! - Er draait maar één installer tegelijk. Een tweede start geeft zijn opdracht
//!   door aan de eerste (via `opdracht.json`) en haalt dat venster naar voren.
//! - Na elke controle schrijft de installer `updates.json`: per tool de nieuwste
//!   versie en de releasepagina. Apps lezen dat bij het starten
//!   (`openaec_ui::design::update::check_installed`).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Wat de installer bij het starten moet doen.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    /// Deze tool meteen bijwerken (catalogus-id, zoals `open-calc-studio`).
    pub update: Option<String>,
    /// Alleen controleren, statusbestand schrijven en afsluiten.
    pub check: bool,
}

impl LaunchRequest {
    pub fn from_args<I: IntoIterator<Item = String>>(args: I) -> Self {
        let mut request = Self::default();
        let mut args = args.into_iter().skip(1).peekable();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--update" => request.update = args.next_if(|id| !id.starts_with("--")),
                "--check" => request.check = true,
                _ => {}
            }
        }
        request
    }

    pub fn is_empty(&self) -> bool {
        self.update.is_none() && !self.check
    }
}

/// De opdracht van deze start, één keer op te halen door de frontend.
static STARTUP: Mutex<Option<LaunchRequest>> = Mutex::new(None);

pub fn set_startup(request: LaunchRequest) {
    *STARTUP.lock().unwrap_or_else(|e| e.into_inner()) = Some(request);
}

/// De map van de installer: `%LOCALAPPDATA%\OpenAEC\installer` op Windows,
/// dezelfde plek als waar `openaec_ui::design::update::status_path` zoekt.
pub fn state_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("OpenAEC"))
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support/OpenAEC"))
    } else {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state")))
            .map(|d| d.join("openaec"))
    };
    base.map(|b| b.join("installer"))
}

fn forwarded_path() -> Option<PathBuf> {
    state_dir().map(|d| d.join("opdracht.json"))
}

/// De opdracht van deze start (eenmalig), anders een doorgegeven opdracht van
/// een tweede start.
pub fn take() -> Option<LaunchRequest> {
    if let Some(request) = STARTUP.lock().unwrap_or_else(|e| e.into_inner()).take() {
        if !request.is_empty() {
            return Some(request);
        }
    }
    let path = forwarded_path()?;
    let text = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    serde_json::from_str::<LaunchRequest>(&text).ok().filter(|r| !r.is_empty())
}

/// Geef een opdracht door aan de installer die al draait.
pub fn forward(request: &LaunchRequest) {
    if request.is_empty() {
        return;
    }
    if let Some(path) = forwarded_path() {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string(request) {
            let _ = std::fs::write(path, json);
        }
    }
}

/// Eén regel in het statusbestand.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppStatus {
    pub latest: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct StatusFile<'a> {
    checked: String,
    installer: Option<PathBuf>,
    apps: &'a BTreeMap<String, AppStatus>,
}

/// Schrijf `updates.json` (via een tijdelijk bestand, zodat een app nooit een
/// half bestand leest).
pub fn write_status(apps: &BTreeMap<String, AppStatus>) -> Result<PathBuf, String> {
    let dir = state_dir().ok_or("geen map voor de status")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = StatusFile { checked: rfc3339(SystemTime::now()), installer: std::env::current_exe().ok(), apps };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = dir.join("updates.json");
    let temporary = dir.join("updates.json.tmp");
    std::fs::write(&temporary, json).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Tijd als `2026-10-29T18:00:00Z`.
fn rfc3339(time: SystemTime) -> String {
    let secs = time.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rest) = (secs / 86_400, secs % 86_400);
    // Burgerlijke datum uit dagen sinds 1970 (Howard Hinnant).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rest / 3600, rest % 3600 / 60, rest % 60)
}

/// Eén installer tegelijk (Windows). Draait er al een, dan geeft deze start zijn
/// opdracht door, haalt het bestaande venster naar voren en geeft `false`.
#[cfg(windows)]
pub fn claim_single_instance(request: &LaunchRequest) -> bool {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE};

    let name: Vec<u16> = "Local\\OpenAEC-Installer\0".encode_utf16().collect();
    // De mutex blijft bestaan tot het proces stopt; bewust niet gesloten.
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() || unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        return true;
    }
    forward(request);
    let title: Vec<u16> = "OpenAEC Installer\0".encode_utf16().collect();
    let window = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    if !window.is_null() {
        unsafe {
            ShowWindow(window, SW_RESTORE);
            SetForegroundWindow(window);
        }
    }
    false
}

#[cfg(not(windows))]
pub fn claim_single_instance(_request: &LaunchRequest) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> LaunchRequest {
        LaunchRequest::from_args(std::iter::once("installer").chain(list.iter().copied()).map(String::from))
    }

    #[test]
    fn reads_the_arguments() {
        assert_eq!(args(&[]), LaunchRequest::default());
        assert_eq!(args(&["--update", "open-calc-studio"]).update.as_deref(), Some("open-calc-studio"));
        assert!(args(&["--check"]).check);
        assert_eq!(args(&["--update"]).update, None);
        assert_eq!(args(&["--update", "--check"]), LaunchRequest { update: None, check: true });
    }

    #[test]
    fn writes_utc_times() {
        assert_eq!(rfc3339(UNIX_EPOCH), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(UNIX_EPOCH + std::time::Duration::from_secs(1_793_286_000)), "2026-10-29T15:00:00Z");
    }

    #[test]
    fn status_matches_the_library_contract() {
        let mut apps = BTreeMap::new();
        apps.insert("open-calc-studio".to_string(), AppStatus { latest: "2026.44.1".into(), page_url: Some("https://github.com/x".into()) });
        let json = serde_json::to_value(StatusFile { checked: "2026-10-29T15:00:00Z".into(), installer: Some(PathBuf::from("C:/i.exe")), apps: &apps }).unwrap();
        assert_eq!(json["apps"]["open-calc-studio"]["latest"], "2026.44.1");
        assert_eq!(json["apps"]["open-calc-studio"]["page_url"], "https://github.com/x");
        assert!(json["installer"].is_string() && json["checked"].is_string());
    }
}
