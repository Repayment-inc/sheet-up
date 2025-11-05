import type {
  IntegrityDecisions,
  IntegrityIssue,
  IntegrityIssues
} from '../../types/integrity';
import type { BookReference } from '../../types/schema';
import type { WorkspaceSnapshot } from '../../types/workspaceSnapshot';

type BookOrderReason = 'duplicate' | 'non-finite';

interface BookIdMismatchDetails {
  workspaceBookIndex?: number;
  workspaceId?: string;
  fileId?: string;
  filePath?: string;
  dataPath?: string;
}

interface MissingActiveSheetDetails {
  workspaceBookIndex?: number;
  activeSheetId?: string;
  availableSheetIds?: string[];
}

interface MissingFolderReferenceDetails {
  workspaceBookIndex?: number;
  folderId?: string;
}

interface InvalidOrderDetails {
  workspaceBookIndex?: number;
  folderId?: string | null;
  order: number;
  reason: BookOrderReason;
}

const cloneSnapshot = (value: WorkspaceSnapshot): WorkspaceSnapshot => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as WorkspaceSnapshot;
};

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const resolveByDataPath = (snapshot: WorkspaceSnapshot, dataPath: string) => {
  const normalized = normalizePath(dataPath);
  return snapshot.books.find((entry) => normalizePath(entry.filePath).endsWith(normalized)) ?? null;
};

const resolveWorkspaceBookIndex = (books: BookReference[], bookId: string | undefined): number => {
  if (!bookId) {
    return -1;
  }
  return books.findIndex((ref) => ref.id === bookId);
};

const replaceIdInList = (list: string[] | undefined, fromId: string, toId: string): string[] | undefined => {
  if (!list) {
    return list;
  }
  let changed = false;
  const next = list.map((id) => {
    if (id === fromId) {
      changed = true;
      return toId;
    }
    return id;
  });
  return changed ? next : list;
};

const matchingIdFallback = (details: IntegrityIssue['details']): string | undefined => {
  if (!details) {
    return undefined;
  }
  if ('workspaceId' in details && typeof details.workspaceId === 'string') {
    return details.workspaceId;
  }
  return undefined;
};

const normalizeBookOrders = (books: BookReference[]): void => {
  const groups = new Map<string | null, BookReference[]>();

  books.forEach((book) => {
    const key = book.folderId ?? null;
    const group = groups.get(key);
    if (group) {
      group.push(book);
    } else {
      groups.set(key, [book]);
    }
  });

  groups.forEach((group) => {
    group
      .slice()
      .sort((a, b) => {
        if (a.order === b.order) {
          return (a.id ?? '').localeCompare(b.id ?? '');
        }
        return a.order - b.order;
      })
      .forEach((book, index) => {
        book.order = index;
      });
  });
};

export interface IntegrityRepairResult {
  snapshot: WorkspaceSnapshot;
  resolvedIssueIds: string[];
  bookIdReplacements: Record<string, string>;
  sheetSelectionUpdates: Record<string, string | null>;
}

const resolveCurrentBookId = (
  originalId: string | undefined,
  replacements: Map<string, string>
): string | undefined => {
  if (!originalId) {
    return undefined;
  }

  let current = originalId;
  const visited = new Set<string>();

  while (replacements.has(current) && !visited.has(current)) {
    visited.add(current);
    const next = replacements.get(current);
    if (!next) {
      break;
    }
    current = next;
  }

  return current;
};

