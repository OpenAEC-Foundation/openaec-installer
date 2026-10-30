//! The Tauri plugin: `installer_present`, `check` and `update_now`, and at start
//! a check by the installer in the background when its status file is older
//! than a day.
use crate::{check_installed, find_installer, open_installer, refresh_if_stale, Available};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime, State};

/// The app's catalogue id in the installer, such as `open-planner-studio`.
struct AppId(&'static str);

/// The plugin for the app with catalogue id `app_id`, the id in the
/// installer's catalogue (`src/data/catalog.ts`).
pub fn init<R: Runtime>(app_id: &'static str) -> TauriPlugin<R> {
    Builder::<R>::new("openaec-update")
        .invoke_handler(tauri::generate_handler![installer_present, check, update_now])
        .setup(move |app, _api| {
            app.manage(AppId(app_id));
            std::thread::spawn(refresh_if_stale);
            Ok(())
        })
        .build()
}

fn available<R: Runtime>(app: &AppHandle<R>, id: &AppId) -> Option<Available> {
    check_installed(id.0, &app.package_info().version.to_string())
}

/// Whether the OpenAEC Installer is on this computer. Without it an app keeps
/// its own way of updating, so nobody is left without updates.
#[tauri::command]
fn installer_present() -> bool {
    find_installer().is_some()
}

/// The newer version that is ready for this app, or `null`.
#[tauri::command]
fn check<R: Runtime>(app: AppHandle<R>, id: State<'_, AppId>) -> Option<Available> {
    available(&app, &id)
}

/// Opens the installer on this app's update and closes the app; call it after
/// the app's close plan. Without an installer the release page opens in the
/// browser and the app stays open.
#[tauri::command]
fn update_now<R: Runtime>(app: AppHandle<R>, id: State<'_, AppId>) -> Result<(), String> {
    let available = available(&app, &id).ok_or("Er staat geen nieuwe versie klaar.")?;
    let via_installer = available.installer.as_ref().is_some_and(|p| p.is_file());
    open_installer(&available)?;
    if via_installer {
        app.exit(0);
    }
    Ok(())
}
