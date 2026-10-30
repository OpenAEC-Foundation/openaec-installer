//! Updates through the OpenAEC Installer for Tauri apps (OpenAEC-Blueprint#33).
//!
//! The installer is the one place for updates: an app does not go online and
//! installs nothing itself. It reads the installer's status file, shows in its
//! title bar that a newer version is ready, and "Bijwerken" closes the app and
//! hands the update to the installer, which updates silently in the same kind
//! of setup and starts the app again.
//!
//! In the app:
//!
//! ```ignore
//! tauri::Builder::default()
//!     .plugin(openaec_update::init("open-planner-studio"))
//! ```
//!
//! with `"openaec-update:default"` in the capabilities, and in the frontend:
//!
//! ```js
//! if (await invoke("plugin:openaec-update|installer_present")) {
//!   const available = await invoke("plugin:openaec-update|check"); // null or { latest, current, … }
//!   // After the close plan (save or discard changes):
//!   await invoke("plugin:openaec-update|update_now");
//! }
//! ```
//!
//! Without the installer (`installer_present` is false), and on platforms the
//! installer cannot update yet (macOS, .deb and .rpm), an app keeps its own
//! updater.
//!
//! The contract in `update_core.rs` is the same file as
//! `openaec_ui::design::update` in OpenAEC-Blueprint, copied by
//! `scripts/sync-openaec.mjs`; change it there.

#[allow(dead_code)]
mod update_core;
pub use update_core::*;

#[cfg(feature = "tauri")]
mod plugin;
#[cfg(feature = "tauri")]
pub use plugin::init;
