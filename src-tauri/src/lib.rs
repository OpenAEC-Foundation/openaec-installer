mod github;
mod installer;
#[cfg(target_os = "linux")]
mod linux;
mod manifest;
mod registry;
mod signature;

/// Scan op geïnstalleerde OpenAEC-tools (Windows-register / Linux-appmap).
#[tauri::command]
fn get_installed_tools(queries: Vec<registry::ToolQuery>) -> Vec<registry::InstalledTool> {
    registry::scan(&queries)
}

/// Haal parallel de laatste GitHub-release op voor elke repo.
#[tauri::command]
async fn get_latest_releases(repos: Vec<github::RepoRef>) -> Vec<github::ReleaseInfo> {
    github::fetch_all(repos).await
}

/// Download een installer-asset naar temp en installeer hem op de manier die
/// bij het platform past (Windows: setup starten; Linux: AppImage plaatsen).
/// Met `pubkey` moet `signature` kloppen, anders wordt er niets geïnstalleerd.
#[tauri::command]
async fn download_and_run_installer(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
    display_name: Option<String>,
    signature: Option<String>,
    pubkey: Option<String>,
) -> Result<installer::InstallOutcome, String> {
    installer::download_and_run(app, id, url, file_name, display_name, signature, pubkey).await
}

/// Werk een geïnstalleerde tool stil bij met dezelfde soort setup (`kind`),
/// na het sluiten door de gebruiker, en start hem daarna opnieuw als hij
/// openstond. Fasen gaan als `update-phase`-events naar de frontend.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn update_tool(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
    display_name: Option<String>,
    signature: Option<String>,
    pubkey: Option<String>,
    kind: String,
    exe_path: Option<String>,
) -> Result<installer::UpdateOutcome, String> {
    installer::update(app, id, url, file_name, display_name, signature, pubkey, kind, exe_path).await
}

/// Stop het wachten tot een tool gesloten is.
#[tauri::command]
fn cancel_update(id: String) {
    installer::cancel(&id)
}

/// Start een geïnstalleerde tool.
#[tauri::command]
fn launch_tool(exe_path: String) -> Result<(), String> {
    installer::launch(&exe_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_installed_tools,
            get_latest_releases,
            download_and_run_installer,
            update_tool,
            cancel_update,
            launch_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
