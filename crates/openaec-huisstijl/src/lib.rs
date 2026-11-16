// Copied from OpenAEC-Blueprint crates/openaec-huisstijl by scripts/sync-openaec.mjs; do not edit here.
//! The house style of the company, from Beheer in the OpenAEC SuperCloud (docs/bedrijfshuisstijl.md).
//!
//! Every customer environment has a house style per trade name (handelsnaam): logos, colours, fonts, stationery and
//! the settings of the report engine. Tools read it with schema `huisstijl/1` from
//! `openaec_beheer.huisstijl.get`, with the OpenAEC access token of the user as `Authorization: Bearer <jwt>`.
//!
//! - [`trade_names`] and [`fetch`] read it from the environment;
//! - [`install`] downloads its files and writes a tenant folder (`brand.yaml` plus logos, fonts, stationery and
//!   report files) that `openaec-core` reads like any other tenant, the same mapping the cloud uses for its export
//!   (`openaec_beheer.huisstijl_reports.brand_en_bestanden`);
//! - [`open_folder`] takes a house style that is a folder with `brand.yaml` instead, for instance on the drive of the
//!   company: that works without an account, and the OpenAEC desktop app makes and edits such folders with
//!   [`maker`];
//! - [`active`], [`set_active`] and [`clear_active`] keep the choice on disk, shared by every OpenAEC tool on the
//!   computer, like the account. The installed folder keeps working offline.
//!
//! No interface. The token is only ever sent to the environment itself: a file on another host is skipped.
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub mod maker;

pub const SCHEMA: &str = "huisstijl/1";
pub const ORIGIN_CLOUD: &str = "cloud";
pub const ORIGIN_FOLDER: &str = "map";
const GET: &str = "/api/method/openaec_beheer.huisstijl.get";
const TRADE_NAMES: &str = "/api/method/openaec_beheer.huisstijl.handelsnamen";
/// Reports draws PNG best (the cloud's export uses the same order).
const LOGO_ORDER: [&str; 4] = ["png", "svg", "pdf", "ico"];
const MAX_FILE: u64 = 25 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

/// Where the house style comes from: one customer environment and the access token of the user.
#[derive(Clone, Debug)]
pub struct Source {
    /// `https://<host>`, without a trailing slash.
    pub base: String,
    pub token: String,
}

impl Source {
    /// A host from the `omgevingen` claim (`3bm.cloud.open-aec.eu`); a full `http(s)://` address stays as it is.
    pub fn new(host: &str, token: impl Into<String>) -> Self {
        let host = host.trim().trim_end_matches('/');
        let base = if host.starts_with("https://") || host.starts_with("http://") { host.to_string() } else { format!("https://{host}") };
        Self { base, token: token.into() }
    }

    /// An environment from the `omgevingen` claim: a short name (`3bm`) lives under the cloud
    /// (`https://3bm.cloud.open-aec.eu`), a full host as it is.
    pub fn for_environment(host: &str, cloud: &str, token: impl Into<String>) -> Self {
        let host = host.trim();
        if host.contains('.') || host.contains("://") {
            return Self::new(host, token);
        }
        let (scheme, rest) = cloud.split_once("://").unwrap_or(("https", cloud));
        Self::new(&format!("{scheme}://{host}.{}", rest.trim_end_matches('/')), token)
    }

    /// The host part, the name of the folder on disk.
    pub fn host(&self) -> String {
        self.base.split("://").nth(1).unwrap_or(&self.base).replace([':', '/'], "_")
    }

    /// The address of `url` on this environment, or None for another host (the token stays home).
    fn resolve(&self, url: &str) -> Option<String> {
        if url.starts_with('/') && !url.starts_with("//") {
            Some(format!("{}{url}", self.base))
        } else if url == self.base || url.starts_with(&format!("{}/", self.base)) {
            Some(url.to_string())
        } else {
            None
        }
    }

    fn get(&self, url: &str) -> Result<ureq::Response, String> {
        let response = ureq::get(url).timeout(TIMEOUT).set("Authorization", &format!("Bearer {}", self.token)).set("Accept", "application/json").call();
        match response {
            Ok(r) => Ok(r),
            Err(ureq::Error::Status(401, _)) => Err("unauthorized".into()),
            Err(ureq::Error::Status(403, _)) => Err("forbidden".into()),
            Err(ureq::Error::Status(404, _)) => Err("not_found".into()),
            Err(ureq::Error::Status(code, _)) => Err(format!("http_{code}")),
            Err(e) => Err(format!("offline: {e}")),
        }
    }

