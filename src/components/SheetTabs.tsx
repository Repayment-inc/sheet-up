import { type FC } from 'react';
import type { BookFile } from '../types/schema';

interface SheetTabsProps {
  book: BookFile | null;
  selectedSheetId?: string | null;
  onSelectSheet: (sheetId: string) => void;
  onCreateSheet?: () => void;
}

const SheetTabs: FC<SheetTabsProps> = ({ book, selectedSheetId, onSelectSheet, onCreateSheet }) => {
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
            return (
              <button
                key={sheet.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`sheet-tabs__tab${isActive ? ' sheet-tabs__tab--active' : ''}`}
                onClick={() => handleSelect(sheet.id)}
              >
                {sheet.name}
              </button>
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
