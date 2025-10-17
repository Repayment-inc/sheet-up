import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import SheetGrid from './components/SheetGrid';
import { isTauri } from './lib/env';
import {
  openWorkspaceFromDialog,
  saveWorkspaceSnapshot,
  showErrorDialog
} from './lib/tauri/workspaceBridge';
import { buildNewBookSnapshot } from './lib/workspace/bookFactory';
import { buildNewSheetSnapshot } from './lib/workspace/sheetFactory';
import { sampleWorkspace, sampleBook } from './samples/sampleData';
import type { WorkspaceSnapshot } from './types/workspaceSnapshot';
import type { BookFile } from './types/schema';
import './App.css';

const sampleSnapshot: WorkspaceSnapshot = {
  workspace: { filePath: 'sample/workspace.json', data: sampleWorkspace },
  books: [{ filePath: 'sample/books/book-001.json', data: sampleBook }]
};

type BusyState = 'idle' | 'loading' | 'saving';

const MAX_HISTORY_ENTRIES = 100;

type HistoryEntry = {
  snapshot: WorkspaceSnapshot;
  selectedBookId: string | null;
  selectedSheetId: string | null;
};

const cloneSnapshot = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(isTauri ? null : sampleSnapshot);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<BusyState>('idle');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(isTauri);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  const snapshotRef = useRef<WorkspaceSnapshot | null>(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const recordSnapshotForUndo = useCallback(() => {
    if (!snapshot) return;
    const entry: HistoryEntry = {
      snapshot: cloneSnapshot(snapshot),
      selectedBookId,
      selectedSheetId
    };
    setHistory((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_HISTORY_ENTRIES) {
        return next.slice(next.length - MAX_HISTORY_ENTRIES);
      }
      return next;
    });
    setFuture([]);
  }, [snapshot, selectedBookId, selectedSheetId]);

  const handleUndo = useCallback(() => {
    if (!snapshot || history.length === 0) return;
    const lastEntry = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setFuture((prev) => [
      ...prev,
      {
        snapshot: cloneSnapshot(snapshot),
        selectedBookId,
        selectedSheetId
      }
    ]);
    setSnapshot(lastEntry.snapshot);
    setSelectedBookId(lastEntry.selectedBookId);
    setSelectedSheetId(lastEntry.selectedSheetId);
  }, [history, snapshot, selectedBookId, selectedSheetId]);

  const handleRedo = useCallback(() => {
    if (!snapshot || future.length === 0) return;
    const nextEntry = future[future.length - 1];
    setFuture((prev) => prev.slice(0, -1));
    setHistory((prev) => [
      ...prev,
      {
        snapshot: cloneSnapshot(snapshot),
        selectedBookId,
        selectedSheetId
      }
    ]);
    setSnapshot(nextEntry.snapshot);
    setSelectedBookId(nextEntry.selectedBookId);
    setSelectedSheetId(nextEntry.selectedSheetId);
  }, [future, snapshot, selectedBookId, selectedSheetId]);

  const initializeSelection = useCallback((nextSnapshot: WorkspaceSnapshot) => {
    const fallbackBookFromWorkspace = nextSnapshot.workspace.data.books[0]?.id ?? null;
    const fallbackBookFromFiles = nextSnapshot.books[0]?.data.book.id ?? null;
    const nextBookId = fallbackBookFromWorkspace ?? fallbackBookFromFiles;
    const matchingBook = nextSnapshot.books.find((book) => book.data.book.id === nextBookId);
    const nextSheetId = matchingBook?.data.sheets[0]?.id ?? null;

    setSelectedBookId(nextBookId);
    setSelectedSheetId(nextSheetId);
  }, []);

  const handleWorkspaceLoaded = useCallback(
    (nextSnapshot: WorkspaceSnapshot) => {
      setSnapshot(nextSnapshot);
      initializeSelection(nextSnapshot);
    },
    [initializeSelection]
  );

  const handleOpenWorkspace = useCallback(async () => {
    if (!isTauri) return;
    setBusyState('loading');
    try {
      const loaded = await openWorkspaceFromDialog();
      if (loaded) {
        handleWorkspaceLoaded(loaded);
      }
    } catch (error) {
      await showErrorDialog('ワークスペースの読み込みに失敗しました', toErrorMessage(error));
    } finally {
      setBusyState('idle');
    }
  }, [handleWorkspaceLoaded]);

  const handleSaveWorkspace = useCallback(async () => {
    if (!snapshotRef.current || !isTauri) return;
    setBusyState('saving');
    try {
      await saveWorkspaceSnapshot(snapshotRef.current);
    } catch (error) {
      await showErrorDialog('保存に失敗しました', toErrorMessage(error));
    } finally {
      setBusyState('idle');
    }
  }, []);

  useEffect(() => {
    if (!autoSaveEnabled || !isTauri) {
      return;
    }
    if (!snapshot) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleSaveWorkspace();
    }, 800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [snapshot, autoSaveEnabled, handleSaveWorkspace]);

  const loadedBooks = snapshot?.books ?? [];
  const bookFiles: BookFile[] = useMemo(
    () => loadedBooks.map((entry) => entry.data),
    [loadedBooks]
  );

  const workspaceFile = snapshot?.workspace.data ?? null;

  const activeBook = useMemo(
    () => bookFiles.find((book) => book.book.id === selectedBookId) ?? null,
    [bookFiles, selectedBookId]
  );

  const activeSheet = useMemo(
    () => activeBook?.sheets.find((sheet) => sheet.id === selectedSheetId) ?? null,
    [activeBook, selectedSheetId]
  );

  const handleSelectBook = useCallback(
    (bookId: string) => {
      setSelectedBookId(bookId);
      const book = loadedBooks.find((entry) => entry.data.book.id === bookId);
      const firstSheet = book?.data.sheets[0];
      setSelectedSheetId(firstSheet ? firstSheet.id : null);
    },
    [loadedBooks]
  );

  const handleSelectSheet = useCallback((bookId: string, sheetId: string) => {
    setSelectedBookId(bookId);
    setSelectedSheetId(sheetId);
  }, []);

  const createDefaultBookName = useCallback(
    (currentSnapshot: WorkspaceSnapshot): string => {
      const base = '新しいブック';
      const existingNames = new Set(
        currentSnapshot.books.map((entry) => entry.data.book.name ?? entry.data.book.id)
      );

      if (!existingNames.has(base)) {
        return base;
      }

      let counter = 2;
      while (existingNames.has(`${base} (${counter})`)) {
        counter += 1;
      }
      return `${base} (${counter})`;
    },
    []
  );

  const handleCreateBook = useCallback(async () => {
    if (!snapshot) {
      await showErrorDialog('ブックを作成できません', 'ワークスペースを開いてから新規ブックを作成してください。');
      return;
    }

    try {
      recordSnapshotForUndo();
      const desiredName = createDefaultBookName(snapshot);
      const { workspaceData, loadedBook, defaultSheetId } = buildNewBookSnapshot(desiredName, snapshot);

      const nextSnapshot: WorkspaceSnapshot = {
        workspace: { filePath: snapshot.workspace.filePath, data: workspaceData },
        books: [...snapshot.books, loadedBook]
      };

      setSnapshot(nextSnapshot);
      setSelectedBookId(loadedBook.data.book.id);
      setSelectedSheetId(defaultSheetId);

      if (isTauri && !autoSaveEnabled) {
        setBusyState('saving');
        try {
          await saveWorkspaceSnapshot(nextSnapshot);
        } catch (error) {
          await showErrorDialog('ブックの保存に失敗しました', toErrorMessage(error));
        } finally {
          setBusyState('idle');
        }
      }
    } catch (error) {
      await showErrorDialog('ブックの作成に失敗しました', toErrorMessage(error));
    }
  }, [snapshot, autoSaveEnabled, createDefaultBookName, isTauri, recordSnapshotForUndo, showErrorDialog]);

  const handleCreateSheet = useCallback(
    async (bookId: string) => {
      if (!snapshot) {
        await showErrorDialog('シートを作成できません', 'ワークスペースを開いてからシートを追加してください。');
        return;
      }

      const bookIndex = snapshot.books.findIndex((entry) => entry.data.book.id === bookId);
      if (bookIndex === -1) {
        await showErrorDialog('シートを作成できません', '指定されたブックが見つかりません。');
        return;
      }

      try {
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

        setSnapshot(nextSnapshot);
        setSelectedBookId(bookId);
        setSelectedSheetId(defaultSheetId);

        if (isTauri && !autoSaveEnabled) {
          setBusyState('saving');
          try {
            await saveWorkspaceSnapshot(nextSnapshot);
          } catch (error) {
            await showErrorDialog('シートの保存に失敗しました', toErrorMessage(error));
          } finally {
            setBusyState('idle');
          }
        }
      } catch (error) {
        await showErrorDialog('シートの作成に失敗しました', toErrorMessage(error));
      }
    },
    [snapshot, autoSaveEnabled, showErrorDialog, recordSnapshotForUndo, isTauri]
  );

  const applyCellUpdates = useCallback(
    async (updates: Array<{ rowKey: string; columnKey: string; value: string }>) => {
      if (!snapshot || !selectedBookId || !selectedSheetId || updates.length === 0) {
        return;
      }

      const bookIndex = snapshot.books.findIndex((entry) => entry.data.book.id === selectedBookId);
      if (bookIndex === -1) {
        return;
      }

      const bookEntry = snapshot.books[bookIndex];
      const sheetIndex = bookEntry.data.sheets.findIndex((sheet) => sheet.id === selectedSheetId);
      if (sheetIndex === -1) {
        return;
      }

      try {
        recordSnapshotForUndo();
        const targetSheet = bookEntry.data.sheets[sheetIndex];
        const nextRows = { ...targetSheet.rows };

        updates.forEach(({ rowKey, columnKey, value }) => {
          const nextRowData = { ...(nextRows[rowKey] ?? {}) };
          const trimmed = value.trim();
          if (trimmed === '') {
            delete nextRowData[columnKey];
          } else {
            const numeric = Number(trimmed);
            if (!Number.isNaN(numeric) && trimmed !== '') {
              nextRowData[columnKey] = { value: numeric, type: 'number' };
            } else {
              nextRowData[columnKey] = { value, type: 'string' };
            }
          }

          if (Object.keys(nextRowData).length === 0) {
            delete nextRows[rowKey];
          } else {
            nextRows[rowKey] = nextRowData;
          }
        });

        const nextSheets = [...bookEntry.data.sheets];
        nextSheets[sheetIndex] = {
          ...targetSheet,
          rows: nextRows
        };

        const now = new Date().toISOString();
        const updatedBookData = {
          ...bookEntry.data,
          book: {
            ...bookEntry.data.book,
            updatedAt: now
          },
          sheets: nextSheets
        };

        const nextBooks = snapshot.books.map((entry, index) =>
          index === bookIndex ? { ...entry, data: updatedBookData } : entry
        );

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
          books: nextBooks
        };

        setSnapshot(nextSnapshot);

        if (isTauri && !autoSaveEnabled) {
          setBusyState('saving');
          try {
            await saveWorkspaceSnapshot(nextSnapshot);
          } catch (error) {
            await showErrorDialog('セルの保存に失敗しました', toErrorMessage(error));
          } finally {
            setBusyState('idle');
          }
        }
      } catch (error) {
        await showErrorDialog('セルの編集に失敗しました', toErrorMessage(error));
      }
    },
    [snapshot, selectedBookId, selectedSheetId, autoSaveEnabled, isTauri, showErrorDialog, recordSnapshotForUndo]
  );

  const handleCommitCell = useCallback(
    (rowKey: string, columnKey: string, rawValue: string) => {
      void applyCellUpdates([{ rowKey, columnKey, value: rawValue }]);
    },
    [applyCellUpdates]
  );

  const handleCommitCells = useCallback(
    (updates: Array<{ rowKey: string; columnKey: string; value: string }>) => {
      void applyCellUpdates(updates);
    },
    [applyCellUpdates]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;

      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);
  const renderEmptyState = () => (
    <div className="main-view__empty">
      <h2>ワークスペースを開いてください</h2>
      <p>既存のワークスペースフォルダを選択すると、workspace.json とブックファイルを読み込みます。</p>
      {isTauri ? (
        <button
          type="button"
          className="main-view__primaryButton"
          onClick={handleOpenWorkspace}
          disabled={busyState === 'loading'}
        >
          {busyState === 'loading' ? '読み込み中…' : 'ワークスペースを開く'}
        </button>
      ) : (
        <p className="main-view__note">ブラウザプレビューではサンプルデータのみ閲覧できます。</p>
      )}
    </div>
  );

  const autosaveDescription = autoSaveEnabled ? '自動保存オン' : '自動保存オフ';

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspaceFile}
        books={bookFiles}
        selectedBookId={selectedBookId}
        selectedSheetId={selectedSheetId}
        onSelectBook={handleSelectBook}
        onSelectSheet={handleSelectSheet}
        onCreateBook={handleCreateBook}
        onCreateSheet={handleCreateSheet}
      />
      <section className="main-view">
        <header className="main-view__header">
          <div>
            <h2 className="main-view__title">
              {activeSheet?.name ??
                (snapshot ? 'シートを選択してください' : 'ワークスペースを開いてください')}
            </h2>
            <p className="main-view__subtitle">
              {activeBook
                ? activeBook.book.name
                : snapshot
                  ? 'ブックを選択してください'
                  : 'データはまだ読み込まれていません'}
            </p>
          </div>
          <div className="main-view__headerActions">
            {isTauri ? (
              <div className="main-view__toolbar">
                <button
                  type="button"
                  className="main-view__actionButton"
                  onClick={handleOpenWorkspace}
                  disabled={busyState === 'loading'}
                >
                  {snapshot ? '別のワークスペースを開く' : 'ワークスペースを開く'}
                </button>
                <button
                  type="button"
                  className="main-view__actionButton"
                  onClick={handleSaveWorkspace}
                  disabled={!snapshot || busyState === 'saving'}
                >
                  {busyState === 'saving' ? '保存中…' : '保存'}
                </button>
                <label className="main-view__toggle">
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(event) => setAutoSaveEnabled(event.currentTarget.checked)}
                  />
                  <span>{autosaveDescription}</span>
                </label>
              </div>
            ) : null}
            <div className="main-view__status">
              {busyState === 'loading' ? '読み込み中…' : null}
              {busyState === 'saving' ? '保存中…' : null}
            </div>
          </div>
        </header>
        <div className="main-view__content">
          {snapshot ? (
            <SheetGrid
              sheet={activeSheet ?? null}
              onCommitCell={handleCommitCell}
              onCommitCells={handleCommitCells}
            />
          ) : (
            renderEmptyState()
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