    /// A whitelisted method; Frappe wraps the answer in `message`.
    fn method(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, String> {
        let mut url = format!("{}{path}", self.base);
        for (i, (k, v)) in query.iter().enumerate() {
            url.push(if i == 0 { '?' } else { '&' });
            url.push_str(&format!("{k}={}", urlencoding::encode(v)));
        }
        let mut value: Value = self.get(&url)?.into_json().map_err(|e| format!("unreadable answer: {e}"))?;
        Ok(value.get_mut("message").map(Value::take).unwrap_or(value))
    }

    fn bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        let address = self.resolve(url).ok_or_else(|| format!("not on this environment: {url}"))?;
        let mut out = Vec::new();
        self.get(&address)?.into_reader().take(MAX_FILE + 1).read_to_end(&mut out).map_err(|e| e.to_string())?;
        if out.len() as u64 > MAX_FILE {
            return Err(format!("too large: {url}"));
        }
        Ok(out)
    }
}

/// One trade name of the environment (`handelsnamen`).
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct TradeName {
    pub naam: String,
    #[serde(default)]
    pub standaard: bool,
    #[serde(default)]
    pub actief: bool,
    #[serde(default)]
    pub bedrijf: Option<String>,
}

pub fn trade_names(source: &Source) -> Result<Vec<TradeName>, String> {
    serde_json::from_value(source.method(TRADE_NAMES, &[])?).map_err(|e| format!("unreadable trade names: {e}"))
}

/// The house style as `huisstijl/1`; without a name the default trade name.
pub fn fetch(source: &Source, trade_name: Option<&str>) -> Result<Value, String> {
    let query: Vec<(&str, &str)> = trade_name.map(|n| vec![("handelsnaam", n)]).unwrap_or_default();
    let value = source.method(GET, &query)?;
    match value.get("schema").and_then(Value::as_str) {
        Some(SCHEMA) => Ok(value),
        Some(other) => Err(format!("unknown schema {other}")),
        None => Err("no house style in the answer".into()),
    }
}

// ── What a tool shows ──────────────────────────────────────────────────

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Color {
    pub key: String,
    pub hex: String,
    pub description: Option<String>,
}

/// The house style in short, for the window and the status bar.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// Where it came from: `cloud` (an environment of the SuperCloud) or `map` (a folder with `brand.yaml`).
    pub origin: String,
    /// The environment (`3bm.cloud.open-aec.eu`); empty for a folder.
    pub host: String,
    pub trade_name: String,
    pub brand: String,
    pub tagline: Option<String>,
    /// `beheer`, `lid` or `publiek`: what the user may see.
    pub view: String,
    pub colors: Vec<Color>,
    /// Role -> font name (`heading` -> `SpaceGrotesk-Bold`).
    pub fonts: BTreeMap<String, String>,
    /// The main logo on disk, if there is one.
    pub logo: Option<PathBuf>,
    /// Page types with stationery (`cover`, `content`, ...).
    pub stationery: Vec<String>,
    pub drawing_frames: usize,
    pub warnings: Vec<String>,
    pub updated: Option<String>,
    /// Files that could not be fetched; the rest still works.
    pub skipped: Vec<String>,
}

impl Summary {
    pub fn color(&self, key: &str) -> Option<&str> {
        self.colors.iter().find(|c| c.key == key).map(|c| c.hex.as_str())
    }
}

/// A house style on disk: the tenant folder for the report engine and its summary.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub dir: PathBuf,
    pub summary: Summary,
}

fn text(value: &Value, pointer: &str) -> Option<String> {
    value.pointer(pointer).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn object<'a>(value: &'a Value, pointer: &str) -> impl Iterator<Item = (&'a String, &'a Value)> {
    value.pointer(pointer).and_then(Value::as_object).into_iter().flatten()
}

/// A relative path inside the tenant folder, or None: no absolute paths, no `..`, only plain characters.
fn safe_path(path: &str) -> Option<String> {
    let parts: Vec<String> = path
        .replace('\\', "/")
        .split('/')
        .filter(|p| !p.is_empty() && *p != "." && *p != "..")
        .map(|p| p.chars().map(|c| if c.is_ascii_alphanumeric() || "-_.".contains(c) { c } else { '_' }).collect::<String>())
        .collect();
    if parts.is_empty() || parts.iter().any(|p| p.chars().all(|c| c == '.')) {
        return None;
    }
    Some(parts.join("/"))
}

