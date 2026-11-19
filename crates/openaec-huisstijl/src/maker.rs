// Copied from OpenAEC-Blueprint crates/openaec-huisstijl by scripts/sync-openaec.mjs; do not edit here.
//! The house style maker (docs/bedrijfshuisstijl.md): start from the example house style, change anything in
//! `brand.yaml`, add logos, fonts and stationery, and save it as a new folder that every OpenAEC tool can use.
//!
//! No interface; the OpenAEC Installer is the screen. A [`Draft`] is `brand.yaml` as a value plus the files next
//! to it. The order of the keys is kept, comments are not: a saved house style is a new file.
use crate::{folder_summary, safe_path, set_active, Installed};
use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// The house style of OpenAEC: what a report gets without a house style of a company, and the example a new house
/// style starts from.
pub const OPENAEC: [(&str, &[u8]); 8] = [
    ("brand.yaml", include_bytes!("../openaec/brand.yaml")),
    ("templates/constructie_rapport.yaml", include_bytes!("../openaec/templates/constructie_rapport.yaml")),
    ("fonts/SpaceGrotesk-Bold.ttf", include_bytes!("../openaec/fonts/SpaceGrotesk-Bold.ttf")),
    ("fonts/SpaceGrotesk-Medium.ttf", include_bytes!("../openaec/fonts/SpaceGrotesk-Medium.ttf")),
    ("fonts/Inter-Regular.ttf", include_bytes!("../openaec/fonts/Inter-Regular.ttf")),
    ("fonts/Inter-Medium.ttf", include_bytes!("../openaec/fonts/Inter-Medium.ttf")),
    ("fonts/Inter-SemiBold.ttf", include_bytes!("../openaec/fonts/Inter-SemiBold.ttf")),
    ("fonts/JetBrainsMono-Regular.ttf", include_bytes!("../openaec/fonts/JetBrainsMono-Regular.ttf")),
];

/// The name of the example until the user gives the house style its own.
pub const EXAMPLE_NAME: &str = "Voorbeeldbouw B.V.";

/// A house style being edited.
#[derive(Clone, Debug, PartialEq)]
pub struct Draft {
    /// The folder the files come from; `None` for the example.
    pub source: Option<PathBuf>,
    /// `brand.yaml`, with the keys in the order of the file.
    pub brand: Value,
    /// The other files of the folder, as relative paths with `/`.
    pub files: Vec<String>,
}

/// A file the user adds: it lands on `path` in the folder when the house style is saved.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub path: String,
    pub from: PathBuf,
}

/// `brand.yaml` as text, with the keys in order.
pub fn to_yaml(brand: &Value) -> Result<String, String> {
    serde_yaml::to_string(brand).map_err(|e| e.to_string())
}

/// `brand.yaml` from text; it must be a mapping.
pub fn from_yaml(text: &str) -> Result<Value, String> {
    let brand: Value = serde_yaml::from_str(text).map_err(|e| format!("brand.yaml: {e}"))?;
    if !brand.is_mapping() {
        return Err("brand.yaml: geen huisstijl".into());
    }
    Ok(brand)
}

/// The brand as JSON text for a screen. Text, not a value: that keeps the order of the keys on the way.
pub fn to_json(brand: &Value) -> Result<String, String> {
    serde_json::to_string(brand).map_err(|e| e.to_string())
}

/// The brand back from the JSON text of a screen.
pub fn from_json(text: &str) -> Result<Value, String> {
    let brand: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if !brand.is_mapping() {
        return Err("brand.yaml: geen huisstijl".into());
    }
    Ok(brand)
}

fn set(brand: &mut Value, section: &str, key: &str, value: &str) {
    if let Some(map) = brand.as_mapping_mut() {
        let entry = map.entry(section.into()).or_insert_with(|| Value::Mapping(Mapping::new()));
        if let Some(inner) = entry.as_mapping_mut() {
            inner.insert(key.into(), value.into());
        }
    }
}

