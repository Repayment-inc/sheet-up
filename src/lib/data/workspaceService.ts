import { join } from 'node:path';
import type { WorkspaceFile, BookFile } from '../../types/schema';
import {
  readWorkspaceFile,
  writeWorkspaceFile,
  readBookFile,
  writeBookFile
} from '../fs/jsonStore';

export interface LoadedWorkspace {
  filePath: string;
  data: WorkspaceFile;
}

export interface LoadedBook {
  filePath: string;
  data: BookFile;
}

export interface WorkspaceSnapshot {
  workspace: LoadedWorkspace;
  books: LoadedBook[];
}

export const loadWorkspace = async (workspacePath: string): Promise<WorkspaceSnapshot> => {
  const workspaceData = await readWorkspaceFile(workspacePath);

  const books = await Promise.all(
    workspaceData.books.map(async (bookRef) => {
      const bookPath = join(workspacePath, '..', bookRef.dataPath);
      const data = await readBookFile(bookPath);
      return { filePath: bookPath, data } as LoadedBook;
    })
  );

  return {
    workspace: { filePath: workspacePath, data: workspaceData },
    books
  };
};

export const saveWorkspace = async (
  snapshot: WorkspaceSnapshot,
  options?: { saveBooks?: boolean }
): Promise<void> => {
  const { workspace, books } = snapshot;
  await writeWorkspaceFile(workspace.filePath, workspace.data);

  if (options?.saveBooks ?? true) {
    await Promise.all(books.map((book) => writeBookFile(book.filePath, book.data)));
  }
};
