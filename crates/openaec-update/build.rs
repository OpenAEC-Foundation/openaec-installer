// The plugin's commands, for the Tauri 2 permissions: an app allows them with
// "openaec-update:default" in its capabilities.
const COMMANDS: &[&str] = &["installer_present", "check", "update_now"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
