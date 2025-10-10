import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { WorkspaceFile, BookFile } from '../../types/schema';
import {
  assertWorkspaceFile,
  assertBookFile,
  validateWorkspaceFile,
  validateBookFile
} from '../schemaValidator';

const ensureDir = async (path: string) => {
  await mkdir(path, { recursive: true });
};

const parseJson = <T>(raw: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`JSON parse error: ${(err as Error).message}`);
  }
};

export const readWorkspaceFile = async (filePath: string): Promise<WorkspaceFile> => {
  const raw = await readFile(filePath, 'utf-8');
  const data = parseJson<unknown>(raw);
  assertWorkspaceFile(data);
  return data;
};

export const writeWorkspaceFile = async (
  filePath: string,
  workspace: WorkspaceFile
): Promise<void> => {
  const { valid, errors } = validateWorkspaceFile(workspace);
  if (!valid) {
    throw new Error(`Workspace payload invalid.\n${errors.join('\n')}`);
  }

  await ensureDir(dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf-8');
};

export const readBookFile = async (filePath: string): Promise<BookFile> => {
  const raw = await readFile(filePath, 'utf-8');
  const data = parseJson<unknown>(raw);
  assertBookFile(data);
  return data;
};

export const writeBookFile = async (filePath: string, book: BookFile): Promise<void> => {
  const { valid, errors } = validateBookFile(book);
  if (!valid) {
    throw new Error(`Book payload invalid.\n${errors.join('\n')}`);
  }

  await ensureDir(dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(book, null, 2)}\n`, 'utf-8');
};