export const detectIntegrityIssues = (snapshot: WorkspaceSnapshot): IntegrityIssues => {
  const issues: IntegrityIssue[] = [];
  const workspaceData = snapshot.workspace.data;
  const folderIds = new Set(workspaceData.folders.map((folder) => folder.id));

  const duplicateTracker = new Map<string, number>();
  const flaggedDuplicates = new Set<string>();

  workspaceData.books.forEach((bookRef, index) => {
    const matchingByPath = resolveByDataPath(snapshot, bookRef.dataPath);
    const matchingById =
      snapshot.books.find((entry) => entry.data.book.id === bookRef.id) ?? matchingByPath;

    if (matchingByPath && matchingByPath.data.book.id !== bookRef.id) {
      const issueId = `book-id-mismatch:${bookRef.id}:${matchingByPath.data.book.id}`;
      issues.push({
        id: issueId,
        type: 'book-id-mismatch',
        severity: 'error',
        message: `workspace.json のブックID (${bookRef.id}) とファイル内の ID (${matchingByPath.data.book.id}) が一致しません。`,
        bookRefId: bookRef.id,
        bookFileId: matchingByPath.data.book.id,
        supportedDecisions: ['useFile', 'useWorkspace', 'defer'],
        details: {
          workspaceBookIndex: index,
          workspaceId: bookRef.id,
          fileId: matchingByPath.data.book.id,
          filePath: matchingByPath.filePath,
          dataPath: bookRef.dataPath
        } satisfies BookIdMismatchDetails
      });
    }

    const activeSheetId = bookRef.activeSheetId;
    if (matchingById && activeSheetId) {
      const availableSheetIds = matchingById.data.sheets.map((sheet) => sheet.id);
      if (!availableSheetIds.includes(activeSheetId)) {
        issues.push({
          id: `missing-active-sheet:${bookRef.id}`,
          type: 'missing-active-sheet',
          severity: 'warning',
          message: `ブック ${bookRef.id} の activeSheetId (${activeSheetId}) がブックファイル内に存在しません。`,
          bookRefId: bookRef.id,
          bookFileId: matchingById.data.book.id,
          supportedDecisions: ['reset', 'defer'],
          details: {
            workspaceBookIndex: index,
            activeSheetId,
            availableSheetIds
          } satisfies MissingActiveSheetDetails
        });
      }
    }

    const folderId = bookRef.folderId ?? null;
    if (folderId && !folderIds.has(folderId)) {
      issues.push({
        id: `missing-folder-reference:${bookRef.id}`,
        type: 'missing-folder-reference',
        severity: 'warning',
        message: `ブック ${bookRef.id} の folderId (${folderId}) が folders に存在しません。`,
        bookRefId: bookRef.id,
        bookFileId: matchingById?.data.book.id,
        supportedDecisions: ['reset', 'defer'],
        details: {
          workspaceBookIndex: index,
          folderId
        } satisfies MissingFolderReferenceDetails
      });
    }

    const order = bookRef.order;
    const orderKey = `${folderId ?? '__root__'}:${Number.isFinite(order) ? order : 'NaN'}`;
    if (!Number.isFinite(order)) {
      issues.push({
        id: `invalid-order:${bookRef.id}`,
        type: 'invalid-order',
        severity: 'warning',
        message: `ブック ${bookRef.id} の order の値 (${String(order)}) が数値ではありません。`,
        bookRefId: bookRef.id,
        bookFileId: matchingById?.data.book.id,
        supportedDecisions: ['normalize', 'defer'],
        details: {
          workspaceBookIndex: index,
          folderId,
          order,
          reason: 'non-finite'
        } satisfies InvalidOrderDetails
      });
    } else if (duplicateTracker.has(orderKey)) {
      const firstIndex = duplicateTracker.get(orderKey) ?? index;
      if (!flaggedDuplicates.has(orderKey)) {
        const firstRef = workspaceData.books[firstIndex];
        issues.push({
          id: `invalid-order:${firstRef.id}`,
          type: 'invalid-order',
          severity: 'warning',
          message: `フォルダ ${folderId ?? '(root)'} で order=${order} が重複しています。`,
          bookRefId: firstRef.id,
          bookFileId: snapshot.books.find((entry) => entry.data.book.id === firstRef.id)?.data.book.id,
          supportedDecisions: ['normalize', 'defer'],
          details: {
            workspaceBookIndex: firstIndex,
            folderId,
            order,
            reason: 'duplicate'
          } satisfies InvalidOrderDetails
        });
        flaggedDuplicates.add(orderKey);
      }

      issues.push({
        id: `invalid-order:${bookRef.id}`,
        type: 'invalid-order',
        severity: 'warning',
        message: `フォルダ ${folderId ?? '(root)'} で order=${order} が重複しています。`,
        bookRefId: bookRef.id,
        bookFileId: matchingById?.data.book.id,
        supportedDecisions: ['normalize', 'defer'],
        details: {
          workspaceBookIndex: index,
          folderId,
          order,
          reason: 'duplicate'
        } satisfies InvalidOrderDetails
      });
    } else {
      duplicateTracker.set(orderKey, index);
    }
  });

  return issues;
};

