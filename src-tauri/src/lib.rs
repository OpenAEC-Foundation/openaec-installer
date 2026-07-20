mod github;
mod installer;
#[cfg(target_os = "linux")]
mod linux;
mod registry;

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
#[tauri::command]
async fn download_and_run_installer(
    app: tauri::AppHandle,
    id: String,
    url: String,
    file_name: String,
    display_name: Option<String>,
) -> Result<installer::InstallOutcome, String> {
    installer::download_and_run(app, id, url, file_name, display_name).await
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
            launch_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
