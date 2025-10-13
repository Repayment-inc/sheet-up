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
import { sampleWorkspace, sampleBook } from './samples/sampleData';
import type { WorkspaceSnapshot } from './types/workspaceSnapshot';
import type { BookFile } from './types/schema';
import './App.css';

const sampleSnapshot: WorkspaceSnapshot = {
  workspace: { filePath: 'sample/workspace.json', data: sampleWorkspace },
  books: [{ filePath: 'sample/books/book-001.json', data: sampleBook }]
};

type BusyState = 'idle' | 'loading' | 'saving';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(isTauri ? null : sampleSnapshot);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<BusyState>('idle');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(isTauri);

  const snapshotRef = useRef<WorkspaceSnapshot | null>(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

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

  const handleCreateBook = useCallback(async () => {
    if (!snapshot) {
      await showErrorDialog('ブックを作成できません', 'ワークスペースを開いてから新規ブックを作成してください。');
      return;
    }

    const defaultName = '新しいブック';
    const inputName = window.prompt('新しいブックの名前を入力してください', defaultName);
    if (inputName === null) {
      return;
    }

    try {
      const { workspaceData, loadedBook, defaultSheetId } = buildNewBookSnapshot(inputName, snapshot);
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
  }, [snapshot, autoSaveEnabled]);

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
          {snapshot ? <SheetGrid sheet={activeSheet ?? null} /> : renderEmptyState()}
        </div>
      </section>
    </div>
  );
}

export default App;
