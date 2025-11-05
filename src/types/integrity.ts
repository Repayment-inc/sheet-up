export type IntegrityIssueType =
  | 'book-id-mismatch'
  | 'missing-active-sheet'
  | 'missing-folder-reference'
  | 'invalid-order';

export type IntegritySeverity = 'error' | 'warning';

export type IntegrityDecisionKey =
  | 'useFile'
  | 'useWorkspace'
  | 'reset'
  | 'normalize'
  | 'defer';

export interface IntegrityIssue {
  id: string;
  type: IntegrityIssueType;
  severity: IntegritySeverity;
  message: string;
  bookRefId?: string;
  bookFileId?: string;
  supportedDecisions: IntegrityDecisionKey[];
  details?: Record<string, unknown>;
}

export type IntegrityIssues = IntegrityIssue[];

export type IntegrityDecisions = Record<string, IntegrityDecisionKey>;
