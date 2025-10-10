import { useCallback, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import SheetGrid from './components/SheetGrid';
import { sampleWorkspace, sampleBook } from './samples/sampleData';
import type { BookFile } from './types/schema';
import './App.css';

const initialBooks: BookFile[] = [sampleBook];

function App() {
  const [workspace] = useState(sampleWorkspace);
  const [books] = useState(initialBooks);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    workspace.books[0]?.id ?? null
  );
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(
    initialBooks[0]?.sheets[0]?.id ?? null
  );

  const activeBook = useMemo(
    () => books.find((book) => book.book.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  const activeSheet = useMemo(
    () => activeBook?.sheets.find((sheet) => sheet.id === selectedSheetId) ?? null,
    [activeBook, selectedSheetId]
  );

  const handleSelectBook = useCallback(
    (bookId: string) => {
      setSelectedBookId(bookId);
      const book = books.find((b) => b.book.id === bookId);
      const firstSheet = book?.sheets[0];
      setSelectedSheetId(firstSheet ? firstSheet.id : null);
    },
    [books]
  );

  const handleSelectSheet = useCallback((bookId: string, sheetId: string) => {
    setSelectedBookId(bookId);
    setSelectedSheetId(sheetId);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspace}
        books={books}
        selectedBookId={selectedBookId}
        selectedSheetId={selectedSheetId}
        onSelectBook={handleSelectBook}
        onSelectSheet={handleSelectSheet}
      />
      <section className="main-view">
        <header className="main-view__header">
          <div>
            <h2 className="main-view__title">{activeSheet?.name ?? 'シートを選択してください'}</h2>
            <p className="main-view__subtitle">
              {activeBook ? activeBook.book.name : 'ブックを選択してください'}
            </p>
          </div>
          {activeSheet ? (
            <div className="main-view__meta">
              <span>
                行: <strong>{activeSheet.gridSize.rows}</strong>
              </span>
              <span>
                列: <strong>{activeSheet.gridSize.cols}</strong>
              </span>
              <span>
                シート内セル: <strong>{Object.keys(activeSheet.rows).length}</strong>
              </span>
            </div>
          ) : null}
        </header>
        <div className="main-view__content">
          <SheetGrid sheet={activeSheet ?? null} />
        </div>
      </section>
    </div>
  );
}

export default App;
