//! De huisstijlmaker: de voorbeeldhuisstijl of een bestaande map openen, alles in
//! `brand.yaml` aanpassen en opslaan als nieuwe map die elke OpenAEC-tool leest.
//! Het werk zit in de crate `openaec-huisstijl` (module `maker`), overgenomen uit
//! OpenAEC-Blueprint; hier staan alleen de Tauri-commando's.
//!
//! `brand` gaat als JSON-tekst heen en weer: zo blijft de volgorde van de sleutels
//! in `brand.yaml` staan.
use base64::Engine;
use openaec_huisstijl::maker::{self, Added, Draft};
use openaec_huisstijl::Installed;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftView {
    /// De map waar de bestanden vandaan komen; leeg voor de voorbeeldhuisstijl.
    source: Option<String>,
    brand: String,
    yaml: String,
    files: Vec<String>,
    warnings: Vec<String>,
    /// Staat in de eigen huisstijlen van deze computer.
    own: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
    yaml: String,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    own: Vec<Installed>,
    active: Option<Installed>,
    /// De map van de eigen huisstijlen.
    folder: String,
}

fn root() -> PathBuf {
    openaec_huisstijl::default_root()
}

fn view(draft: Draft) -> Result<DraftView, String> {
    let own = draft.source.as_deref().is_some_and(|dir| dir.starts_with(maker::own_root(&root()).canonicalize().unwrap_or_default()));
    Ok(DraftView {
        source: draft.source.as_ref().map(|p| p.display().to_string()),
        brand: maker::to_json(&draft.brand)?,
        yaml: maker::to_yaml(&draft.brand)?,
        warnings: maker::check(&draft, &[]),
        files: draft.files,
        own,
    })
}

/// Het concept van het scherm: de bestanden van de bron, met de brand van nu.
fn draft(source: Option<&str>, brand: &str) -> Result<Draft, String> {
    let mut draft = match source {
        Some(dir) => maker::load(Path::new(dir))?,
        None => maker::example(),
    };
    draft.brand = maker::from_json(brand)?;
    Ok(draft)
}

#[tauri::command]
pub fn huisstijl_example() -> Result<DraftView, String> {
    view(maker::example())
}

#[tauri::command]
pub fn huisstijl_load(dir: String) -> Result<DraftView, String> {
    view(maker::load(Path::new(&dir))?)
}

/// Controleer het concept en geef `brand.yaml` zoals het opgeslagen wordt.
#[tauri::command]
pub fn huisstijl_check(source: Option<String>, brand: String, added: Vec<Added>) -> Result<Checked, String> {
    let draft = draft(source.as_deref(), &brand)?;
    Ok(Checked { yaml: maker::to_yaml(&draft.brand)?, warnings: maker::check(&draft, &added) })
}

/// `brand.yaml` als tekst terug naar de brand van het scherm.
#[tauri::command]
pub fn huisstijl_from_yaml(text: String) -> Result<String, String> {
    maker::to_json(&maker::from_yaml(&text)?)
}

/// Een bestand van het concept (logo, lettertype), als base64.
#[tauri::command]
pub fn huisstijl_file(source: Option<String>, path: String, added: Vec<Added>) -> Result<String, String> {
    let draft = match source.as_deref() {
        Some(dir) => maker::load(Path::new(dir))?,
        None => maker::example(),
    };
    Ok(base64::engine::general_purpose::STANDARD.encode(maker::file(&draft, &added, &path)?))
}

/// Opslaan. Zonder `target` komt er een nieuwe map bij de eigen huisstijlen, naar
/// de naam van het bedrijf. Met `activate` gebruikt elke OpenAEC-tool hem meteen.
#[tauri::command]
pub fn huisstijl_save(source: Option<String>, brand: String, added: Vec<Added>, target: Option<String>, activate: bool) -> Result<Installed, String> {
    let draft = draft(source.as_deref(), &brand)?;
    let root = root();
    let target = match target {
        Some(dir) => PathBuf::from(dir),
        None => maker::new_folder(&root, &maker::name(&draft.brand).ok_or("Geef het bedrijf eerst een naam.")?),
    };
    maker::save(&draft, &added, &target, activate.then_some(root.as_path()))
}

#[tauri::command]
pub fn huisstijl_overview() -> Overview {
    let root = root();
    Overview { own: maker::list(&root), active: openaec_huisstijl::active(&root), folder: maker::own_root(&root).display().to_string() }
}

/// Deze map als huisstijl van elke OpenAEC-tool op deze computer.
#[tauri::command]
pub fn huisstijl_use(dir: String) -> Result<Installed, String> {
    openaec_huisstijl::open_folder(&root(), Path::new(&dir))
}

/// Terug naar de huisstijl van OpenAEC.
#[tauri::command]
pub fn huisstijl_clear() -> Result<(), String> {
    openaec_huisstijl::clear_active(&root())
}
