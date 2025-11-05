import { type FC } from 'react';
import type { WorkspaceFile, BookFile } from '../types/schema';

interface SidebarProps {
  workspace: WorkspaceFile | null;
  books: BookFile[];
  selectedBookId?: string | null;
  brokenBookIds?: ReadonlySet<string>;
  onSelectBook: (bookId: string) => void;
  onCreateBook?: () => void;
  onDeleteBook?: (bookId: string) => void;
}

const trimExtension = (name: string): string => name.replace(/\.json$/i, '');

const Sidebar: FC<SidebarProps> = ({
  workspace,
  books,
  selectedBookId,
  brokenBookIds,
  onSelectBook,
  onCreateBook,
  onDeleteBook
}) => {
  const workspaceMeta = workspace?.workspace;
  const workspaceBooks = workspace?.books ?? [];
  const createBookDisabled = !workspace || !onCreateBook;
  const createBookTitle = createBookDisabled
    ? 'ワークスペースを開いてから新規ブックを作成できます'
    : '新しいブックを追加';
  const deleteBookDisabled = !onDeleteBook;

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">{workspaceMeta?.name ?? 'ワークスペース未選択'}</h1>
        <p className="sidebar__subtitle">{workspaceBooks.length} ファイル</p>
      </div>
      <nav className="sidebar__body">
        <ul className="sidebar__bookList">
          {workspaceBooks.map((bookRef) => {
            const book = books.find((entry) => entry.book.id === bookRef.id);
            const isActive = bookRef.id === selectedBookId;
            const isBroken = brokenBookIds?.has(bookRef.id) ?? false;
            const displayName = book?.book.name ?? trimExtension(bookRef.name);
            const buttonClass = [
              'sidebar__bookButton',
              isActive ? 'sidebar__bookButton--active' : '',
              isBroken ? 'sidebar__bookButton--broken' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li key={bookRef.id} className="sidebar__bookItem">
                <div className="sidebar__bookRow">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => onSelectBook(bookRef.id)}
                  >
                    <span className="sidebar__bookEmoji" role="img" aria-hidden="true">
                      📄
                    </span>
                    <span>{displayName}</span>
                    {isBroken ? (
                      <span className="sidebar__bookBadge" aria-label="整合性チェックが必要">
                        !
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="sidebar__bookDeleteButton"
                    onClick={() => onDeleteBook?.(bookRef.id)}
                    disabled={deleteBookDisabled}
                    title="このブックを削除"
                  >
                    削除
                  </button>
                </div>
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