/// The example house style: that of OpenAEC under the name of a made-up company, ready to change.
pub fn example() -> Draft {
    let mut brand = from_yaml(std::str::from_utf8(OPENAEC[0].1).unwrap_or_default()).unwrap_or(Value::Mapping(Mapping::new()));
    set(&mut brand, "brand", "name", EXAMPLE_NAME);
    set(&mut brand, "brand", "short_name", "Voorbeeldbouw");
    set(&mut brand, "brand", "tagline", "Bouwen met een plan.");
    set(&mut brand, "brand", "secondary_tagline", "Vervang deze voorbeeldteksten door die van je bedrijf.");
    Draft { source: None, brand, files: OPENAEC[1..].iter().map(|(name, _)| name.to_string()).collect() }
}

fn walk(dir: &Path, at: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(at) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            walk(dir, &path, out);
        } else if let Ok(rel) = path.strip_prefix(dir) {
            let rel = rel.to_string_lossy().replace('\\', "/");
            // Written by the tools, not part of the house style.
            if !matches!(rel.as_str(), "brand.yaml" | "summary.json" | "huisstijl.json") {
                out.push(rel);
            }
        }
    }
}

/// A folder with `brand.yaml` as a draft.
pub fn load(dir: &Path) -> Result<Draft, String> {
    let dir = dir.canonicalize().map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = dir.join("brand.yaml");
    let brand = from_yaml(&fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?)?;
    let mut files = Vec::new();
    walk(&dir, &dir, &mut files);
    files.sort();
    Ok(Draft { source: Some(dir), brand, files })
}

/// The content of a file of the draft: an added file first, then the folder or the example.
pub fn file(draft: &Draft, added: &[Added], path: &str) -> Result<Vec<u8>, String> {
    let rel = safe_path(path).ok_or_else(|| format!("Ongeldig pad: {path}"))?;
    if let Some(a) = added.iter().rev().find(|a| safe_path(&a.path).as_deref() == Some(rel.as_str())) {
        return fs::read(&a.from).map_err(|e| format!("{}: {e}", a.from.display()));
    }
    if !draft.files.contains(&rel) {
        return Err(format!("{rel} staat niet in de huisstijl"));
    }
    match &draft.source {
        Some(dir) => fs::read(dir.join(&rel)).map_err(|e| format!("{rel}: {e}")),
        None => OPENAEC.iter().find(|(name, _)| *name == rel).map(|(_, bytes)| bytes.to_vec()).ok_or_else(|| format!("{rel} ontbreekt")),
    }
}

fn is_hex(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn section<'a>(brand: &'a Value, key: &str) -> impl Iterator<Item = (String, &'a Value)> {
    brand.get(key).and_then(Value::as_mapping).into_iter().flatten().filter_map(|(k, v)| Some((k.as_str()?.to_string(), v)))
}

/// What is not right yet, in the words of the screen. An empty list means the house style can be saved without
/// surprises; with warnings it can be saved too, except without a name.
pub fn check(draft: &Draft, added: &[Added]) -> Vec<String> {
    let mut out = Vec::new();
    let has = |path: &str| {
        safe_path(path).is_some_and(|rel| draft.files.contains(&rel) || added.iter().any(|a| safe_path(&a.path).as_deref() == Some(rel.as_str())))
    };
    if name(&draft.brand).is_none() {
        out.push("De naam van het bedrijf ontbreekt (brand.name).".to_string());
    }
    for (key, value) in section(&draft.brand, "colors") {
        match value.as_str() {
            Some(hex) if is_hex(hex.trim()) => {}
            Some(hex) => out.push(format!("Kleur {key} is geen #RRGGBB: {hex}")),
            None => out.push(format!("Kleur {key} is geen tekst.")),
        }
    }
    let font_files: BTreeMap<String, String> = section(&draft.brand, "font_files").filter_map(|(k, v)| Some((k, v.as_str()?.to_string()))).collect();
    for (font, path) in &font_files {
        if !has(path) {
            out.push(format!("Lettertype {font}: het bestand {path} ontbreekt."));
        }
    }
    for (role, value) in section(&draft.brand, "fonts") {
        // Roles ending in `_fb` name a built-in font of the PDF (Helvetica), without a file.
        if let Some(font) = value.as_str().filter(|f| !role.ends_with("_fb") && !font_files.is_empty() && !font_files.contains_key(*f)) {
            out.push(format!("Lettertype {font} ({role}) heeft geen bestand onder font_files."));
        }
    }
    for (key, value) in section(&draft.brand, "logos") {
        if let Some(path) = value.as_str().filter(|p| !p.is_empty() && !has(p)) {
            out.push(format!("Logo {key}: het bestand {path} ontbreekt."));
        }
    }
    for (page, value) in section(&draft.brand, "stationery") {
        if let Some(path) = value.get("source").and_then(Value::as_str).filter(|p| !p.is_empty() && !has(p)) {
            out.push(format!("Briefpapier {page}: het bestand {path} ontbreekt."));
        }
    }
    out
}

