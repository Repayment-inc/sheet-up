import type { BookFile, BookReference, WorkspaceFile } from '../../types/schema';
import type { LoadedFile, WorkspaceSnapshot } from '../../types/workspaceSnapshot';

const BOOKS_DIR = 'books';
const DEFAULT_SHEET_NAME = 'シート1';
const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;

const normalizeName = (name: string): string => name.trim();

const buildBookFileName = (bookName: string): string =>
  `${bookName.replace(/\//g, '／')}.json`;

const hasBackslash = (path: string): boolean => path.includes('\\');

const normalizeSeparators = (value: string): string => value.replace(/\\/g, '/');

const toSystemSeparators = (value: string, useBackslash: boolean): string =>
  useBackslash ? value.replace(/\//g, '\\') : value;

const resolveWorkspaceDir = (workspacePath: string): { normalized: string; useBackslash: boolean } => {
  const useBackslash = hasBackslash(workspacePath);
  const normalized = normalizeSeparators(workspacePath);
  const segments = normalized.split('/');
  segments.pop();
  return { normalized: segments.join('/'), useBackslash };
};

const joinWorkspacePath = (
  workspaceDir: { normalized: string; useBackslash: boolean },
  relative: string
): string => {
  const normalizedRelative = normalizeSeparators(relative).replace(/^\//, '');
  const combined = `${workspaceDir.normalized}/${normalizedRelative}`.replace(/\/+/, '/');
  return toSystemSeparators(combined, workspaceDir.useBackslash);
};

const generateId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

interface BuildBookResult {
  workspaceData: WorkspaceFile;
  bookReference: BookReference;
  loadedBook: LoadedFile<BookFile>;
  defaultSheetId: string;
}

export const buildNewBookSnapshot = (
  nameInput: string,
  snapshot: WorkspaceSnapshot
): BuildBookResult => {
  const trimmedName = normalizeName(nameInput);
  if (!trimmedName) {
    throw new Error('ブック名が入力されていません。');
  }

  const now = new Date().toISOString();
  const bookId = generateId('book');
  const sheetId = generateId('sheet');

  const workspaceDir = resolveWorkspaceDir(snapshot.workspace.filePath);
  const fileName = buildBookFileName(trimmedName);
  const dataPath = `${BOOKS_DIR}/${fileName}`;
  const absoluteBookPath = joinWorkspacePath(workspaceDir, dataPath);

  const bookFile: BookFile = {
    schemaVersion: snapshot.workspace.data.schemaVersion,
    book: {
      id: bookId,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      properties: {
        defaultFormat: 'plain',
        locked: false
      }
    },
    sheets: [
      {
        id: sheetId,
        name: DEFAULT_SHEET_NAME,
        gridSize: { rows: DEFAULT_ROWS, cols: DEFAULT_COLS },
        settings: {},
        rows: {}
      }
    ]
  };

  const nextOrder = snapshot.workspace.data.books.length;

  const bookReference: BookReference = {
    id: bookId,
    name: buildBookFileName(trimmedName),
    folderId: null,
    order: nextOrder,
    dataPath,
    activeSheetId: sheetId,
    createdAt: now,
    updatedAt: now
  };

  const previousWorkspace = snapshot.workspace.data;
  const previousSettings = previousWorkspace.workspace.settings ?? {};

  const updatedRecentBooks = [
    bookId,
    ...((previousSettings.recentBookIds ?? []).filter((id) => id !== bookId))
  ].slice(0, 20);
  const updatedRecentSheets = [
    sheetId,
    ...((previousSettings.recentSheetIds ?? []).filter((id) => id !== sheetId))
  ].slice(0, 20);

  const workspaceData: WorkspaceFile = {
    ...previousWorkspace,
    workspace: {
      ...previousWorkspace.workspace,
      updatedAt: now,
      settings: {
        ...previousSettings,
        recentBookIds: updatedRecentBooks,
        recentSheetIds: updatedRecentSheets
      }
    },
    books: [...previousWorkspace.books, bookReference]
  };

  const loadedBook: LoadedFile<BookFile> = {
    filePath: absoluteBookPath,
    data: bookFile
  };

  return {
    workspaceData,
    bookReference,
    loadedBook,
    defaultSheetId: sheetId
  };
};
