import { type FC, type MutableRefObject } from 'react';
import type { BookFile } from '../types/schema';

interface SheetTabsProps {
  book: BookFile | null;
  selectedSheetId?: string | null;
  onSelectSheet: (sheetId: string) => void;
  onCreateSheet?: () => void;
  onDeleteSheet?: (sheetId: string) => void;
  renamingSheetId?: string | null;
  draftSheetName?: string;
  onStartRename?: (sheetId: string) => void;
  onRenameChange?: (value: string) => void;
  onRenameCommit?: () => void | Promise<void>;
  onRenameCancel?: () => void;
  onRenameBlur?: () => void;
  renameInputRef?: MutableRefObject<HTMLInputElement | null>;
}

const SheetTabs: FC<SheetTabsProps> = ({
  book,
  selectedSheetId,
  onSelectSheet,
  onCreateSheet,
  onDeleteSheet,
  renamingSheetId,
  draftSheetName,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameBlur,
  renameInputRef
}) => {
  if (!book) {
    return (
      <div className="sheet-tabs sheet-tabs--empty">
        <span>ブックを選択するとシートの一覧が表示されます。</span>
      </div>
    );
  }

  const handleSelect = (sheetId: string) => {
    if (sheetId === selectedSheetId) {
      return;
    }
    onSelectSheet(sheetId);
  };

  const handleCreate = () => {
    onCreateSheet?.();
  };

  return (
    <div className="sheet-tabs">
      <div className="sheet-tabs__scrollArea">
        <div className="sheet-tabs__list" role="tablist" aria-label="シート">
          {book.sheets.map((sheet) => {
            const isActive = sheet.id === selectedSheetId;
            const isRenaming = sheet.id === renamingSheetId;
            const className = [
              'sheet-tabs__tab',
              isActive ? 'sheet-tabs__tab--active' : '',
              isRenaming ? 'sheet-tabs__tab--renaming' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={sheet.id}
                role="tab"
                aria-selected={isActive}
                className={className}
                tabIndex={isRenaming ? -1 : 0}
                onClick={() => {
                  if (isRenaming) return;
                  handleSelect(sheet.id);
                }}
                onKeyDown={(event) => {
                  if (isRenaming) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect(sheet.id);
                  } else if (event.key === 'F2') {
                    event.preventDefault();
                    onStartRename?.(sheet.id);
                  }
                }}
                onDoubleClick={() => {
                  if (isRenaming) return;
                  onStartRename?.(sheet.id);
                }}
              >
                <div className="sheet-tabs__tabContent">
                  {isRenaming ? (
                    <input
                      ref={renameInputRef ?? undefined}
                      className="sheet-tabs__renameInput"
                      value={draftSheetName ?? ''}
                      onChange={(event) => onRenameChange?.(event.currentTarget.value)}
                      onBlur={() => onRenameBlur?.()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onRenameCommit?.();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          onRenameCancel?.();
                        }
                      }}
                    />
                  ) : (
                    <span className="sheet-tabs__tabLabel">{sheet.name}</span>
                  )}
                  {onDeleteSheet ? (
                    <button
                      type="button"
                      className="sheet-tabs__deleteButton"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isRenaming) return;
                        onDeleteSheet?.(sheet.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          if (isRenaming) {
                            return;
                          }
                          onDeleteSheet?.(sheet.id);
                        }
                      }}
                      disabled={isRenaming}
                      title="このシートを削除"
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {book.sheets.length === 0 && (
            <span className="sheet-tabs__placeholder">シートがありません</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="sheet-tabs__addButton"
        onClick={handleCreate}
        disabled={!onCreateSheet}
      >
        + シート追加
      </button>
    </div>
  );
};

export default SheetTabs;