/// The file name of a file in `folder`: its own name when it has one, otherwise `<fallback>.<format>`.
fn export_path(file_name: Option<&str>, folder: &str, fallback: &str, format: &str) -> String {
    if let Some(path) = file_name.and_then(safe_path) {
        return if path.contains('/') { path } else { format!("{folder}/{path}") };
    }
    let stem = safe_path(fallback).unwrap_or_else(|| "bestand".into()).replace('/', "_");
    format!("{folder}/{stem}.{format}")
}

/// The extension of a file by its content, for files without a name.
fn sniff(bytes: &[u8]) -> &'static str {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => "png",
        [b'%', b'P', b'D', b'F', ..] => "pdf",
        [b'w', b'O', b'F', b'2', ..] => "woff2",
        [b'w', b'O', b'F', b'F', ..] => "woff",
        [b'O', b'T', b'T', b'O', ..] => "otf",
        [0, 1, 0, 0, ..] | [b't', b'r', b'u', b'e', ..] => "ttf",
        [0xFF, 0xD8, ..] => "jpg",
        _ if String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).contains("<svg") => "svg",
        _ => "bin",
    }
}

/// The files of the folder: each path once; other content on a taken path gets `-2`, `-3`, ...
#[derive(Default)]
struct Files(BTreeMap<String, Vec<u8>>);

impl Files {
    fn put(&mut self, path: String, bytes: Vec<u8>) -> String {
        if self.0.get(&path).map_or(true, |b| *b == bytes) {
            self.0.insert(path.clone(), bytes);
            return path;
        }
        let (stem, ext) = path.rsplit_once('.').map(|(s, e)| (s.to_string(), format!(".{e}"))).unwrap_or((path.clone(), String::new()));
        let mut i = 2;
        loop {
            let candidate = format!("{stem}-{i}{ext}");
            match self.0.get(&candidate) {
                Some(b) if *b != bytes => i += 1,
                _ => {
                    self.0.insert(candidate.clone(), bytes);
                    return candidate;
                }
            }
        }
    }
}

/// `contact` for the report from the trade name, as the cloud does when the house style has none.
fn contact_of(h: &Value) -> Value {
    let visit = h.pointer("/handelsnaam/adressen/bezoek");
    let line = |k: &str| visit.and_then(|v| v.get(k)).and_then(Value::as_str).unwrap_or("").trim().to_string();
    let place = [line("postcode"), line("plaats")].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" ");
    let address = [line("regel1"), place].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join("  |  ");
    let mut contact = Map::new();
    let mut put = |key: &str, value: Option<String>| {
        if let Some(v) = value.filter(|v| !v.is_empty()) {
            contact.insert(key.into(), Value::String(v));
        }
    };
    put("name", text(h, "/handelsnaam/naam"));
    put("address", Some(address));
    put("website", text(h, "/handelsnaam/website").map(|w| w.trim_start_matches("https://").trim_start_matches("http://").to_string()));
    put("phone", text(h, "/handelsnaam/telefoon"));
    put("email", text(h, "/handelsnaam/email"));
    Value::Object(contact)
}

