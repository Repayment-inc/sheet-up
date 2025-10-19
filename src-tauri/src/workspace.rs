use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct FilePayload {
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub data: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceSnapshotPayload {
    pub workspace: FilePayload,
    pub books: Vec<FilePayload>,
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let contents = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    serde_json::from_str(&contents)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {}", parent.display(), err))?;
    }

    let payload = serde_json::to_string_pretty(value)
        .map_err(|err| format!("Failed to serialize JSON for {}: {}", path.display(), err))?;
    let mut payload_with_newline = payload;
    payload_with_newline.push('\n');

    fs::write(path, payload_with_newline)
        .map_err(|err| format!("Failed to write {}: {}", path.display(), err))
}

fn resolve_books(
    workspace_path: &Path,
    workspace_data: &Value,
) -> Result<Vec<FilePayload>, String> {
    let workspace_dir = workspace_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let books = workspace_data
        .get("books")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut result = Vec::with_capacity(books.len());

    for (index, book_ref) in books.iter().enumerate() {
        let data_path = book_ref
            .get("dataPath")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("books[{}].dataPath is missing or invalid", index))?;

        let absolute_path = workspace_dir.join(data_path);
        let book_data = read_json_file(&absolute_path)?;
        result.push(FilePayload {
            file_path: absolute_path
                .to_string_lossy()
                .into_owned(),
            data: book_data,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn load_workspace_snapshot(path: String) -> Result<WorkspaceSnapshotPayload, String> {
    let workspace_path = PathBuf::from(&path);
    let workspace_data = read_json_file(&workspace_path)?;
    let books = resolve_books(&workspace_path, &workspace_data)?;

    Ok(WorkspaceSnapshotPayload {
        workspace: FilePayload {
            file_path: workspace_path.to_string_lossy().into_owned(),
            data: workspace_data,
        },
        books,
    })
}

#[tauri::command]
pub fn save_workspace_snapshot(snapshot: WorkspaceSnapshotPayload) -> Result<(), String> {
    let workspace_path = PathBuf::from(&snapshot.workspace.file_path);
    write_json_file(&workspace_path, &snapshot.workspace.data)?;

    for book in snapshot.books {
        let book_path = PathBuf::from(&book.file_path);
        write_json_file(&book_path, &book.data)?;
    }

    Ok(())
}
