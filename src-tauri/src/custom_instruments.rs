use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, MutexGuard,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager,
};

const COUNT: usize = 15;
const MAX_FILE: usize = 8 * 1024 * 1024;
const MAX_TOTAL: usize = 48 * 1024 * 1024;
const MAX_MANIFEST: usize = 16 * 1024;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
static STORAGE: Mutex<()> = Mutex::new(());

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Articulation {
    NaturalDecay,
    Sustained,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    name: String,
    size: usize,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    id: String,
    name: String,
    articulation: Articulation,
    release_seconds: f64,
    created_at: u64,
    samples: Vec<Sample>,
}

#[derive(Deserialize)]
struct Import {
    name: String,
    articulation: Articulation,
    samples: Vec<Sample>,
}

fn io<T>(value: std::io::Result<T>) -> Result<T> {
    value.map_err(|e| e.to_string())
}

fn lock() -> Result<MutexGuard<'static, ()>> {
    STORAGE.lock().map_err(|e| e.to_string())
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

fn extension(name: &str) -> Option<&'static str> {
    match name.rsplit_once('.')?.1.to_ascii_lowercase().as_str() {
        "mp3" => Some("mp3"),
        "wav" => Some("wav"),
        _ => None,
    }
}

fn name(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control) {
        return Err("Instrument name must contain 1–80 printable characters.".into());
    }
    Ok(value.into())
}

fn valid_samples(samples: &[Sample]) -> bool {
    samples.len() == COUNT
        && samples.iter().all(|s| {
            !s.name.contains(['/', '\\'])
                && !s.name.chars().any(char::is_control)
                && s.name.len() <= 512
                && extension(&s.name).is_some()
                && (1..=MAX_FILE).contains(&s.size)
        })
        && samples.iter().map(|s| s.size).sum::<usize>() <= MAX_TOTAL
}

fn checked(path: &Path, directory: bool) -> Result<fs::Metadata> {
    let meta = io(fs::symlink_metadata(path))?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Unexpected reparse point.".into());
        }
    }
    if meta.file_type().is_symlink()
        || if directory {
            !meta.is_dir()
        } else {
            !meta.is_file()
        }
    {
        return Err("Unexpected file type in custom instrument storage.".into());
    }
    Ok(meta)
}

fn root(app: &AppHandle) -> Result<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("custom-instruments");
    io(fs::create_dir_all(&root))?;
    checked(&root, true)?;
    Ok(root)
}

fn directory(root: &Path, id: &str) -> Result<PathBuf> {
    if !valid_id(id) {
        return Err("Invalid custom instrument ID.".into());
    }
    let path = root.join(id);
    checked(&path, true)?;
    Ok(path)
}

fn sample_path(dir: &Path, index: usize, sample: &Sample) -> PathBuf {
    dir.join(format!(
        "{index}.{}",
        extension(&sample.name).expect("validated extension")
    ))
}

fn read_manifest(dir: &Path, id: &str) -> Result<Instrument> {
    let path = dir.join("instrument.json");
    if checked(&path, false)?.len() > MAX_MANIFEST as u64 {
        return Err("Invalid instrument manifest size.".into());
    }
    let result: Instrument =
        serde_json::from_slice(&io(fs::read(path))?).map_err(|e| e.to_string())?;
    if result.id != id
        || name(&result.name).is_err()
        || !valid_samples(&result.samples)
        || !(0.05..=2.0).contains(&result.release_seconds)
    {
        return Err("Invalid instrument manifest.".into());
    }
    Ok(result)
}

fn list(root: &Path) -> Result<Vec<Instrument>> {
    let mut instruments = Vec::new();
    for entry in io(fs::read_dir(root))?.filter_map(std::result::Result::ok) {
        let Some(id) = entry.file_name().into_string().ok() else {
            continue;
        };
        let Ok(dir) = directory(root, &id) else {
            continue;
        };
        let Ok(instrument) = read_manifest(&dir, &id) else {
            continue;
        };
        if instrument.samples.iter().enumerate().all(|(i, sample)| {
            checked(&sample_path(&dir, i, sample), false)
                .is_ok_and(|m| m.len() == sample.size as u64)
        }) {
            instruments.push(instrument);
        }
    }
    instruments.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.id.cmp(&b.id))
    });
    Ok(instruments)
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = io(fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path))?;
    io(file.write_all(bytes))?;
    io(file.sync_all())
}

fn manifest_bytes(instrument: &Instrument) -> Result<Vec<u8>> {
    serde_json::to_vec_pretty(instrument).map_err(|e| e.to_string())
}

fn has_format(bytes: &[u8], sample: &Sample) -> bool {
    match extension(&sample.name) {
        Some("wav") => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE"),
        Some("mp3") => {
            bytes.starts_with(b"ID3")
                || bytes
                    .get(..2)
                    .is_some_and(|b| b[0] == 255 && b[1] & 224 == 224)
        }
        _ => false,
    }
}