/// The brand of the report engine and its files, from `huisstijl/1`. Files that cannot be fetched are listed in the
/// second value and left out.
fn brand_and_files(source: &Source, h: &Value) -> (Value, Files, Vec<String>) {
    let mut files = Files::default();
    let mut skipped = Vec::new();
    let mut fetch = |url: &str, what: &str| match source.bytes(url) {
        Ok(b) => Some(b),
        Err(e) => {
            skipped.push(format!("{what}: {e}"));
            None
        }
    };

    let mut brand = Map::new();
    let mut identity = Map::new();
    identity.insert("name".into(), json!(text(h, "/merk/naam").or_else(|| text(h, "/handelsnaam/naam")).unwrap_or_default()));
    identity.insert("slug".into(), json!(text(h, "/merk/slug").unwrap_or_default()));
    if let Some(t) = text(h, "/merk/tenant") {
        identity.insert("tenant".into(), json!(t));
    }
    if let Some(t) = text(h, "/merk/tagline") {
        identity.insert("tagline".into(), json!(t));
    }
    brand.insert("brand".into(), Value::Object(identity));
    brand.insert("colors".into(), Value::Object(object(h, "/kleuren").filter_map(|(k, v)| Some((k.clone(), json!(v.get("hex")?.as_str()?)))).collect()));
    brand.insert("fonts".into(), Value::Object(object(h, "/fonts/rollen").map(|(k, v)| (k.clone(), v.clone())).collect()));

    // Report files first: their paths are fixed (header `src` and `pages` point at them).
    for item in h.pointer("/rapportbestanden").and_then(Value::as_array).into_iter().flatten() {
        let (Some(path), Some(url)) = (item.get("pad").and_then(Value::as_str).and_then(safe_path), item.get("url").and_then(Value::as_str)) else { continue };
        if let Some(bytes) = fetch(url, &path) {
            files.put(path, bytes);
        }
    }
    let mut font_files = Map::new();
    for (name, file) in object(h, "/fonts/bestanden") {
        let Some(url) = file.get("url").and_then(Value::as_str) else { continue };
        if let Some(bytes) = fetch(url, name) {
            let path = export_path(file.get("bestandsnaam").and_then(Value::as_str), "fonts", name, sniff(&bytes));
            let path = if path.starts_with("fonts/") { path } else { format!("fonts/{}", path.rsplit('/').next().unwrap_or(&path)) };
            font_files.insert(name.clone(), json!(files.put(path, bytes)));
        }
    }
    if !font_files.is_empty() {
        brand.insert("font_files".into(), Value::Object(font_files));
    }
    let mut logos = Map::new();
    for (variant, formats) in object(h, "/logos") {
        let Some((format, url)) = LOGO_ORDER.iter().find_map(|f| Some((*f, formats.get(*f)?.as_str()?))) else { continue };
        if let Some(bytes) = fetch(url, &format!("logo {variant}")) {
            logos.insert(variant.clone(), json!(files.put(format!("logos/{}.{format}", safe_path(variant).unwrap_or_else(|| "logo".into())), bytes)));
        }
    }
    brand.insert("logos".into(), Value::Object(logos));
    let report = h.get("rapport").cloned().unwrap_or(Value::Null);
    let contact = report.get("contact").filter(|c| c.as_object().is_some_and(|o| !o.is_empty())).cloned().unwrap_or_else(|| contact_of(h));
    brand.insert("contact".into(), contact);
    for key in ["header", "footer", "styles", "pages", "modules", "tenant_modules", "module_config"] {
        if let Some(v) = report.get(key).filter(|v| !v.is_null()) {
            brand.insert(key.into(), v.clone());
        }
    }
    let mut stationery = Map::new();
    for (page, spec) in object(h, "/briefpapier") {
        let mut out = Map::new();
        let mut source_path = String::new();
        if let Some(url) = spec.get("bron").and_then(Value::as_str) {
            if let Some(bytes) = fetch(url, &format!("briefpapier {page}")) {
                let path = format!("stationery/{}.{}", safe_path(page).unwrap_or_else(|| "pagina".into()), sniff(&bytes));
                source_path = files.put(path, bytes);
            }
        }
        out.insert("source".into(), json!(source_path));
        out.insert("header_footer".into(), spec.get("header_footer").cloned().unwrap_or(Value::Null));
        if let Some(z) = spec.get("tekstzones").filter(|v| v.is_array()) {
            out.insert("text_zones".into(), z.clone());
        }
        if let Some(f) = spec.get("inhoudskader").filter(|v| v.is_object()) {
            out.insert("content_frame".into(), f.clone());
        }
        stationery.insert(page.clone(), Value::Object(out));
    }
    if !stationery.is_empty() {
        brand.insert("stationery".into(), Value::Object(stationery));
    }
    (Value::Object(brand), files, skipped)
}

fn summary_of(source: &Source, h: &Value, brand: &Value, dir: &Path, skipped: Vec<String>) -> Summary {
    let logo = ["main", "main_hires", "tagline", "dark", "symbol"]
        .iter()
        .find_map(|v| brand.pointer(&format!("/logos/{v}")).and_then(Value::as_str))
        .map(|p| dir.join(p));
    Summary {
        origin: ORIGIN_CLOUD.into(),
        host: source.host(),
        trade_name: text(h, "/handelsnaam/naam").unwrap_or_default(),
        brand: text(h, "/merk/naam").or_else(|| text(h, "/handelsnaam/naam")).unwrap_or_default(),
        tagline: text(h, "/merk/tagline"),
        view: text(h, "/weergave").unwrap_or_else(|| "publiek".into()),
        colors: object(h, "/kleuren")
            .filter_map(|(k, v)| Some(Color { key: k.clone(), hex: v.get("hex")?.as_str()?.to_uppercase(), description: text(v, "/omschrijving") }))
            .collect(),
        fonts: object(h, "/fonts/rollen").filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect(),
        logo,
        stationery: object(h, "/briefpapier").map(|(k, _)| k.clone()).collect(),
        drawing_frames: h.pointer("/tekeningkaders").and_then(Value::as_array).map_or(0, Vec::len),
        warnings: h.pointer("/waarschuwingen").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).map(String::from).collect(),
        updated: text(h, "/bijgewerkt"),
        skipped,
    }
}

