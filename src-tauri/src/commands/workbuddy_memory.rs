use crate::config::{atomic_write_private, get_home_dir};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};

const LIMIT: usize = 256 * 1024;
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkBuddyMemoryFile {
    content: String,
    revision: String,
    exists: bool,
}

fn path_for(root: &Path, filename: &str) -> Result<PathBuf, String> {
    if !matches!(filename, "MEMORY.md" | "USER.md" | "SOUL.md") {
        return Err("workbuddy_memory_invalid_file".into());
    }
    let path = root.join(filename);
    match fs::symlink_metadata(&path) {
        Ok(meta) if !meta.file_type().is_file() => {
            return Err("workbuddy_memory_not_regular".into())
        }
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => {
            return Err("workbuddy_memory_read_failed".into())
        }
        _ => {}
    }
    Ok(path)
}

fn read_file(root: &Path, filename: &str) -> Result<WorkBuddyMemoryFile, String> {
    let path = path_for(root, filename)?;
    let file = match fs::File::open(&path) {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(WorkBuddyMemoryFile {
                content: String::new(),
                revision: "missing".into(),
                exists: false,
            })
        }
        Err(_) => return Err("workbuddy_memory_read_failed".into()),
    };
    let mut bytes = Vec::new();
    file.take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "workbuddy_memory_read_failed")?;
    if bytes.len() > LIMIT {
        return Err("workbuddy_memory_too_large".into());
    }
    let revision = format!("{:x}", Sha256::digest(&bytes));
    let content = String::from_utf8(bytes).map_err(|_| "workbuddy_memory_invalid_text")?;
    Ok(WorkBuddyMemoryFile {
        content,
        revision,
        exists: true,
    })
}

fn save_file(
    root: &Path,
    filename: &str,
    content: &str,
    expected_revision: &str,
) -> Result<WorkBuddyMemoryFile, String> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| "workbuddy_memory_write_failed")?;
    if content.len() > LIMIT {
        return Err("workbuddy_memory_too_large".into());
    }
    let previous = read_file(root, filename)?;
    if previous.revision != expected_revision {
        return Err("workbuddy_memory_conflict".into());
    }
    if previous.exists && previous.content == content {
        return Ok(previous);
    }
    if previous.exists {
        let backup = root
            .join(".qiniu-switch-backups")
            .join(uuid::Uuid::new_v4().to_string())
            .join(filename);
        atomic_write_private(&backup, previous.content.as_bytes())
            .map_err(|_| "workbuddy_memory_backup_failed")?;
    }
    // WorkBuddy can also edit these files; do not overwrite a change that happened during backup.
    if read_file(root, filename)?.revision != expected_revision {
        return Err("workbuddy_memory_conflict".into());
    }
    atomic_write_private(&path_for(root, filename)?, content.as_bytes())
        .map_err(|_| "workbuddy_memory_write_failed")?;
    Ok(WorkBuddyMemoryFile {
        content: content.into(),
        revision: format!("{:x}", Sha256::digest(content.as_bytes())),
        exists: true,
    })
}

#[tauri::command]
pub fn workbuddy_read_memory(filename: String) -> Result<WorkBuddyMemoryFile, String> {
    read_file(&get_home_dir().join(".workbuddy"), &filename)
}

#[tauri::command]
pub fn workbuddy_save_memory(
    filename: String,
    content: String,
    expected_revision: String,
) -> Result<WorkBuddyMemoryFile, String> {
    save_file(
        &get_home_dir().join(".workbuddy"),
        &filename,
        &content,
        &expected_revision,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_with_backup_and_rejects_stale_edits() {
        let root = tempfile::tempdir().unwrap();
        let first = save_file(root.path(), "MEMORY.md", "old", "missing").unwrap();
        let second = save_file(root.path(), "MEMORY.md", "new", &first.revision).unwrap();
        assert_eq!(second.content, "new");
        let backup = fs::read_dir(root.path().join(".qiniu-switch-backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path()
            .join("MEMORY.md");
        assert_eq!(fs::read_to_string(backup).unwrap(), "old");
        assert_eq!(
            save_file(root.path(), "MEMORY.md", "stale", &first.revision)
                .err()
                .as_deref(),
            Some("workbuddy_memory_conflict")
        );
        assert_eq!(read_file(root.path(), "MEMORY.md").unwrap().content, "new");
    }
    #[test]
    fn rejects_arbitrary_files_and_oversized_text() {
        let root = tempfile::tempdir().unwrap();
        for filename in ["../USER.md", "settings.json", "memory/cloud.md"] {
            assert!(read_file(root.path(), filename).is_err());
        }
        assert!(save_file(root.path(), "SOUL.md", &"x".repeat(LIMIT + 1), "missing").is_err());
        #[cfg(unix)]
        {
            let outside = tempfile::NamedTempFile::new().unwrap();
            std::os::unix::fs::symlink(outside.path(), root.path().join("USER.md")).unwrap();
            assert!(read_file(root.path(), "USER.md").is_err());
        }
    }
}
