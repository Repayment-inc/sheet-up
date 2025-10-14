import type { BookFile, SheetData } from '../../types/schema';

const DEFAULT_SHEET_NAME = '新しいシート';
const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;

const generateId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

const createDefaultSheetName = (book: BookFile): string => {
  const existing = new Set(book.sheets.map((sheet) => sheet.name));
  if (!existing.has(DEFAULT_SHEET_NAME)) {
    return DEFAULT_SHEET_NAME;
  }
  let counter = 2;
  while (existing.has(`${DEFAULT_SHEET_NAME} (${counter})`)) {
    counter += 1;
  }
  return `${DEFAULT_SHEET_NAME} (${counter})`;
};

const createEmptySheet = (name: string): SheetData => ({
  id: generateId('sheet'),
  name,
  gridSize: { rows: DEFAULT_ROWS, cols: DEFAULT_COLS },
  settings: {},
  rows: {}
});

export const buildNewSheetSnapshot = (
  bookFile: BookFile
): { bookFile: BookFile; defaultSheetId: string } => {
  const name = createDefaultSheetName(bookFile);
  const newSheet = createEmptySheet(name);

  const sheets = [...bookFile.sheets, newSheet];

  const now = new Date().toISOString();

  return {
    bookFile: {
      ...bookFile,
      book: {
        ...bookFile.book,
        updatedAt: now
      },
      sheets
    },
    defaultSheetId: newSheet.id
  };
};
