import type { BookFile, WorkspaceFile } from './schema';

export interface LoadedFile<TData> {
  filePath: string;
  data: TData;
}

export interface WorkspaceSnapshot {
  workspace: LoadedFile<WorkspaceFile>;
  books: LoadedFile<BookFile>[];
}
