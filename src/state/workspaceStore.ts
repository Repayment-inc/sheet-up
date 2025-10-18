import { create } from 'zustand';
import { isTauri } from '../lib/env';
import { buildNewBookSnapshot } from '../lib/workspace/bookFactory';
import { buildNewSheetSnapshot } from '../lib/workspace/sheetFactory';
import { sampleWorkspace, sampleBook } from '../samples/sampleData';
import type { WorkspaceSnapshot } from '../types/workspaceSnapshot';
import type { BookFile } from '../types/schema';

export type BusyState = 'idle' | 'loading' | 'saving';

const MAX_HISTORY_ENTRIES = 100;

type HistoryEntry = {
  snapshot: WorkspaceSnapshot;
  selectedBookId: string | null;
  selectedSheetId: string | null;
};

export type CellUpdate = { rowKey: string; columnKey: string; value: string };

const sampleSnapshot: WorkspaceSnapshot = {
  workspace: { filePath: 'sample/workspace.json', data: sampleWorkspace },
  books: [{ filePath: 'sample/books/book-001.json', data: sampleBook }]
};

const cloneSnapshot = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const findActiveSheetId = (book: BookFile | undefined): string | null =>
  book?.sheets[0]?.id ?? null;

const deriveInitialSelection = (
  snapshot: WorkspaceSnapshot
): { bookId: string | null; sheetId: string | null } => {
  const fallbackBookFromWorkspace = snapshot.workspace.data.books[0]?.id ?? null;
  const fallbackBookFromFiles = snapshot.books[0]?.data.book.id ?? null;
  const nextBookId = fallbackBookFromWorkspace ?? fallbackBookFromFiles;
  const matchingBook = snapshot.books.find((book) => book.data.book.id === nextBookId)?.data;
  const nextSheetId = findActiveSheetId(matchingBook);
  return { bookId: nextBookId, sheetId: nextSheetId };
};

const createDefaultBookName = (snapshot: WorkspaceSnapshot): string => {
  const base = '新しいブック';
  const existingNames = a Set(
    snapshot.books.map((entry) => entry.data.book.name ?? entry.data.book.id)
  );

  if (!existingNames.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingNames.has(`${base} (${counter})`)) {
    counter += 1;
  }
  return `${base} (${counter})`;
};

...