// Core data structures shared between workspace.json and books/{bookId}.json
export type EntityId = string;

export type ThemePreference = 'light' | 'dark' | 'system';

export interface WorkspaceSettings {
  theme?: ThemePreference;
  sidebarWidth?: number;
  recentBookIds?: EntityId[];
  recentSheetIds?: EntityId[];
  [key: string]: unknown;
}

export interface WorkspaceMeta {
  id: EntityId;
  name: string;
  createdAt: string; // ISO8601 timestamp
  updatedAt?: string;
  settings?: WorkspaceSettings;
}

export interface FolderMeta {
  id: EntityId;
  name: string;
  parentId?: EntityId | null;
  order: number;
  metadata?: Record<string, unknown>;
}

export interface BookReference {
  id: EntityId;
  name: string;
  folderId?: EntityId | null;
  order: number;
  dataPath: string;
  thumbPath?: string;
  activeSheetId?: EntityId;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceFile {
  schemaVersion: string;
  workspace: WorkspaceMeta;
  folders: FolderMeta[];
  books: BookReference[];
}

export interface GridSize {
  rows: number;
  cols: number;
}

export type CellType = 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty';

export interface CellData {
  value: string | number | boolean | null;
  type: CellType;
  format?: string;
  formula?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export type RowData = Record<string, CellData>;

export interface SheetSettings {
  locked?: boolean;
  tabColor?: string;
  [key: string]: unknown;
}

export interface SheetData {
  id: EntityId;
  name: string;
  gridSize: GridSize;
  settings?: SheetSettings;
  rows: Record<string, RowData>;
}

export interface BookProperties {
  defaultFormat?: string;
  locked?: boolean;
  [key: string]: unknown;
}

export interface BookMeta {
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt?: string;
  properties?: BookProperties;
}

export interface BookFile {
  schemaVersion: string;
  book: BookMeta;
  sheets: SheetData[];
}