/// Download the files of the house style and write the tenant folder `<root>/<host>/<slug>/`: `brand.yaml` (JSON,
/// which YAML reads as well), the files at their paths, `huisstijl.json` (the answer as fetched) and `summary.json`.
/// The folder is written next to the old one and swapped in at the end, so a failed fetch leaves the old one.
pub fn install(source: &Source, h: &Value, root: &Path) -> Result<Installed, String> {
    let slug = text(h, "/merk/slug").or_else(|| text(h, "/handelsnaam/naam")).and_then(|s| safe_path(&s.replace('/', "-"))).unwrap_or_else(|| "huisstijl".into());
    let parent = root.join(source.host());
    let dir = parent.join(&slug);
    let temp = parent.join(format!(".{slug}.nieuw"));
    let (brand, files, skipped) = brand_and_files(source, h);
    let summary = summary_of(source, h, &brand, &dir, skipped);

    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).map_err(|e| format!("{}: {e}", temp.display()))?;
    let write = |path: &Path, bytes: &[u8]| -> Result<(), String> {
        if let Some(p) = path.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        fs::write(path, bytes).map_err(|e| format!("{}: {e}", path.display()))
    };
    for (path, bytes) in &files.0 {
        write(&temp.join(path), bytes)?;
    }
    write(&temp.join("brand.yaml"), serde_json::to_string_pretty(&brand).unwrap_or_default().as_bytes())?;
    write(&temp.join("huisstijl.json"), serde_json::to_string_pretty(h).unwrap_or_default().as_bytes())?;
    write(&temp.join("summary.json"), serde_json::to_string_pretty(&summary).unwrap_or_default().as_bytes())?;
    let _ = fs::remove_dir_all(&dir);
    fs::rename(&temp, &dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(Installed { dir, summary })
}

// ── The choice, shared by every tool ───────────────────────────────────

/// The folder of the house styles: `OPENAEC_HUISSTIJL_DIR`, else the cache folder of the user
/// (`%LOCALAPPDATA%\OpenAEC\huisstijl`, `~/Library/Caches/OpenAEC/huisstijl`, `$XDG_CACHE_HOME/openaec/huisstijl`).
pub fn default_root() -> PathBuf {
    if let Some(dir) = std::env::var_os("OPENAEC_HUISSTIJL_DIR") {
        return PathBuf::from(dir);
    }
    let home = || std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(home).join("OpenAEC").join("huisstijl")
    } else if cfg!(target_os = "macos") {
        home().join("Library/Caches/OpenAEC/huisstijl")
    } else {
        std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache")).join("openaec").join("huisstijl")
    }
}

#[derive(Serialize, Deserialize)]
struct Choice {
    dir: PathBuf,
}

/// The house style chosen in any OpenAEC tool on this computer, if its folder is still there. A folder of the
/// company is read again each time, so a change on the drive shows up in every tool.
pub fn active(root: &Path) -> Option<Installed> {
    let choice: Choice = serde_json::from_slice(&fs::read(root.join("actief.json")).ok()?).ok()?;
    let dir = choice.dir;
    if !dir.join("brand.yaml").is_file() {
        return None;
    }
    match serde_json::from_slice::<Summary>(&fs::read(dir.join("summary.json")).unwrap_or_default()) {
        Ok(summary) if summary.origin == ORIGIN_CLOUD => Some(Installed { dir, summary }),
        _ => folder_summary(&dir).ok().map(|summary| Installed { dir, summary }),
    }
}

/// The summary of a folder with `brand.yaml`, as OpenAEC Reports reads it.
fn folder_summary(dir: &Path) -> Result<Summary, String> {
    let path = dir.join("brand.yaml");
    let source = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let brand: Value = serde_yaml::from_str(&source).map_err(|e| format!("brand.yaml: {e}"))?;
    if !brand.is_object() {
        return Err("brand.yaml: no house style".into());
    }
    let name = text(&brand, "/brand/name").ok_or("brand.yaml: brand.name is missing")?;
    let mut warnings = Vec::new();
    let colors = object(&brand, "/colors")
        .filter_map(|(k, v)| {
            let hex = v.as_str()?.trim().to_uppercase();
            let valid = hex.len() == 7 && hex.starts_with('#') && hex[1..].chars().all(|c| c.is_ascii_hexdigit());
            if !valid {
                warnings.push(format!("Kleur {k} is geen #RRGGBB: {hex}"));
            }
            valid.then(|| Color { key: k.clone(), hex, description: None })
        })
        .collect();
    let fonts = object(&brand, "/fonts").filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect();
    for (font, file) in object(&brand, "/font_files") {
        if let Some(f) = file.as_str().filter(|f| !dir.join(f).is_file()) {
            warnings.push(format!("Font {font} ontbreekt: {f}"));
        }
    }
    let logo = ["main", "main_hires", "tagline", "dark", "symbol"]
        .iter()
        .find_map(|v| brand.pointer(&format!("/logos/{v}")).and_then(Value::as_str))
        .map(|p| dir.join(p))
        .filter(|p| p.is_file());
    Ok(Summary {
        origin: ORIGIN_FOLDER.into(),
        host: String::new(),
        trade_name: text(&brand, "/contact/name").unwrap_or_else(|| name.clone()),
        brand: name,
        tagline: text(&brand, "/brand/tagline").or_else(|| text(&brand, "/contact/tagline")),
        view: "beheer".into(),
        colors,
        fonts,
        logo,
        stationery: object(&brand, "/stationery").map(|(k, _)| k.clone()).collect(),
        drawing_frames: 0,
        warnings,
        updated: None,
        skipped: Vec::new(),
    })
}

