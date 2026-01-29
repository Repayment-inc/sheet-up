use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use time::format_description::well_known::Iso8601;
use time::OffsetDateTime;
use uuid::Uuid;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub parent_dir: String,
    pub workspace_name: String,
    #[serde(default = "default_include_sample")]
    pub include_sample: bool,
}

const WORKSPACE_NAME_MIN: usize = 1;
const WORKSPACE_NAME_MAX: usize = 48;
const SCHEMA_VERSION: &str = "1.0.0";
const SAMPLE_BOOK_TITLE: &str = "スターターブック";
const SAMPLE_SHEET_TITLE: &str = "サンプルシート";

fn default_include_sample() -> bool {
    true
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
            file_path: absolute_path.to_string_lossy().into_owned(),
            data: book_data,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn create_workspace(
    request: CreateWorkspaceRequest,
) -> Result<WorkspaceSnapshotPayload, String> {
    let parent_path = PathBuf::from(&request.parent_dir);
    if !parent_path.exists() {
        return Err("指定されたフォルダが存在しません。".into());
    }
    if !parent_path.is_dir() {
        return Err("フォルダを選択してください。".into());
    }

    let normalized_name = validate_workspace_name(&request.workspace_name)?;
    let workspace_dir = parent_path.join(&normalized_name);
    if workspace_dir.exists() {
        return Err("同じ名前のワークスペースフォルダが既に存在します。".into());
    }

    fs::create_dir(&workspace_dir)
        .map_err(|err| format!("{} の作成に失敗しました: {}", workspace_dir.display(), err))?;
    fs::create_dir_all(workspace_dir.join("books"))
        .map_err(|err| format!("books ディレクトリの作成に失敗しました: {}", err))?;
    fs::create_dir_all(workspace_dir.join("thumbs"))
        .map_err(|err| format!("thumbs ディレクトリの作成に失敗しました: {}", err))?;

    let documents = build_workspace_documents(&normalized_name, request.include_sample);
    let workspace_path = workspace_dir.join("workspace.json");
    write_json_file(&workspace_path, &documents.workspace)?;

    for book in documents.books {
        let absolute = workspace_dir.join(book.relative_path);
        write_json_file(&absolute, &book.data)?;
    }

    load_workspace_snapshot(workspace_path.to_string_lossy().into_owned())
}

fn now_iso_string() -> String {
    OffsetDateTime::now_utc()
        .format(&Iso8601::DEFAULT)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn generate_id(prefix: &str) -> String {
    format!("{}-{}", prefix, Uuid::new_v4())
}

fn has_leading_or_trailing_space_or_dot(value: &str) -> bool {
    let mut chars = value.chars();
    let starts_invalid = chars
        .next()
        .map(|c| c.is_whitespace() || c == '.')
        .unwrap_or(false);
    let ends_invalid = value
        .chars()
        .rev()
        .next()
        .map(|c| c.is_whitespace() || c == '.')
        .unwrap_or(false);
    starts_invalid || ends_invalid
}

fn contains_control_char(value: &str) -> bool {
    value.chars().any(|c| c.is_control())
}

fn contains_forbidden_char(value: &str) -> bool {
    value
        .chars()
        .any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
}

fn is_reserved_name(value: &str) -> bool {
    const RESERVED: [&str; 22] = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];

    if value == "." || value == ".." {
        return true;
    }

    RESERVED.contains(&value.to_ascii_lowercase().as_str())
}

fn validate_workspace_name(input: &str) -> Result<String, String> {
    if input.is_empty() {
        return Err("名前を入力してください。".into());
    }

    let normalized = input.trim();
    if normalized.is_empty() {
        return Err("名前を入力してください。".into());
    }

    if normalized.len() < WORKSPACE_NAME_MIN {
        return Err(format!(
            "{}文字以上で入力してください。",
            WORKSPACE_NAME_MIN
        ));
    }

    if normalized.len() > WORKSPACE_NAME_MAX {
        return Err(format!(
            "{}文字以内で入力してください。",
            WORKSPACE_NAME_MAX
        ));
    }

    if has_leading_or_trailing_space_or_dot(input) {
        return Err("先頭と末尾に空白またはドットは使用できません。".into());
    }

    if contains_control_char(normalized) {
        return Err("制御文字は使用できません。".into());
    }

    if contains_forbidden_char(normalized) {
        return Err("\\ / : * ? \" < > | などの記号は使用できません。".into());
    }

    if is_reserved_name(normalized) {
        return Err("この名称はファイルシステムで予約されているため使用できません。".into());
    }

    Ok(normalized.to_string())
}

struct BookDocument {
    relative_path: String,
    data: Value,
}

struct WorkspaceDocuments {
    workspace: Value,
    books: Vec<BookDocument>,
}

fn build_workspace_documents(name: &str, include_sample: bool) -> WorkspaceDocuments {
    let now = now_iso_string();
    let workspace_id = generate_id("workspace");

    let mut books: Vec<Value> = Vec::new();
    let mut book_documents: Vec<BookDocument> = Vec::new();
    let mut recent_book_ids: Vec<String> = Vec::new();
    let mut recent_sheet_ids: Vec<String> = Vec::new();

    if include_sample {
        let book_id = generate_id("book");
        let sheet_id = generate_id("sheet");
        let data_path = format!("books/{}.json", book_id);

        books.push(json!({
            "id": book_id.clone(),
            "name": format!("{SAMPLE_BOOK_TITLE}.json"),
            "folderId": Value::Null,
            "order": 0,
            "dataPath": data_path,
            "activeSheetId": sheet_id.clone(),
            "createdAt": now,
            "updatedAt": now
        }));

        book_documents.push(BookDocument {
            relative_path: data_path,
            data: json!({
                "schemaVersion": SCHEMA_VERSION,
                "book": {
                    "id": book_id.clone(),
                    "name": SAMPLE_BOOK_TITLE,
                    "createdAt": now,
                    "updatedAt": now,
                    "properties": {
                        "defaultFormat": "plain",
                        "locked": false
                    }
                },
                "sheets": [
                    {
                        "id": sheet_id.clone(),
                        "name": SAMPLE_SHEET_TITLE,
                        "gridSize": {"rows": 100, "cols": 26},
                        "settings": {"locked": false},
                        "rows": {
                            "1": {
                                "A": {"value": "タイトル", "type": "string"},
                                "B": {"value": "ステータス", "type": "string"}
                            },
                            "2": {
                                "A": {"value": "サンプル項目", "type": "string"},
                                "B": {"value": "進行中", "type": "string"}
                            }
                        }
                    }
                ]
            }),
        });

        recent_book_ids.push(book_id);
        recent_sheet_ids.push(sheet_id);
    }

    let workspace = json!({
        "schemaVersion": SCHEMA_VERSION,
        "workspace": {
            "id": workspace_id,
            "name": name,
            "createdAt": now,
            "updatedAt": now,
            "settings": {
                "theme": "system",
                "sidebarWidth": 280,
                "recentBookIds": recent_book_ids,
                "recentSheetIds": recent_sheet_ids
            }
        },
        "folders": [],
        "books": books
    });

    WorkspaceDocuments {
        workspace,
        books: book_documents,
    }
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

#[tauri::command]
pub fn delete_book_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    match fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(err) => {
            if err.kind() == std::io::ErrorKind::NotFound {
                Ok(())
            } else {
                Err(format!("Failed to delete {}: {}", path.display(), err))
            }
        }
    }
}
