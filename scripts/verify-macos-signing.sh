#!/usr/bin/env bash
set -euo pipefail

bundle_dir=src-tauri/target/universal-apple-darwin/release/bundle/dmg
shopt -s nullglob
images=("$bundle_dir"/*.dmg)
test "${#images[@]}" -eq 1
codesign --verify --strict --verbose=2 "${images[0]}"

mount_dir=$(mktemp -d)
verify_dir="$RUNNER_TEMP/verify-openaec-app"
cleanup() {
    if mount | grep -Fq " on $mount_dir "; then
        hdiutil detach "$mount_dir"
    fi
    rm -rf "$mount_dir" "$verify_dir"
}
trap cleanup EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "${images[0]}"
apps=("$mount_dir"/*.app)
test "${#apps[@]}" -eq 1
mkdir -p "$verify_dir"
ditto "${apps[0]}" "$verify_dir/OpenAEC Installer.app"
hdiutil detach "$mount_dir"

app="$verify_dir/OpenAEC Installer.app"
codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose=4 "$app"
xcrun stapler validate "$app"
