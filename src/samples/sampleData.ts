import type { BookFile, WorkspaceFile } from '../types/schema';

export const sampleWorkspace: WorkspaceFile = {
  schemaVersion: '1.0.0',
  workspace: {
    id: 'workspace-001',
    name: 'Sample Workspace',
    createdAt: '2025-02-14T08:15:00.000Z',
    updatedAt: '2025-02-14T09:30:00.000Z',
    settings: {
      theme: 'dark',
      sidebarWidth: 280,
      recentBookIds: ['book-001'],
      recentSheetIds: ['sheet-001']
    }
  },
  folders: [
    { id: 'root', name: 'Root', parentId: null, order: 0 },
    { id: 'folder-2025', name: '2025年度', parentId: 'root', order: 1 }
  ],
  books: [
    {
      id: 'book-001',
      name: 'プロジェクト管理.json',
      folderId: 'root',
      order: 0,
      dataPath: 'books/book-001.json',
      thumbPath: 'thumbs/book-001.png',
      activeSheetId: 'sheet-001',
      createdAt: '2025-02-14T08:30:00.000Z',
      updatedAt: '2025-02-14T09:20:00.000Z'
    }
  ]
};

export const sampleBook: BookFile = {
  schemaVersion: '1.0.0',
  book: {
    id: 'book-001',
    name: 'プロジェクト管理',
    createdAt: '2025-02-14T08:30:00.000Z',
    updatedAt: '2025-02-14T09:20:00.000Z',
    properties: {
      defaultFormat: 'plain',
      locked: false
    }
  },
  sheets: [
    {
      id: 'sheet-001',
      name: 'ダッシュボード',
      gridSize: { rows: 100, cols: 26 },
      settings: { locked: false },
      rows: {
        '1': {
          A: { value: '売上', type: 'string' },
          C: { value: '経費', type: 'string' }
        },
        '2': {
          A: { value: 100, type: 'number', format: 'currency' },
          C: { value: 30, type: 'number', format: 'currency' }
        }
      }
    }
  ]
};