/// The name of the company in the brand.
pub fn name(brand: &Value) -> Option<String> {
    brand.get("brand")?.get("name")?.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

/// A folder name for a house style: lower case, digits and dashes.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars() {
        let c = match c.to_ascii_lowercase() {
            'à'..='å' => 'a',
            'è'..='ë' => 'e',
            'ì'..='ï' => 'i',
            'ò'..='ö' => 'o',
            'ù'..='ü' => 'u',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "huisstijl".into() } else { out }
}

/// Where the house styles made on this computer live: `eigen/` under the folder of the house styles.
pub fn own_root(root: &Path) -> PathBuf {
    root.join("eigen")
}

/// A free folder for a new house style with this name: `eigen/<slug>`, else `<slug>-2`, `-3`, ...
pub fn new_folder(root: &Path, name: &str) -> PathBuf {
    let base = slug(name);
    let own = own_root(root);
    (1..)
        .map(|n| own.join(if n == 1 { base.clone() } else { format!("{base}-{n}") }))
        .find(|dir| !dir.exists())
        .expect("a free folder name")
}

/// The house styles made on this computer, by name.
pub fn list(root: &Path) -> Vec<Installed> {
    let mut out: Vec<Installed> = fs::read_dir(own_root(root))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|dir| dir.join("brand.yaml").is_file())
        .filter_map(|dir| folder_summary(&dir).ok().map(|summary| Installed { dir, summary }))
        .collect();
    out.sort_by(|a, b| a.summary.brand.to_lowercase().cmp(&b.summary.brand.to_lowercase()));
    out
}

const HEADER: &str = "# Huisstijl, gemaakt met de OpenAEC Installer.\n# Het formaat is dat van OpenAEC Reports (brand.yaml); elke OpenAEC-tool leest deze map.\n\n";