fn import(root: &Path, bytes: &[u8]) -> Result<Instrument> {
    let header = bytes.get(..4).ok_or("Missing import header.")?;
    let size = u32::from_le_bytes(header.try_into().unwrap()) as usize;
    if size > MAX_MANIFEST || bytes.len() > MAX_TOTAL + MAX_MANIFEST + 4 {
        return Err("Import exceeds the size limit.".into());
    }
    let metadata: Import =
        serde_json::from_slice(bytes.get(4..4 + size).ok_or("Incomplete import header.")?)
            .map_err(|e| e.to_string())?;
    if !valid_samples(&metadata.samples) {
        return Err("Expected 15 valid MP3 or WAV samples.".into());
    }
    let mut data = &bytes[4 + size..];
    let mut samples = Vec::with_capacity(COUNT);
    for sample in &metadata.samples {
        let content = data.get(..sample.size).ok_or("Incomplete sample data.")?;
        if !has_format(content, sample) {
            return Err(format!("Invalid audio format: {}", sample.name));
        }
        samples.push(content);
        data = &data[sample.size..];
    }
    if !data.is_empty() {
        return Err("Unexpected trailing sample data.".into());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let id = format!(
        "{:016x}{:08x}{:08x}",
        now.as_nanos() as u64,
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed) as u32
    );
    let instrument = Instrument {
        id: id.clone(),
        name: name(&metadata.name)?,
        articulation: metadata.articulation,
        release_seconds: match metadata.articulation {
            Articulation::NaturalDecay => 0.22,
            Articulation::Sustained => 0.32,
        },
        created_at: now.as_millis() as u64,
        samples: metadata.samples,
    };
    let temp = root.join(format!(".import-{id}"));
    io(fs::create_dir(&temp))?;
    let result = (|| {
        for (i, (sample, bytes)) in instrument.samples.iter().zip(samples).enumerate() {
            write_new(&sample_path(&temp, i, sample), bytes)?;
        }
        write_new(&temp.join("instrument.json"), &manifest_bytes(&instrument)?)?;
        io(fs::rename(&temp, root.join(&id)))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&temp);
    }
    result.map(|()| instrument)
}

fn rename(root: &Path, id: &str, new_name: &str) -> Result<Instrument> {
    let dir = directory(root, id)?;
    let mut instrument = read_manifest(&dir, id)?;
    instrument.name = name(new_name)?;
    let bytes = manifest_bytes(&instrument)?;
    let temp = dir.join("instrument.tmp");
    let path = dir.join("instrument.json");
    // std::fs::rename replaces an existing regular file on Windows and Unix.
    if temp.exists() {
        io(fs::remove_file(&temp))?;
    }
    let result = write_new(&temp, &bytes).and_then(|()| io(fs::rename(&temp, path)));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map(|()| instrument)
}

fn delete(root: &Path, id: &str) -> Result<()> {
    let dir = directory(root, id)?;
    // Move out of the visible catalog atomically before removing its contents.
    let retired = root.join(format!(".deleted-{id}"));
    io(fs::rename(&dir, &retired))?;
    if let Err(error) = fs::remove_dir_all(&retired) {
        // The instrument is already removed from the catalog. Preserve the
        // inaccessible directory for cleanup instead of reviving a partial bank.
        eprintln!("Failed to clean retired custom instrument {id}: {error}");
    }
    Ok(())
}

#[tauri::command]
pub fn list_custom_instruments(app: AppHandle) -> Result<Vec<Instrument>> {
    let _guard = lock()?;
    list(&root(&app)?)
}

#[tauri::command]
pub fn import_custom_instrument(app: AppHandle, request: Request<'_>) -> Result<Instrument> {
    let _guard = lock()?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary audio data.".into());
    };
    import(&root(&app)?, bytes)
}

#[tauri::command]
pub fn read_custom_instrument_sample(app: AppHandle, id: String, index: usize) -> Result<Response> {
    let _guard = lock()?;
    let dir = directory(&root(&app)?, &id)?;
    let instrument = read_manifest(&dir, &id)?;
    let sample = instrument
        .samples
        .get(index)
        .ok_or("Invalid sample index.")?;
    let path = sample_path(&dir, index, sample);
    if checked(&path, false)?.len() != sample.size as u64 {
        return Err("Sample size changed.".into());
    }
    let mut data = Vec::with_capacity(sample.size);
    io(io(fs::File::open(path))?
        .take(sample.size as u64 + 1)
        .read_to_end(&mut data))?;
    if data.len() != sample.size || !has_format(&data, sample) {
        return Err("Invalid stored sample.".into());
    }
    Ok(Response::new(data))
}

#[tauri::command]
pub fn rename_custom_instrument(
    app: AppHandle,
    id: String,
    new_name: String,
) -> Result<Instrument> {
    let _guard = lock()?;
    rename(&root(&app)?, &id, &new_name)
}

#[tauri::command]
pub fn delete_custom_instrument(app: AppHandle, id: String) -> Result<()> {
    let _guard = lock()?;
    delete(&root(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_bank_lifecycle_and_invalid_imports() {
        let root = std::env::temp_dir().join(format!(
            "sky-instrument-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let sample = b"RIFF\0\0\0\0WAVE";
        let metadata = serde_json::json!({
            "name": "Test", "articulation": "sustained",
            "samples": vec![serde_json::json!({"name":"Key0.WAV", "size":sample.len()}); COUNT]
        });
        let header = serde_json::to_vec(&metadata).unwrap();
        let mut packet = (header.len() as u32).to_le_bytes().to_vec();
        packet.extend(header);
        for _ in 0..COUNT {
            packet.extend(sample);
        }
        assert!(import(&root, &packet[..packet.len() - 1]).is_err());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        assert!(directory(&root, "../outside").is_err());

        let created = import(&root, &packet).unwrap();
        let dir = directory(&root, &created.id).unwrap();
        assert_eq!(list(&root).unwrap()[0].id, created.id);
        assert_eq!(fs::read(dir.join("0.wav")).unwrap(), sample);
        assert_eq!(
            rename(&root, &created.id, "Renamed").unwrap().name,
            "Renamed"
        );
        assert_eq!(list(&root).unwrap()[0].name, "Renamed");

        fs::remove_file(dir.join("3.wav")).unwrap();
        assert!(list(&root).unwrap().is_empty());
        fs::write(dir.join("instrument.json"), b"{").unwrap();
        assert!(read_manifest(&dir, &created.id).is_err());
        assert!(list(&root).unwrap().is_empty());
        delete(&root, &created.id).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    }
}
