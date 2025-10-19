import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SheetGrid from './components/SheetGrid';
import Sidebar from './components/Sidebar';
import SheetTabs from './components/SheetTabs';
import { isTauri } from './lib/env';
import {
  openWorkspaceFromDialog,
  saveWorkspaceSnapshot,
  showErrorDialog
} from './lib/tauri/workspaceBridge';
import type { BookFile } from './types/schema';
import { useWorkspaceStore, type CellUpdate } from './state/workspaceStore';
import './App.css';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function App() {
  const snapshot = useWorkspaceStore((state) => state.snapshot);
  const selectedBookId = useWorkspaceStore((state) => state.selectedBookId);
  const selectedSheetId = useWorkspaceStore((state) => state.selectedSheetId);
  const busyState = useWorkspaceStore((state) => state.busyState);
  const autoSaveEnabled = useWorkspaceStore((state) => state.autoSaveEnabled);

  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const setBusyState = useWorkspaceStore((state) => state.setBusyState);
  const setAutoSaveEnabled = useWorkspaceStore((state) => state.setAutoSaveEnabled);
  const selectBook = useWorkspaceStore((state) => state.selectBook);
  const selectSheet = useWorkspaceStore((state) => state.selectSheet);
  const createBook = useWorkspaceStore((state) => state.createBook);
  const createSheet = useWorkspaceStore((state) => state.createSheet);
  const applyCellUpdates = useWorkspaceStore((state) => state.applyCellUpdates);
  const renameBook = useWorkspaceStore((state) => state.renameBook);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);

  const handleOpenWorkspace = useCallback(async () => {
    if (!isTauri) return;
    setBusyState('loading');
    try {
      const loaded = await openWorkspaceFromDialog();
      if (loaded) {
        loadWorkspace(loaded);
      }
    } catch (error) {
      await showErrorDialog('ワークスペースの読み込みに失敗しました', toErrorMessage(error));
    } finally {
      setBusyState('idle');
    }
  }, [loadWorkspace, setBusyState]);

  const handleSaveWorkspace = useCallback(async () => {
    if (!isTauri) return;
    const currentSnapshot = useWorkspaceStore.getState().snapshot;
    if (!currentSnapshot) return;
    setBusyState('saving');
    try {
      await saveWorkspaceSnapshot(currentSnapshot);
    } catch (error) {
      await showErrorDialog('保存に失敗しました', toErrorMessage(error));
    } finally {
      setBusyState('idle');
    }
  }, [setBusyState]);

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
      selectBook(bookId);
    },
    [selectBook]
  );

  const handleSelectSheet = useCallback(
    (bookId: string, sheetId: string) => {
      selectSheet(bookId, sheetId);
    },
    [selectSheet]
  );

  const handleCreateBook = useCallback(async () => {
    try {
      const nextSnapshot = createBook();

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
  }, [autoSaveEnabled, createBook, setBusyState]);

  const handleCreateSheet = useCallback(
    async (bookId: string) => {
      try {
        const { snapshot: nextSnapshot } = createSheet(bookId);

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
    [autoSaveEnabled, createSheet, setBusyState]
  );

  const handleApplyCellUpdates = useCallback(
    async (updates: CellUpdate[]) => {
      try {
        const nextSnapshot = applyCellUpdates(updates);
        if (!nextSnapshot) {
          return;
        }

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
    [applyCellUpdates, autoSaveEnabled, setBusyState]
  );

  const handleCommitCell = useCallback(
    (rowKey: string, columnKey: string, rawValue: string) => {
      void handleApplyCellUpdates([{ rowKey, columnKey, value: rawValue }]);
    },
    [handleApplyCellUpdates]
  );

  const handleCommitCells = useCallback(
    (updates: CellUpdate[]) => {
      void handleApplyCellUpdates(updates);
    },
    [handleApplyCellUpdates]
  );

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftBookName, setDraftBookName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (activeBook) {
      setDraftBookName(activeBook.book.name ?? '');
    } else {
      setDraftBookName('');
    }
    setIsRenaming(false);
  }, [activeBook]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleStartRenaming = useCallback(() => {
    if (!activeBook) return;
    setDraftBookName(activeBook.book.name ?? '');
    setIsRenaming(true);
    skipBlurCommitRef.current = false;
  }, [activeBook]);

  const handleRenameChange = useCallback((value: string) => {
    setDraftBookName(value);
  }, []);

  const finishRename = useCallback(async () => {
    if (!activeBook) {
      setIsRenaming(false);
      return;
    }

    const trimmed = draftBookName.trim();
    const currentName = activeBook.book.name ?? '';

    if (!trimmed || trimmed === currentName) {
      setDraftBookName(currentName);
      setIsRenaming(false);
      return;
    }

    try {
      const nextSnapshot = renameBook(activeBook.book.id, trimmed);
      if (!nextSnapshot) {
        setDraftBookName(currentName);
        setIsRenaming(false);
        return;
      }

      if (isTauri && !autoSaveEnabled) {
        setBusyState('saving');
        try {
          await saveWorkspaceSnapshot(nextSnapshot);
        } catch (error) {
          await showErrorDialog('ブック名の保存に失敗しました', toErrorMessage(error));
          setDraftBookName(currentName);
        } finally {
          setBusyState('idle');
        }
      }
    } catch (error) {
      await showErrorDialog('ブック名の変更に失敗しました', toErrorMessage(error));
      setDraftBookName(currentName);
    } finally {
      setIsRenaming(false);
      skipBlurCommitRef.current = false;
    }
  }, [activeBook, draftBookName, renameBook, autoSaveEnabled, setBusyState]);

  const cancelRename = useCallback(() => {
    if (activeBook) {
      setDraftBookName(activeBook.book.name ?? '');
    }
    skipBlurCommitRef.current = true;
    setIsRenaming(false);
  }, [activeBook]);

  const handleRenameBlur = useCallback(() => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    void finishRename();
  }, [finishRename]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

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
        onSelectBook={handleSelectBook}
        onCreateBook={handleCreateBook}
      />
      <section className="main-view">
        <header className="main-view__header">
          <div>
            <h2 className="main-view__title">
              {activeSheet?.name ??
                (snapshot ? 'シートを選択してください' : 'ワークスペースを開いてください')}
            </h2>
            <div className="main-view__subtitle">
              {activeBook ? (
                isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="main-view__bookNameInput"
                    value={draftBookName}
                    onChange={(event) => handleRenameChange(event.currentTarget.value)}
                    onBlur={handleRenameBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void finishRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="main-view__bookNameButton"
                    onClick={handleStartRenaming}
                  >
                    {activeBook.book.name ?? '名称未設定のブック'}
                  </button>
                )
              ) : snapshot ? (
                'ブックを選択してください'
              ) : (
                'データはまだ読み込まれていません'
              )}
            </div>
          </div>
          <div className="main-view__headerActions">
            <div className="main-view__toolbar">
              {isTauri ? (
                <>
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
              </>
              ) : null}
            </div>
            <div className="main-view__status">
              {busyState === 'loading' ? '読み込み中…' : null}
              {busyState === 'saving' ? '保存中…' : null}
            </div>
          </div>
        </header>
        <div className="main-view__content">
          {snapshot ? (
            <div className="main-view__workspace">
              <div className="main-view__gridContainer">
                <SheetGrid
                  sheet={activeSheet ?? null}
                  onCommitCell={handleCommitCell}
                  onCommitCells={handleCommitCells}
                />
              </div>
              <SheetTabs
                book={activeBook}
                selectedSheetId={selectedSheetId}
                onSelectSheet={(sheetId) => {
                  if (!activeBook) return;
                  handleSelectSheet(activeBook.book.id, sheetId);
                }}
                onCreateSheet={
                  activeBook
                    ? () => {
                        void handleCreateSheet(activeBook.book.id);
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            renderEmptyState()
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