/// Save the draft in `target`: `brand.yaml`, its files and the added files. A new house style needs a folder
/// without `brand.yaml`; saving over the folder it was opened from replaces only `brand.yaml` and adds files. With
/// `activate` every OpenAEC tool on this computer uses it from now on (`root` is the folder of the house styles).
pub fn save(draft: &Draft, added: &[Added], target: &Path, activate: Option<&Path>) -> Result<Installed, String> {
    if name(&draft.brand).is_none() {
        return Err("Geef het bedrijf eerst een naam.".into());
    }
    let yaml = to_yaml(&draft.brand)?;
    fs::create_dir_all(target).map_err(|e| format!("{}: {e}", target.display()))?;
    let target = target.canonicalize().map_err(|e| format!("{}: {e}", target.display()))?;
    let same = draft.source.as_deref() == Some(target.as_path());
    if !same && target.join("brand.yaml").exists() {
        return Err(format!("In {} staat al een huisstijl. Kies een andere map of naam.", target.display()));
    }
    let write = |rel: &str, bytes: &[u8]| -> Result<(), String> {
        let path = target.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, bytes).map_err(|e| format!("{}: {e}", path.display()))
    };
    if !same {
        for rel in &draft.files {
            let Some(rel) = safe_path(rel) else { continue };
            write(&rel, &file(draft, &[], &rel)?)?;
        }
    }
    for a in added {
        let rel = safe_path(&a.path).ok_or_else(|| format!("Ongeldig pad: {}", a.path))?;
        write(&rel, &fs::read(&a.from).map_err(|e| format!("{}: {e}", a.from.display()))?)?;
    }
    write("brand.yaml", format!("{HEADER}{yaml}").as_bytes())?;
    // A summary of a cloud house style would hide the changes.
    let _ = fs::remove_file(target.join("summary.json"));
    let installed = Installed { summary: folder_summary(&target)?, dir: target };
    if let Some(root) = activate {
        set_active(root, &installed)?;
    }
    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openaec-huisstijl-maker-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_example_is_complete_and_keeps_its_order() {
        let draft = example();
        assert_eq!(check(&draft, &[]), Vec::<String>::new());
        assert_eq!(name(&draft.brand).as_deref(), Some(EXAMPLE_NAME));
        let keys: Vec<&str> = draft.brand.as_mapping().unwrap().keys().filter_map(Value::as_str).collect();
        assert_eq!(keys, ["brand", "colors", "fonts", "font_files", "margins", "gradient"]);
        // Through the screen and back: the same brand, in the same order.
        let back = from_json(&to_json(&draft.brand).unwrap()).unwrap();
        assert_eq!(to_yaml(&back).unwrap(), to_yaml(&draft.brand).unwrap());
    }

    #[test]
    fn save_as_new_writes_a_folder_every_tool_reads() {
        let root = temp("save");
        let logo = root.join("bron.png");
        fs::write(&logo, [0x89, b'P', b'N', b'G']).unwrap();
        let mut draft = example();
        set(&mut draft.brand, "brand", "name", "Jansen Bouw B.V.");
        set(&mut draft.brand, "colors", "primary", "#1F6F43");
        set(&mut draft.brand, "logos", "main", "logos/logo.png");
        let added = [Added { path: "logos/logo.png".into(), from: logo }];
        assert_eq!(check(&draft, &[]), ["Logo main: het bestand logos/logo.png ontbreekt."]);
        assert_eq!(check(&draft, &added), Vec::<String>::new());

        let target = new_folder(&root, "Jansen Bouw B.V.");
        assert!(target.ends_with("eigen/jansen-bouw-b-v"));
        let installed = save(&draft, &added, &target, Some(&root)).unwrap();
        assert_eq!(installed.summary.brand, "Jansen Bouw B.V.");
        assert_eq!(installed.summary.color("primary"), Some("#1F6F43"));
        assert!(installed.summary.logo.as_ref().is_some_and(|p| p.is_file()));
        assert!(installed.summary.warnings.is_empty(), "{:?}", installed.summary.warnings);
        assert!(installed.dir.join("fonts/Inter-Regular.ttf").is_file());
        assert_eq!(crate::active(&root).map(|i| i.summary.brand).as_deref(), Some("Jansen Bouw B.V."));
        assert_eq!(list(&root).len(), 1);

        // A second house style with the same name gets its own folder; the first is not overwritten.
        assert!(save(&draft, &[], &target, None).unwrap_err().contains("staat al een huisstijl"));
        assert!(new_folder(&root, "Jansen Bouw B.V.").ends_with("eigen/jansen-bouw-b-v-2"));

        // Opened again and saved in place: only brand.yaml changes.
        let mut again = load(&target).unwrap();
        assert!(again.files.contains(&"logos/logo.png".to_string()));
        assert_eq!(file(&again, &[], "logos/logo.png").unwrap(), [0x89, b'P', b'N', b'G']);
        set(&mut again.brand, "brand", "tagline", "Sinds 1962");
        let saved = save(&again, &[], &target, None).unwrap();
        assert_eq!(saved.summary.tagline.as_deref(), Some("Sinds 1962"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn check_names_what_is_wrong() {
        let mut draft = example();
        set(&mut draft.brand, "brand", "name", " ");
        set(&mut draft.brand, "colors", "primary", "oranje");
        set(&mut draft.brand, "fonts", "heading", "Lato-Bold");
        set(&mut draft.brand, "font_files", "Inter-Regular", "fonts/weg.ttf");
        let warnings = check(&draft, &[]);
        assert!(warnings.iter().any(|w| w.contains("naam van het bedrijf")), "{warnings:?}");
        assert!(warnings.iter().any(|w| w.contains("Kleur primary")), "{warnings:?}");
        assert!(warnings.iter().any(|w| w.contains("Lato-Bold (heading)")), "{warnings:?}");
        assert!(warnings.iter().any(|w| w.contains("fonts/weg.ttf")), "{warnings:?}");
        assert!(save(&draft, &[], &temp("naamloos"), None).is_err());
        assert!(file(&draft, &[], "../../etc/passwd").is_err());
        assert_eq!(slug("  Café & Zoon — Bouw  "), "cafe-zoon-bouw");
    }
}
