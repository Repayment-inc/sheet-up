import { useMemo, type FC } from 'react';
import type { WorkspaceFile, BookFile } from '../types/schema';

interface SidebarProps {
  workspace: WorkspaceFile | null;
  books: BookFile[];
  selectedBookId?: string | null;
  selectedSheetId?: string | null;
  onSelectBook: (bookId: string) => void;
  onSelectSheet: (bookId: string, sheetId: string) => void;
  onCreateBook?: () => void;
  onCreateSheet?: (bookId: string) => void;
}

const trimExtension = (name: string): string => name.replace(/\.json$/i, '');

const Sidebar: FC<SidebarProps> = ({
  workspace,
  books,
  selectedBookId,
  selectedSheetId,
  onSelectBook,
  onSelectSheet,
  onCreateBook,
  onCreateSheet
}) => {
  const booksById = useMemo(() => new Map(books.map((book) => [book.book.id, book])), [books]);
  const workspaceMeta = workspace?.workspace;
  const workspaceBooks = workspace?.books ?? [];
  const createBookDisabled = !workspace || !onCreateBook;
  const createBookTitle = createBookDisabled
    ? 'ワークスペースを開いてから新規ブックを作成できます'
    : '新しいブックを追加';
  const createSheetDisabled = !onCreateSheet;

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">{workspaceMeta?.name ?? 'ワークスペース未選択'}</h1>
        <p className="sidebar__subtitle">{workspaceBooks.length} ファイル</p>
      </div>
      <nav className="sidebar__body">
        <ul className="sidebar__bookList">
          {workspaceBooks.map((bookRef) => {
            const book = booksById.get(bookRef.id);
            const isActive = bookRef.id === selectedBookId;
            const displayName = book?.book.name ?? trimExtension(bookRef.name);

            return (
              <li key={bookRef.id} className="sidebar__bookItem">
                <button
                  type="button"
                  className={`sidebar__bookButton${isActive ? ' sidebar__bookButton--active' : ''}`}
                  onClick={() => onSelectBook(bookRef.id)}
                >
                  <span className="sidebar__bookEmoji" role="img" aria-hidden="true">
                    📄
                  </span>
                  <span>{displayName}</span>
                </button>
                {isActive && book ? (
                  <ul className="sidebar__sheetList">
                    {book.sheets.map((sheet) => {
                      const sheetActive = sheet.id === selectedSheetId;
                      return (
                        <li key={sheet.id}>
                          <button
                            type="button"
                            className={`sidebar__sheetButton${sheetActive ? ' sidebar__sheetButton--active' : ''}`}
                            onClick={() => onSelectSheet(bookRef.id, sheet.id)}
                          >
                            {sheet.name}
                          </button>
                        </li>
                      );
                    })}
                    {book.sheets.length === 0 && (
                      <li className="sidebar__empty">シートがありません</li>
                    )}
                    <li>
                      <button
                        type="button"
                        className="sidebar__sheetAddButton"
                        disabled={createSheetDisabled}
                        onClick={() => onCreateSheet?.(bookRef.id)}
                        title="このブックに新しいシートを追加"
                      >
                        + 新しいシート
                      </button>
                    </li>
                  </ul>
                ) : null}
              </li>
            );
          })}
          {workspaceBooks.length === 0 && (
            <li className="sidebar__empty">ブックがまだありません</li>
          )}
          {!workspace && (
            <li className="sidebar__empty">ワークスペースを開くとここに一覧が表示されます</li>
          )}
        </ul>
      </nav>
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__actionButton"
          disabled={createBookDisabled}
          onClick={onCreateBook}
          title={createBookTitle}
        >
          + 新規ブック
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
