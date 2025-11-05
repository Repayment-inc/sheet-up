import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SheetGrid from './components/SheetGrid';
import Sidebar from './components/Sidebar';
import SheetTabs from './components/SheetTabs';
import { isTauri } from './lib/env';
import {
  openWorkspaceFromDialog,
  saveWorkspaceSnapshot,
  showErrorDialog,
  deleteBookFile
} from './lib/tauri/workspaceBridge';
import type { BookFile } from './types/schema';
import { useWorkspaceStore, type CellUpdate } from './state/workspaceStore';
import IntegrityModal from './components/IntegrityModal';
import type { IntegrityDecisionKey } from './types/integrity';
import './App.css';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function App() {
  const snapshot = useWorkspaceStore((state) => state.snapshot);
  const selectedBookId = useWorkspaceStore((state) => state.selectedBookId);
  const selectedSheetId = useWorkspaceStore((state) => state.selectedSheetId);
  const busyState = useWorkspaceStore((state) => state.busyState);
  const autoSaveEnabled = useWorkspaceStore((state) => state.autoSaveEnabled);
  const integrityIssues = useWorkspaceStore((state) => state.integrityIssues);
  const integrityDecisions = useWorkspaceStore((state) => state.integrityDecisions);

  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const setBusyState = useWorkspaceStore((state) => state.setBusyState);
  const setAutoSaveEnabled = useWorkspaceStore((state) => state.setAutoSaveEnabled);
  const selectBook = useWorkspaceStore((state) => state.selectBook);
  const selectSheet = useWorkspaceStore((state) => state.selectSheet);
  const createBook = useWorkspaceStore((state) => state.createBook);
  const createSheet = useWorkspaceStore((state) => state.createSheet);
  const applyCellUpdates = useWorkspaceStore((state) => state.applyCellUpdates);
  const renameBook = useWorkspaceStore((state) => state.renameBook);
  const renameSheet = useWorkspaceStore((state) => state.renameSheet);
  const deleteSheet = useWorkspaceStore((state) => state.deleteSheet);
  const deleteBook = useWorkspaceStore((state) => state.deleteBook);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const setIntegrityDecision = useWorkspaceStore((state) => state.setIntegrityDecision);
  const applyIntegrityDecisions = useWorkspaceStore((state) => state.applyIntegrityDecisions);
  const recalculateIntegrity = useWorkspaceStore((state) => state.recalculateIntegrity);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftBookName, setDraftBookName] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = useRef(false);
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null);
  const [draftSheetName, setDraftSheetName] = useState('');
  const sheetRenameInputRef = useRef<HTMLInputElement | null>(null);
  const skipSheetBlurCommitRef = useRef(false);
  const [isIntegrityModalOpen, setIntegrityModalOpen] = useState(false);
  const previousIssueCountRef = useRef(integrityIssues.length);
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

    // WHY: 未解決の選択肢が残った状態で保存すると、ID の不整合を抱えたまま書き戻してしまうため。
    const hasUnresolvedIntegrity = integrityIssues.some((issue) => {
      const decision = integrityDecisions[issue.id];
      return !decision || decision === 'defer';
    });

    if (hasUnresolvedIntegrity) {
      setIntegrityModalOpen(true);
      await showErrorDialog(
        '整合性チェックが未完了です',
        '未解決の整合性チェックがあります。対応内容を選択してから保存してください。'
      );
      return;
    }

    setBusyState('saving');
    try {
      await saveWorkspaceSnapshot(currentSnapshot);
    } catch (error) {
      await showErrorDialog('保存に失敗しました', toErrorMessage(error));
    } finally {
      setBusyState('idle');
    }
  }, [integrityIssues, integrityDecisions, setBusyState]);

  useEffect(() => {
    if (!autoSaveEnabled || !isTauri) {
      return;
    }
    if (!snapshot) {
      return;
    }
    // WHY: 未決の整合性がある間は自動保存を抑止し、破損状態での書き込みを防ぐ。
    const unresolvedIntegrityExists = integrityIssues.some((issue) => {
      const decision = integrityDecisions[issue.id];
      return !decision || decision === 'defer';
    });
    if (unresolvedIntegrityExists) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleSaveWorkspace();
    }, 800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [snapshot, autoSaveEnabled, handleSaveWorkspace, integrityIssues, integrityDecisions]);

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

  useEffect(() => {
    if (!activeBook) {
      setRenamingSheetId(null);
      setDraftSheetName('');
      return;
    }
    if (renamingSheetId) {
      const targetSheet = activeBook.sheets.find((sheet) => sheet.id === renamingSheetId);
      if (!targetSheet) {
        setRenamingSheetId(null);
        setDraftSheetName('');
      }
    }
  }, [activeBook, renamingSheetId]);

  useEffect(() => {
    if (!renamingSheetId) {
      return;
    }
    sheetRenameInputRef.current?.focus();
    sheetRenameInputRef.current?.select();
  }, [renamingSheetId]);

  useEffect(() => {
    // WHY: 新しい不整合が発生したときだけ自動表示し、それ以外はユーザーが閉じるまで表示を維持する。
    if (previousIssueCountRef.current === 0 && integrityIssues.length > 0) {
      setIntegrityModalOpen(true);
    }
    previousIssueCountRef.current = integrityIssues.length;
  }, [integrityIssues.length]);

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

  const handleStartSheetRename = useCallback(
    (sheetId: string) => {
      if (!activeBook) return;
      const sheet = activeBook.sheets.find((entry) => entry.id === sheetId);
      if (!sheet) return;
      setDraftSheetName(sheet.name ?? '');
      setRenamingSheetId(sheetId);
      skipSheetBlurCommitRef.current = false;
    },
    [activeBook]
  );

  const handleSheetRenameChange = useCallback((value: string) => {
    setDraftSheetName(value);
  }, []);

  const finishSheetRename = useCallback(async () => {
    if (!activeBook || !renamingSheetId) {
      setRenamingSheetId(null);
      return;
    }

    const sheet = activeBook.sheets.find((entry) => entry.id === renamingSheetId);
    if (!sheet) {
      setRenamingSheetId(null);
      return;
    }

    const currentName = sheet.name ?? '';
    const trimmed = draftSheetName.trim();

    if (!trimmed || trimmed === currentName) {
      setDraftSheetName(currentName);
      setRenamingSheetId(null);
      return;
    }

    try {
      const nextSnapshot = renameSheet(activeBook.book.id, renamingSheetId, trimmed);
      if (!nextSnapshot) {
        setDraftSheetName(currentName);
        setRenamingSheetId(null);
        return;
      }

      if (isTauri && !autoSaveEnabled) {
        setBusyState('saving');
        try {
          await saveWorkspaceSnapshot(nextSnapshot);
        } catch (error) {
          await showErrorDialog('シート名の保存に失敗しました', toErrorMessage(error));
          setDraftSheetName(currentName);
        } finally {
          setBusyState('idle');
        }
      }
    } catch (error) {
      await showErrorDialog('シート名の変更に失敗しました', toErrorMessage(error));
      setDraftSheetName(currentName);
    } finally {
      setRenamingSheetId(null);
      skipSheetBlurCommitRef.current = false;
    }
  }, [
    activeBook,
    renamingSheetId,
    draftSheetName,
    renameSheet,
    autoSaveEnabled,
    setBusyState
  ]);

  const cancelSheetRename = useCallback(() => {
    if (activeBook && renamingSheetId) {
      const sheet = activeBook.sheets.find((entry) => entry.id === renamingSheetId);
      if (sheet) {
        setDraftSheetName(sheet.name ?? '');
      }
    }
    skipSheetBlurCommitRef.current = true;
    setRenamingSheetId(null);
  }, [activeBook, renamingSheetId]);

  const handleSheetRenameBlur = useCallback(() => {
    if (skipSheetBlurCommitRef.current) {
      skipSheetBlurCommitRef.current = false;
      return;
    }
    void finishSheetRename();
  }, [finishSheetRename]);

  const handleDeleteSheet = useCallback(
    async (bookId: string, sheetId: string) => {
      const currentSnapshot = useWorkspaceStore.getState().snapshot;
      const bookEntry = currentSnapshot?.books.find((entry) => entry.data.book.id === bookId);
      const sheetEntry = bookEntry?.data.sheets.find((entry) => entry.id === sheetId);
      if (!sheetEntry) {
        return;
      }

      const sheetName = sheetEntry.name ?? '名称未設定のシート';
      const confirmed = await Promise.resolve(
        window.confirm(`シート「${sheetName}」を削除しますか？この操作は元に戻せません。`)
      );
      if (!confirmed) {
        return;
      }

      const nextSnapshot = deleteSheet(bookId, sheetId);
      if (!nextSnapshot) {
        return;
      }

      if (renamingSheetId === sheetId) {
        setRenamingSheetId(null);
        setDraftSheetName('');
        skipSheetBlurCommitRef.current = false;
      }

      if (isTauri && !autoSaveEnabled) {
        setBusyState('saving');
        try {
          await saveWorkspaceSnapshot(nextSnapshot);
        } catch (error) {
          await showErrorDialog('シート削除後の保存に失敗しました', toErrorMessage(error));
        } finally {
          setBusyState('idle');
        }
      }
    },
    [autoSaveEnabled, deleteSheet, renamingSheetId, setBusyState]
  );

  const handleDeleteBook = useCallback(
    async (bookId: string) => {
      const currentSnapshot = useWorkspaceStore.getState().snapshot;
      const bookEntry = currentSnapshot?.books.find((entry) => entry.data.book.id === bookId);
      if (!bookEntry) {
        return;
      }

      const bookName = bookEntry.data.book.name ?? '名称未設定のブック';
      const confirmed = await Promise.resolve(
        window.confirm(`「${bookName}」を削除しますか？この操作は元に戻せません。`)
      );
      if (!confirmed) {
        return;
      }

      const nextSnapshot = deleteBook(bookId);
      if (!nextSnapshot) {
        return;
      }

      if (isTauri) {
        try {
          await deleteBookFile(bookEntry.filePath);
        } catch (error) {
          await showErrorDialog('ブックファイルの削除に失敗しました', toErrorMessage(error));
        }
      }

      if (isTauri && !autoSaveEnabled) {
        setBusyState('saving');
        try {
          await saveWorkspaceSnapshot(nextSnapshot);
        } catch (error) {
          await showErrorDialog('ブック削除後の保存に失敗しました', toErrorMessage(error));
        } finally {
          setBusyState('idle');
        }
      }
    },
    [autoSaveEnabled, deleteBook, setBusyState]
  );

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
  const unresolvedIssues = useMemo(
    () =>
      integrityIssues.filter((issue) => {
        const decision = integrityDecisions[issue.id];
        return !decision || decision === 'defer';
      }),
    [integrityIssues, integrityDecisions]
  );
  const brokenBookIds = useMemo(() => {
    const ids = new Set<string>();
    unresolvedIssues.forEach((issue) => {
      if (issue.bookRefId) {
        ids.add(issue.bookRefId);
      }
    });
    return ids;
  }, [unresolvedIssues]);
  const hasUnresolvedIssues = unresolvedIssues.length > 0;
  const integrityButtonLabel =
    integrityIssues.length > 0 ? `整合性チェック (${integrityIssues.length})` : '整合性チェック';
  const integrityButtonClassName = hasUnresolvedIssues
    ? 'main-view__actionButton main-view__actionButton--alert'
    : 'main-view__actionButton';

  const handleIntegrityDecisionChange = useCallback(
    (issueId: string, decision: IntegrityDecisionKey) => {
      setIntegrityDecision(issueId, decision);
    },
    [setIntegrityDecision]
  );

  const handleApplyIntegrity = useCallback(() => {
    applyIntegrityDecisions();
    recalculateIntegrity();
    setIntegrityModalOpen(false);
  }, [applyIntegrityDecisions, recalculateIntegrity]);

  const handleOpenIntegrityModal = useCallback(() => {
    recalculateIntegrity();
    setIntegrityModalOpen(true);
  }, [recalculateIntegrity]);

  const handleCloseIntegrityModal = useCallback(() => {
    setIntegrityModalOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspaceFile}
        books={bookFiles}
        selectedBookId={selectedBookId}
        brokenBookIds={brokenBookIds}
        onSelectBook={handleSelectBook}
        onCreateBook={handleCreateBook}
        onDeleteBook={handleDeleteBook}
      />
      <section className="main-view">
        <header className="main-view__header">
          <div>
            <h2 className="main-view__title">
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
            </h2>
            <div className="main-view__subtitle">
              {activeSheet
                ? activeSheet.name
                : snapshot
                  ? 'シートを選択してください'
                  : 'ワークスペースを開いてください'}
            </div>
          </div>
          <div className="main-view__headerActions">
            <div className="main-view__toolbar">
              <button
                type="button"
                className={integrityButtonClassName}
                onClick={handleOpenIntegrityModal}
                disabled={!snapshot}
              >
                {integrityButtonLabel}
              </button>
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
              {busyState === 'loading' ? <span>読み込み中…</span> : null}
              {busyState === 'saving' ? <span>保存中…</span> : null}
              {hasUnresolvedIssues ? (
                <span className="main-view__statusAlert">
                  整合性チェック未完了（{unresolvedIssues.length}件）
                </span>
              ) : null}
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
                renamingSheetId={renamingSheetId}
                draftSheetName={draftSheetName}
                onStartRename={handleStartSheetRename}
                onRenameChange={handleSheetRenameChange}
                onRenameCommit={finishSheetRename}
                onRenameCancel={cancelSheetRename}
                onRenameBlur={handleSheetRenameBlur}
                renameInputRef={sheetRenameInputRef}
                onDeleteSheet={
                  activeBook
                    ? (sheetId) => {
                        void handleDeleteSheet(activeBook.book.id, sheetId);
                      }
                    : undefined
                }
                canDeleteSheet={
                  activeBook
                    ? (_sheetId) => (activeBook.sheets ?? []).length > 1
                    : undefined
                }
              />
            </div>
          ) : (
            renderEmptyState()
          )}
        </div>
      </section>
      <IntegrityModal
        isOpen={isIntegrityModalOpen}
        issues={integrityIssues}
        decisions={integrityDecisions}
        onChangeDecision={handleIntegrityDecisionChange}
        onApply={handleApplyIntegrity}
        onClose={handleCloseIntegrityModal}
        onRefresh={recalculateIntegrity}
      />
    </div>
  );
}

export default App;