/// Take a folder with `brand.yaml` (the format of OpenAEC Reports) as the house style of every tool.
pub fn open_folder(root: &Path, dir: &Path) -> Result<Installed, String> {
    let dir = dir.canonicalize().map_err(|e| format!("{}: {e}", dir.display()))?;
    let summary = folder_summary(&dir)?;
    let installed = Installed { dir, summary };
    set_active(root, &installed)?;
    Ok(installed)
}

pub fn set_active(root: &Path, installed: &Installed) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let json = serde_json::to_vec_pretty(&Choice { dir: installed.dir.clone() }).map_err(|e| e.to_string())?;
    fs::write(root.join("actief.json"), json).map_err(|e| e.to_string())
}

/// Back to the OpenAEC house style; the folders stay for a next time.
pub fn clear_active(root: &Path) -> Result<(), String> {
    match fs::remove_file(root.join("actief.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Fetch, install and choose in one go: what the button **Ophalen** does.
pub fn refresh(source: &Source, trade_name: Option<&str>, root: &Path) -> Result<Installed, String> {
    let h = fetch(source, trade_name)?;
    let installed = install(source, &h, root)?;
    set_active(root, &installed)?;
    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 13, 10, 26, 10, 1, 2, 3];
    const PDF: &[u8] = b"%PDF-1.7 briefpapier";
    const TTF: &[u8] = &[0, 1, 0, 0, 9, 9, 9];

    fn huisstijl(base: &str) -> Value {
        json!({
            "schema": "huisstijl/1",
            "weergave": "lid",
            "handelsnaam": {"naam": "Dorphout B.V.", "standaard": true, "website": "https://dorphout.nl", "telefoon": "010-1234567",
                "adressen": {"bezoek": {"regel1": "Kade 1", "postcode": "3011 AA", "plaats": "Rotterdam"}}},
            "merk": {"naam": "Dorphout", "slug": "dorphout", "tenant": null, "tagline": "Bouwen met hout"},
            "logos": {"main": {"svg": "/files/main.svg", "png": "/files/main.png"}, "white": {"png": "https://elders.example/wit.png"}},
            "kleuren": {"primary": {"hex": "#1f6f43", "omschrijving": "Groen"}, "text": {"hex": "#222222"}},
            "waarschuwingen": ["Weinig contrast voor primary op background"],
            "fonts": {"rollen": {"heading": "Lato-Bold", "body": "Lato-Regular"},
                "bestanden": {"Lato-Bold": {"url": "/api/method/openaec_beheer.huisstijl.bestand?bestand=1", "bestandsnaam": "Lato-Bold.ttf"}}},
            "briefpapier": {"cover": {"bron": format!("{base}/api/method/openaec_beheer.huisstijl.bestand?bestand=2"), "header_footer": null,
                "tekstzones": [{"role": "title"}], "inhoudskader": {"x_pt": 34, "y_pt": 57, "width_pt": 527.3, "height_pt": 677}}},
            "rapport": {"header": {"height": 0}, "footer": null, "styles": null, "pages": {"cover": {"logo": "stationery/../../etc/x.png"}}, "contact": null},
            "rapportbestanden": [{"pad": "../templates/cover.yaml", "url": "/api/method/openaec_beheer.huisstijl.bestand?bestand=3"}],
            "tekeningkaders": [{"naam": "A3"}],
            "bijgewerkt": "2026-11-16 10:00:00"
        })
    }

    /// A tiny environment: answers each GET by path and records the request line and Authorization header.
    fn environment() -> (Source, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        let base2 = base.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut buf = vec![0u8; 8192];
                let n = stream.read(&mut buf).unwrap();
                let request = String::from_utf8_lossy(&buf[..n]).to_string();
                let line = request.lines().next().unwrap_or("").to_string();
                let auth = request.lines().find_map(|l| l.strip_prefix("Authorization: ").or_else(|| l.strip_prefix("authorization: "))).unwrap_or("-").to_string();
                log.lock().unwrap().push(format!("{line} | {auth}"));
                let path = line.split(' ').nth(1).unwrap_or("");
                let (status, body): (u16, Vec<u8>) = if auth != "Bearer jwt" {
                    (401, b"{}".to_vec())
                } else if path.starts_with("/api/method/openaec_beheer.huisstijl.get") {
                    (200, json!({"message": huisstijl(&base2)}).to_string().into_bytes())
                } else if path.starts_with("/api/method/openaec_beheer.huisstijl.handelsnamen") {
                    (200, json!({"message": [{"naam": "Dorphout B.V.", "standaard": true, "actief": true, "bedrijf": null}]}).to_string().into_bytes())
                } else if path == "/files/main.png" {
                    (200, PNG.to_vec())
                } else if path.ends_with("bestand=1") {
                    (200, TTF.to_vec())
                } else if path.ends_with("bestand=2") {
                    (200, PDF.to_vec())
                } else if path.ends_with("bestand=3") {
                    (200, b"cover: {}".to_vec())
                } else {
                    (404, b"{}".to_vec())
                };
                let _ = write!(stream, "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                let _ = stream.write_all(&body);
            }
        });
        (Source::new(&base, "jwt"), seen)
    }

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openaec-huisstijl-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn source_adds_https_and_keeps_the_token_home() {
        let s = Source::new("dorphout.cloud.open-aec.eu/", "t");
        assert_eq!(s.base, "https://dorphout.cloud.open-aec.eu");
        assert_eq!(s.host(), "dorphout.cloud.open-aec.eu");
        assert_eq!(s.resolve("/files/a.png").as_deref(), Some("https://dorphout.cloud.open-aec.eu/files/a.png"));
        assert_eq!(s.resolve("https://dorphout.cloud.open-aec.eu/x").as_deref(), Some("https://dorphout.cloud.open-aec.eu/x"));
        assert_eq!(s.resolve("https://dorphout.cloud.open-aec.eu.evil.example/x"), None);
        assert_eq!(s.resolve("//evil.example/x"), None);
        assert_eq!(s.resolve("https://evil.example/x"), None);
        assert_eq!(Source::for_environment("3bm", "https://cloud.open-aec.eu", "t").base, "https://3bm.cloud.open-aec.eu");
        assert_eq!(Source::for_environment("x.example.eu", "https://cloud.open-aec.eu", "t").base, "https://x.example.eu");
    }

    #[test]
    fn paths_stay_inside_the_folder() {
        assert_eq!(safe_path("../templates/cover.yaml").as_deref(), Some("templates/cover.yaml"));
        assert_eq!(safe_path("/etc/passwd").as_deref(), Some("etc/passwd"));
        assert_eq!(safe_path("a/../../b").as_deref(), Some("a/b"));
        assert_eq!(safe_path("C:\\x\\y.ttf").as_deref(), Some("C_/x/y.ttf"));
        assert_eq!(safe_path(".."), None);
        assert_eq!(export_path(Some("Lato.ttf"), "fonts", "x", "ttf"), "fonts/Lato.ttf");
        assert_eq!(export_path(None, "fonts", "Lato Bold", "ttf"), "fonts/Lato_Bold.ttf");
    }

    #[test]
    fn same_path_other_content_gets_a_number() {
        let mut f = Files::default();
        assert_eq!(f.put("logos/a.png".into(), vec![1]), "logos/a.png");
        assert_eq!(f.put("logos/a.png".into(), vec![1]), "logos/a.png");
        assert_eq!(f.put("logos/a.png".into(), vec![2]), "logos/a-2.png");
    }

    #[test]
    fn fetch_install_and_choose() {
        let (source, seen) = environment();
        let root = temp_root("install");
        assert_eq!(trade_names(&source).unwrap()[0].naam, "Dorphout B.V.");
        let installed = refresh(&source, Some("Dorphout B.V."), &root).unwrap();
        let dir = &installed.dir;
        assert!(dir.ends_with("dorphout"));
        let brand: Value = serde_json::from_slice(&fs::read(dir.join("brand.yaml")).unwrap()).unwrap();
        assert_eq!(brand["brand"]["name"], "Dorphout");
        assert_eq!(brand["colors"]["primary"], "#1f6f43");
        assert_eq!(brand["fonts"]["heading"], "Lato-Bold");
        assert_eq!(brand["font_files"]["Lato-Bold"], "fonts/Lato-Bold.ttf");
        assert_eq!(brand["logos"]["main"], "logos/main.png");
        assert!(brand["logos"].get("white").is_none(), "a logo on another host is skipped");
        assert_eq!(brand["stationery"]["cover"]["source"], "stationery/cover.pdf");
        assert_eq!(brand["stationery"]["cover"]["content_frame"]["width_pt"], 527.3);
        assert_eq!(brand["contact"]["website"], "dorphout.nl");
        assert_eq!(brand["contact"]["address"], "Kade 1  |  3011 AA Rotterdam");
        assert!(brand.get("footer").is_none());
        assert_eq!(fs::read(dir.join("fonts/Lato-Bold.ttf")).unwrap(), TTF);
        assert_eq!(fs::read(dir.join("stationery/cover.pdf")).unwrap(), PDF);
        assert_eq!(fs::read(dir.join("templates/cover.yaml")).unwrap(), b"cover: {}");
        let s = &installed.summary;
        assert_eq!((s.brand.as_str(), s.trade_name.as_str(), s.view.as_str()), ("Dorphout", "Dorphout B.V.", "lid"));
        assert_eq!(s.color("primary"), Some("#1F6F43"));
        assert_eq!(s.logo.as_deref(), Some(dir.join("logos/main.png").as_path()));
        assert_eq!(s.drawing_frames, 1);
        assert_eq!(s.warnings.len(), 1);
        assert_eq!(s.skipped.len(), 1, "{:?}", s.skipped);

        // Chosen for every tool, and it reads back offline.
        assert_eq!(active(&root).unwrap().summary, installed.summary);
        clear_active(&root).unwrap();
        assert!(active(&root).is_none());
        assert!(dir.join("brand.yaml").is_file(), "the folder stays");

        // The token went only to the environment, on every request.
        let seen = seen.lock().unwrap();
        assert!(seen.iter().all(|l| l.ends_with("| Bearer jwt")), "{seen:?}");
        assert!(seen.iter().any(|l| l.contains("huisstijl.get?handelsnaam=Dorphout%20B.V.")), "{seen:?}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_wrong_token_is_unauthorized_and_leaves_the_old_folder() {
        let (source, _) = environment();
        let root = temp_root("token");
        let installed = refresh(&source, None, &root).unwrap();
        let wrong = Source { token: "oud".into(), ..source };
        assert_eq!(refresh(&wrong, None, &root).unwrap_err(), "unauthorized");
        assert_eq!(active(&root).unwrap().dir, installed.dir);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_folder_of_the_company_works_without_an_account() {
        let root = temp_root("map-root");
        let company = temp_root("map-bedrijf");
        fs::create_dir_all(company.join("logos")).unwrap();
        fs::write(company.join("logos/main.png"), PNG).unwrap();
        fs::write(
            company.join("brand.yaml"),
            "brand:\n  name: \"Bouwbedrijf Jansen\"\n  tagline: Degelijk\ncolors:\n  primary: \"#0055aa\"\n  text: rood\nfonts:\n  heading: Lato-Bold\nfont_files:\n  Lato-Bold: fonts/Lato-Bold.ttf\nlogos:\n  main: logos/main.png\nstationery:\n  cover: {source: stationery/cover.pdf}\n",
        )
        .unwrap();
        let installed = open_folder(&root, &company).unwrap();
        let s = &installed.summary;
        assert_eq!((s.origin.as_str(), s.brand.as_str(), s.tagline.as_deref()), ("map", "Bouwbedrijf Jansen", Some("Degelijk")));
        assert_eq!(s.color("primary"), Some("#0055AA"));
        assert_eq!(s.colors.len(), 1);
        assert_eq!(s.warnings.len(), 2, "{:?}", s.warnings);
        assert_eq!(s.stationery, vec!["cover".to_string()]);
        assert!(s.logo.as_ref().unwrap().ends_with("logos/main.png"));

        // A change on the drive shows up in every tool.
        fs::write(company.join("brand.yaml"), "brand:\n  name: Jansen Bouw\n").unwrap();
        assert_eq!(active(&root).unwrap().summary.brand, "Jansen Bouw");

        fs::write(company.join("brand.yaml"), "- geen\n- huisstijl\n").unwrap();
        assert!(active(&root).is_none());
        assert!(open_folder(&root, &company).is_err());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&company);
    }
}
