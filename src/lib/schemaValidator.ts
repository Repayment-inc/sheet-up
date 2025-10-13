import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import workspaceSchema from '../schemas/workspace.schema.json';
import bookSchema from '../schemas/book.schema.json';
import type { WorkspaceFile, BookFile } from '../types/schema';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const workspaceValidator: ValidateFunction = ajv.compile(workspaceSchema);
const bookValidator: ValidateFunction = ajv.compile(bookSchema);

const formatErrors = (errors: ErrorObject[] | null | undefined): string[] =>
  (errors ?? []).map((err) => {
    const path = err.instancePath || '(root)';
    return `${path} ${err.message ?? ''}`.trim();
  });

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateWorkspaceFile = (data: unknown): ValidationResult => {
  const valid = workspaceValidator(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(workspaceValidator.errors) };
};

export const validateBookFile = (data: unknown): ValidationResult => {
  const valid = bookValidator(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(bookValidator.errors) };
};

export const assertWorkspaceFile = (data: unknown): asserts data is WorkspaceFile => {
  const result = validateWorkspaceFile(data);
  if (!result.valid) {
    throw new Error(`Invalid workspace file.\n${result.errors.join('\n')}`);
  }
};

export const assertBookFile = (data: unknown): asserts data is BookFile => {
  const result = validateBookFile(data);
  if (!result.valid) {
    throw new Error(`Invalid book file.\n${result.errors.join('\n')}`);
  }
};
