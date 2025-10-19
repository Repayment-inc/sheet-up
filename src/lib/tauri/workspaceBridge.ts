import { invoke } from '@tauri-apps/api/core';
import { open, message as showSystemMessage } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import type { LoadedFile, WorkspaceSnapshot } from '../../types/workspaceSnapshot';
import type { WorkspaceFile, BookFile } from '../../types/schema';
import { validateBookFile, validateWorkspaceFile } from '../schemaValidator';
import { isTauri } from '../env';

interface FilePayloadDto {
  filePath: unknown;
  data: unknown;
}

interface WorkspaceSnapshotDto {
  workspace: FilePayloadDto;
  books: FilePayloadDto[];
}

const ensureString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} が不正です。`);
  }
  return value;
};

const normalizeWorkspace = (payload: FilePayloadDto): LoadedFile<WorkspaceFile> => {
  const filePath = ensureString(payload.filePath, 'workspace.filePath');
  const validation = validateWorkspaceFile(payload.data);
  if (!validation.valid) {
    throw new Error(`workspace.json の内容が不正です。\n${validation.errors.join('\n')}`);
  }
  return {
    filePath,
    data: payload.data as WorkspaceFile
  };
};

const normalizeBook = (payload: FilePayloadDto): LoadedFile<BookFile> => {
  const filePath = ensureString(payload.filePath, 'book.filePath');
  const validation = validateBookFile(payload.data);
  if (!validation.valid) {
    throw new Error(`ブックファイルの内容が不正です。\n${validation.errors.join('\n')}`);
  }
  return {
    filePath,
    data: payload.data as BookFile
  };
};

const normalizeSnapshot = (snapshot: WorkspaceSnapshotDto): WorkspaceSnapshot => ({
  workspace: normalizeWorkspace(snapshot.workspace),
  books: snapshot.books.map(normalizeBook)
});

export const selectWorkspaceDirectory = async (): Promise<string | null> => {
  const selection = await open({
    directory: true,
    multiple: false,
    title: 'ワークスペースフォルダを選択'
  });

  if (selection === null) {
    return null;
  }

  return Array.isArray(selection) ? selection[0] : selection;
};

export const resolveWorkspaceFilePath = async (path: string): Promise<string> => {
  if (path.toLowerCase().endsWith('workspace.json')) {
    return path;
  }
  return join(path, 'workspace.json');
};

export const loadWorkspaceSnapshot = async (workspacePath: string): Promise<WorkspaceSnapshot> => {
  const dto = await invoke<WorkspaceSnapshotDto>('load_workspace_snapshot', {
    path: workspacePath
  });
  return normalizeSnapshot(dto);
};

export const saveWorkspaceSnapshot = async (
  snapshot: WorkspaceSnapshot
): Promise<void> => {
  await invoke('save_workspace_snapshot', { snapshot });
};

export const openWorkspaceFromDialog = async (): Promise<WorkspaceSnapshot | null> => {
  const directory = await selectWorkspaceDirectory();
  if (!directory) {
    return null;
  }
  const workspacePath = await resolveWorkspaceFilePath(directory);
  return loadWorkspaceSnapshot(workspacePath);
};

export const showErrorDialog = async (title: string, description: string): Promise<void> => {
  if (isTauri) {
    await showSystemMessage(description, {
      title,
      kind: 'error'
    });
  } else {
    // eslint-disable-next-line no-alert -- 非Tauri環境でのフォールバック
    window.alert(`${title}\n${description}`);
  }
};
