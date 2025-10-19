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
  const existingNames = new Set(
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

type WorkspaceStoreState = {
  snapshot: WorkspaceSnapshot | null;
  selectedBookId: string | null;
  selectedSheetId: string | null;
  busyState: BusyState;
  autoSaveEnabled: boolean;
  history: HistoryEntry[];
  future: HistoryEntry[];
};

type WorkspaceStoreActions = {
  setBusyState: (state: BusyState) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  resetWorkspace: () => void;
  loadWorkspace: (snapshot: WorkspaceSnapshot) => void;
  selectBook: (bookId: string) => void;
  selectSheet: (bookId: string, sheetId: string) => void;
  createBook: () => WorkspaceSnapshot;
  createSheet: (bookId: string) => { snapshot: WorkspaceSnapshot; sheetId: string };
  applyCellUpdates: (updates: CellUpdate[]) => WorkspaceSnapshot | null;
  renameBook: (bookId: string, nextName: string) => WorkspaceSnapshot | null;
  undo: () => WorkspaceSnapshot | null;
  redo: () => WorkspaceSnapshot | null;
};

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

const initialSelection = deriveInitialSelection(sampleSnapshot);

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const recordSnapshotForUndo = () => {
    const { snapshot, selectedBookId, selectedSheetId, history } = get();
    if (!snapshot) return;

    const entry: HistoryEntry = {
      snapshot: cloneSnapshot(snapshot),
      selectedBookId,
      selectedSheetId
    };

    const nextHistory =
      history.length >= MAX_HISTORY_ENTRIES
        ? [...history.slice(history.length - MAX_HISTORY_ENTRIES + 1), entry]
        : [...history, entry];

    set({
      history: nextHistory,
      future: []
    });
  };

  const applySelectionAfterSnapshot = (snapshot: WorkspaceSnapshot | null) => {
    if (!snapshot) {
      set({ selectedBookId: null, selectedSheetId: null });
      return;
    }
    const { bookId, sheetId } = deriveInitialSelection(snapshot);
    set({ selectedBookId: bookId, selectedSheetId: sheetId });
  };

  return {
    snapshot: isTauri ? null : sampleSnapshot,
    selectedBookId: isTauri ? null : initialSelection.bookId,
    selectedSheetId: isTauri ? null : initialSelection.sheetId,
    busyState: 'idle',
    autoSaveEnabled: isTauri,
    history: [],
    future: [],

    setBusyState: (state) => set({ busyState: state }),
    setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),

    resetWorkspace: () => {
      set({
        snapshot: null,
        selectedBookId: null,
        selectedSheetId: null,
        history: [],
        future: []
      });
    },

    loadWorkspace: (snapshot) => {
      set({
        snapshot,
        history: [],
        future: []
      });
      applySelectionAfterSnapshot(snapshot);
    },

    selectBook: (bookId) => {
      const { snapshot } = get();
      if (!snapshot) {
        set({ selectedBookId: null, selectedSheetId: null });
        return;
      }
      const matchingBook = snapshot.books.find((entry) => entry.data.book.id === bookId)?.data;
      set({
        selectedBookId: bookId,
        selectedSheetId: findActiveSheetId(matchingBook)
      });
    },

    selectSheet: (bookId, sheetId) => {
      set({
        selectedBookId: bookId,
        selectedSheetId: sheetId
      });
    },

    createBook: () => {
      const { snapshot } = get();
      if (!snapshot) {
        throw new Error('ワークスペースを開いてから新規ブックを作成してください。');
      }

      recordSnapshotForUndo();

      const desiredName = createDefaultBookName(snapshot);
      const { workspaceData, loadedBook, defaultSheetId } = buildNewBookSnapshot(desiredName, snapshot);

      const nextSnapshot: WorkspaceSnapshot = {
        workspace: { filePath: snapshot.workspace.filePath, data: workspaceData },
        books: [...snapshot.books, loadedBook]
      };

      set({
        snapshot: nextSnapshot,
        selectedBookId: loadedBook.data.book.id,
        selectedSheetId: defaultSheetId
      });

      return nextSnapshot;
    },

    createSheet: (bookId) => {
      const { snapshot } = get();
      if (!snapshot) {
        throw new Error('ワークスペースを開いてからシートを追加してください。');
      }

      const bookIndex = snapshot.books.findIndex((entry) => entry.data.book.id === bookId);
      if (bookIndex === -1) {
        throw new Error('指定されたブックが見つかりません。');
      }

      recordSnapshotForUndo();

      const { bookFile, defaultSheetId } = buildNewSheetSnapshot(snapshot.books[bookIndex].data);
      const nextBooks = snapshot.books.map((entry, index) =>
        index === bookIndex ? { ...entry, data: bookFile } : entry
      );

      const now = new Date().toISOString();
      const previousSettings = snapshot.workspace.data.workspace.settings ?? {};
      const updatedRecentBookIds = [
        bookId,
        ...((previousSettings.recentBookIds ?? []).filter((id) => id !== bookId))
      ].slice(0, 20);
      const updatedRecentSheetIds = [
        defaultSheetId,
        ...((previousSettings.recentSheetIds ?? []).filter((id) => id !== defaultSheetId))
      ].slice(0, 20);

      const updatedWorkspaceBooks = snapshot.workspace.data.books.map((ref) =>
        ref.id === bookId ? { ...ref, activeSheetId: defaultSheetId, updatedAt: now } : ref
      );

      const workspaceData: WorkspaceSnapshot['workspace']['data'] = {
        ...snapshot.workspace.data,
        workspace: {
          ...snapshot.workspace.data.workspace,
          updatedAt: now,
          settings: {
            ...previousSettings,
            recentBookIds: updatedRecentBookIds,
            recentSheetIds: updatedRecentSheetIds
          }
        },
        books: updatedWorkspaceBooks
      };

      const nextSnapshot: WorkspaceSnapshot = {
        workspace: { ...snapshot.workspace, data: workspaceData },
        books: nextBooks
      };

      set({
        snapshot: nextSnapshot,
        selectedBookId: bookId,
        selectedSheetId: defaultSheetId
      });

      return { snapshot: nextSnapshot, sheetId: defaultSheetId };
    },

    applyCellUpdates: (updates) => {
      if (updates.length === 0) {
        return null;
      }

      const { snapshot, selectedBookId, selectedSheetId } = get();
      if (!snapshot || !selectedBookId || !selectedSheetId) {
        return null;
      }

      const bookIndex = snapshot.books.findIndex((entry) => entry.data.book.id === selectedBookId);
      if (bookIndex === -1) {
        return null;
      }

      const bookEntry = snapshot.books[bookIndex];
      const sheetIndex = bookEntry.data.sheets.findIndex((sheet) => sheet.id === selectedSheetId);
      if (sheetIndex === -1) {
        return null;
      }

      const targetSheet = bookEntry.data.sheets[sheetIndex];
      const currentRows = targetSheet.rows ?? {};
      const nextRows = { ...currentRows };

      let hasEffectiveChange = false;

      updates.forEach(({ rowKey, columnKey, value }) => {
        const currentRowData = currentRows[rowKey] ?? {};
        const currentCell = currentRowData[columnKey];
        const nextRowData = { ...(nextRows[rowKey] ?? {}) };
        const trimmed = value.trim();

        if (trimmed === '') {
          if (currentCell !== undefined) {
            hasEffectiveChange = true;
          }
          delete nextRowData[columnKey];
        } else {
          const numeric = Number(trimmed);
          if (!Number.isNaN(numeric) && trimmed !== '') {
            if (!currentCell || currentCell.type !== 'number' || currentCell.value !== numeric) {
              hasEffectiveChange = true;
            }
            nextRowData[columnKey] = { value: numeric, type: 'number' };
          } else {
            if (!currentCell || currentCell.type !== 'string' || currentCell.value !== value) {
              hasEffectiveChange = true;
            }
            nextRowData[columnKey] = { value, type: 'string' };
          }
        }

        if (Object.keys(nextRowData).length === 0) {
          if (nextRows[rowKey] !== undefined) {
            delete nextRows[rowKey];
          }
        } else {
          nextRows[rowKey] = nextRowData;
        }
      });

      if (!hasEffectiveChange) {
        return null;
      }

      recordSnapshotForUndo();

      const nextSheets = [...bookEntry.data.sheets];
      nextSheets[sheetIndex] = {
        ...targetSheet,
        rows: nextRows
      };

      const now = new Date().toISOString();
      const previousSettings = snapshot.workspace.data.workspace.settings ?? {};
      const updatedRecentBookIds = [
        selectedBookId,
        ...((previousSettings.recentBookIds ?? []).filter((id) => id !== selectedBookId))
      ].slice(0, 20);
      const updatedRecentSheetIds = [
        selectedSheetId,
        ...((previousSettings.recentSheetIds ?? []).filter((id) => id !== selectedSheetId))
      ].slice(0, 20);

      const updatedWorkspaceBooks = snapshot.workspace.data.books.map((ref) =>
        ref.id === selectedBookId
          ? { ...ref, activeSheetId: selectedSheetId, updatedAt: now }
          : ref
      );

      const workspaceData: WorkspaceSnapshot['workspace']['data'] = {
        ...snapshot.workspace.data,
        workspace: {
          ...snapshot.workspace.data.workspace,
          updatedAt: now,
          settings: {
            ...previousSettings,
            recentBookIds: updatedRecentBookIds,
            recentSheetIds: updatedRecentSheetIds
          }
        },
        books: updatedWorkspaceBooks
      };

      const nextSnapshot: WorkspaceSnapshot = {
        workspace: { ...snapshot.workspace, data: workspaceData },
        books: snapshot.books.map((entry, index) =>
          index === bookIndex ? { ...entry, data: { ...bookEntry.data, sheets: nextSheets } } : entry
        )
      };

      set({ snapshot: nextSnapshot });

      return nextSnapshot;
    },

    renameBook: (bookId, nextName) => {
      const trimmed = nextName.trim();
      if (!trimmed) {
        return null;
      }

      const { snapshot } = get();
      if (!snapshot) {
        return null;
      }

      const bookIndex = snapshot.books.findIndex((entry) => entry.data.book.id === bookId);
      if (bookIndex === -1) {
        return null;
      }

      const bookEntry = snapshot.books[bookIndex];
      if ((bookEntry.data.book.name ?? '') === trimmed) {
        return null;
      }

      recordSnapshotForUndo();

      const now = new Date().toISOString();
      const updatedBookEntry = {
        ...bookEntry,
        data: {
          ...bookEntry.data,
          book: {
            ...bookEntry.data.book,
            name: trimmed,
            updatedAt: now
          }
        }
      };

      const updatedBooks = snapshot.books.map((entry, index) =>
        index === bookIndex ? updatedBookEntry : entry
      );

      const updatedWorkspaceBooks = snapshot.workspace.data.books.map((ref) =>
        ref.id === bookId ? { ...ref, updatedAt: now } : ref
      );

      const workspaceData: WorkspaceSnapshot['workspace']['data'] = {
        ...snapshot.workspace.data,
        workspace: {
          ...snapshot.workspace.data.workspace,
          updatedAt: now
        },
        books: updatedWorkspaceBooks
      };

      const nextSnapshot: WorkspaceSnapshot = {
        workspace: { ...snapshot.workspace, data: workspaceData },
        books: updatedBooks
      };

      set({ snapshot: nextSnapshot });

      return nextSnapshot;
    },

    undo: () => {
      const { snapshot, history, selectedBookId, selectedSheetId, future } = get();
      if (!snapshot || history.length === 0) {
        return null;
      }

      const lastEntry = history[history.length - 1];
      const nextHistory = history.slice(0, -1);
      const nextFuture: HistoryEntry[] = [
        ...future,
        {
          snapshot: cloneSnapshot(snapshot),
          selectedBookId,
          selectedSheetId
        }
      ];

      set({
        snapshot: lastEntry.snapshot,
        selectedBookId: lastEntry.selectedBookId,
        selectedSheetId: lastEntry.selectedSheetId,
        history: nextHistory,
        future: nextFuture
      });

      return lastEntry.snapshot;
    },

    redo: () => {
      const { snapshot, future, selectedBookId, selectedSheetId, history } = get();
      if (!snapshot || future.length === 0) {
        return null;
      }

      const nextEntry = future[future.length - 1];
      const nextFuture = future.slice(0, -1);
      const nextHistory: HistoryEntry[] = [
        ...history,
        {
          snapshot: cloneSnapshot(snapshot),
          selectedBookId,
          selectedSheetId
        }
      ];

      set({
        snapshot: nextEntry.snapshot,
        selectedBookId: nextEntry.selectedBookId,
        selectedSheetId: nextEntry.selectedSheetId,
        history: nextHistory,
        future: nextFuture
      });

      return nextEntry.snapshot;
    }
  };
});