export const applyIntegrityRepairs = (
  snapshot: WorkspaceSnapshot,
  issues: IntegrityIssues,
  decisions: IntegrityDecisions
): IntegrityRepairResult => {
  const nextSnapshot = cloneSnapshot(snapshot);
  const resolvedIssueIds: string[] = [];
  const replacements = new Map<string, string>();
  const bookIdReplacements: Record<string, string> = {};
  const sheetSelectionUpdates: Record<string, string | null> = {};
  let shouldNormalizeOrders = false;
  let workspaceMutated = false;
  let booksMutated = false;

  const now = new Date().toISOString();

  const registerReplacement = (fromId: string, toId: string) => {
    replacements.set(fromId, toId);
    bookIdReplacements[fromId] = toId;
  };

  const workspaceBooks = nextSnapshot.workspace.data.books;

  issues.forEach((issue) => {
    const decision = decisions[issue.id];
    if (!decision || decision === 'defer') {
      return;
    }

    if (issue.type === 'book-id-mismatch') {
      const details = issue.details as BookIdMismatchDetails | undefined;

      if (decision === 'useFile') {
        const originalId =
          details?.workspaceId ?? issue.bookRefId ?? matchingIdFallback(issue.details);
        const newId = details?.fileId;
        if (!originalId || !newId) {
          return;
        }

        const currentId = resolveCurrentBookId(originalId, replacements) ?? originalId;
        const bookIndex =
          typeof details?.workspaceBookIndex === 'number'
            ? details.workspaceBookIndex
            : resolveWorkspaceBookIndex(workspaceBooks, currentId);

        if (bookIndex === -1) {
          return;
        }

        const previousId = workspaceBooks[bookIndex]?.id;
        if (!previousId) {
          return;
        }

        workspaceBooks[bookIndex] = {
          ...workspaceBooks[bookIndex],
          id: newId,
          updatedAt: now
        };

        const settings = nextSnapshot.workspace.data.workspace.settings ?? {};
        const nextRecentBookIds = replaceIdInList(settings.recentBookIds, previousId, newId);
        nextSnapshot.workspace.data.workspace.settings = {
          ...settings,
          recentBookIds: nextRecentBookIds ?? settings.recentBookIds,
          recentSheetIds: settings.recentSheetIds
        };

        registerReplacement(originalId, newId);
        workspaceMutated = true;
        resolvedIssueIds.push(issue.id);
      } else if (decision === 'useWorkspace') {
        const workspaceId =
          resolveCurrentBookId(details?.workspaceId ?? issue.bookRefId, replacements) ??
          details?.workspaceId ??
          issue.bookRefId;
        const fileId = details?.fileId;
        const filePath = details?.filePath;
        const targetEntry =
          nextSnapshot.books.find((entry) => (filePath ? entry.filePath === filePath : false)) ??
          nextSnapshot.books.find((entry) => entry.data.book.id === fileId);

        if (!workspaceId || !targetEntry) {
          return;
        }

        targetEntry.data = {
          ...targetEntry.data,
          book: {
            ...targetEntry.data.book,
            id: workspaceId,
            updatedAt: now
          }
        };

        replacements.set(fileId ?? workspaceId, workspaceId);
        booksMutated = true;
        resolvedIssueIds.push(issue.id);
      }
      return;
    }

    if (issue.type === 'missing-active-sheet' && decision === 'reset') {
      const details = issue.details as MissingActiveSheetDetails | undefined;
      const originalId = issue.bookRefId;
      const currentId = resolveCurrentBookId(originalId, replacements) ?? originalId;
      const bookIndex =
        typeof details?.workspaceBookIndex === 'number'
          ? details.workspaceBookIndex
          : resolveWorkspaceBookIndex(workspaceBooks, currentId);

      if (bookIndex === -1) {
        return;
      }

      const availableSheetIds = details?.availableSheetIds ?? [];
      const nextActiveSheetId = availableSheetIds[0] ?? null;

      workspaceBooks[bookIndex] = {
        ...workspaceBooks[bookIndex],
        activeSheetId: nextActiveSheetId ?? undefined,
        updatedAt: now
      };

      sheetSelectionUpdates[currentId ?? workspaceBooks[bookIndex].id] = nextActiveSheetId;
      workspaceMutated = true;
      resolvedIssueIds.push(issue.id);
      return;
    }

    if (issue.type === 'missing-folder-reference' && decision === 'reset') {
      const details = issue.details as MissingFolderReferenceDetails | undefined;
      const originalId = issue.bookRefId;
      const currentId = resolveCurrentBookId(originalId, replacements) ?? originalId;
      const bookIndex =
        typeof details?.workspaceBookIndex === 'number'
          ? details.workspaceBookIndex
          : resolveWorkspaceBookIndex(workspaceBooks, currentId);

      if (bookIndex === -1) {
        return;
      }

      workspaceBooks[bookIndex] = {
        ...workspaceBooks[bookIndex],
        folderId: null,
        updatedAt: now
      };

      workspaceMutated = true;
      resolvedIssueIds.push(issue.id);
      return;
    }

    if (issue.type === 'invalid-order' && decision === 'normalize') {
      shouldNormalizeOrders = true;
      resolvedIssueIds.push(issue.id);
    }
  });

  if (shouldNormalizeOrders) {
    normalizeBookOrders(nextSnapshot.workspace.data.books);
    workspaceMutated = true;
  }

  if (workspaceMutated) {
    nextSnapshot.workspace.data = {
      ...nextSnapshot.workspace.data,
      workspace: {
        ...nextSnapshot.workspace.data.workspace,
        updatedAt: now
      },
      books: [...nextSnapshot.workspace.data.books]
    };
  }

  if (booksMutated) {
    nextSnapshot.books = nextSnapshot.books.map((entry) => ({
      ...entry,
      data: {
        ...entry.data,
        book: { ...entry.data.book }
      }
    }));
  }

  return {
    snapshot: nextSnapshot,
    resolvedIssueIds,
    bookIdReplacements,
    sheetSelectionUpdates
  };
};
