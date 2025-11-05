import { describe, expect, test } from 'bun:test';
import { detectIntegrityIssues, applyIntegrityRepairs } from './integrity';
import { sampleBook, sampleWorkspace } from '../../samples/sampleData';
import type { WorkspaceSnapshot } from '../../types/workspaceSnapshot';
import type { BookFile } from '../../types/schema';
import type { IntegrityDecisions } from '../../types/integrity';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createSnapshot = (): WorkspaceSnapshot => ({
  workspace: {
    filePath: '/workspace.json',
    data: clone(sampleWorkspace)
  },
  books: [
    {
      filePath: '/books/book-001.json',
      data: clone(sampleBook)
    }
  ]
});

describe('integrity checker', () => {
  test('detectIntegrityIssues flags book id mismatch', () => {
    const snapshot = createSnapshot();
    snapshot.workspace.data.books[0].id = 'book-xyz';

    const issues = detectIntegrityIssues(snapshot);
    const mismatch = issues.find((issue) => issue.type === 'book-id-mismatch');

    expect(mismatch).toBeDefined();
    expect(mismatch?.bookRefId).toBe('book-xyz');
    expect(mismatch?.bookFileId).toBe('book-001');
  });

  test('applyIntegrityRepairs aligns workspace to book file when useFile is selected', () => {
    const snapshot = createSnapshot();
    snapshot.workspace.data.books[0].id = 'book-xyz';

    const issues = detectIntegrityIssues(snapshot);
    const decisions: IntegrityDecisions = {};
    issues.forEach((issue) => {
      if (issue.type === 'book-id-mismatch') {
        decisions[issue.id] = 'useFile';
      }
    });

    const result = applyIntegrityRepairs(snapshot, issues, decisions);
    expect(result.snapshot.workspace.data.books[0].id).toBe('book-001');
    expect(result.bookIdReplacements['book-xyz']).toBe('book-001');
  });

  test('applyIntegrityRepairs resets missing active sheet', () => {
    const snapshot = createSnapshot();
    snapshot.workspace.data.books[0].activeSheetId = 'missing-sheet';

    const issues = detectIntegrityIssues(snapshot);
    const decisions: IntegrityDecisions = {};
    issues.forEach((issue) => {
      if (issue.type === 'missing-active-sheet') {
        decisions[issue.id] = 'reset';
      }
    });

    const result = applyIntegrityRepairs(snapshot, issues, decisions);
    expect(result.snapshot.workspace.data.books[0].activeSheetId).toBe('sheet-001');
    expect(result.sheetSelectionUpdates['book-001']).toBe('sheet-001');
  });

  test('applyIntegrityRepairs normalizes duplicate order values', () => {
    const snapshot = createSnapshot();
    const extraBook: BookFile = {
      ...clone(sampleBook),
      book: {
        ...clone(sampleBook.book),
        id: 'book-002',
        name: '別のブック'
      },
      sheets: [
        {
          ...clone(sampleBook.sheets[0]),
          id: 'sheet-002',
          name: '別シート'
        }
      ]
    };

    snapshot.books.push({
      filePath: '/books/book-002.json',
      data: extraBook
    });
    snapshot.workspace.data.books = [
      { ...snapshot.workspace.data.books[0], id: 'book-001', order: 0 },
      {
        ...snapshot.workspace.data.books[0],
        id: 'book-002',
        name: '別のブック.json',
        order: 0,
        dataPath: 'books/book-002.json'
      }
    ];

    const issues = detectIntegrityIssues(snapshot);
    const decisions: IntegrityDecisions = {};
    issues
      .filter((issue) => issue.type === 'invalid-order')
      .forEach((issue) => {
        decisions[issue.id] = 'normalize';
      });

    const result = applyIntegrityRepairs(snapshot, issues, decisions);
    const orders = result.snapshot.workspace.data.books.map((book) => book.order);
    expect(orders).toEqual([0, 1]);
  });
});
