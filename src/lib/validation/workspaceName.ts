const RESERVED_DEVICE_NAMES = new Set(
  [
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9'
  ]
);

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const FORBIDDEN_CHAR_PATTERN = /[\\/:*?"<>|]/;

export const WORKSPACE_NAME_MIN = 1;
export const WORKSPACE_NAME_MAX = 48;

export type WorkspaceNameIssueCode =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'leading_trailing_space_or_dot'
  | 'control_char'
  | 'forbidden_char'
  | 'reserved_name';

export interface WorkspaceNameIssue {
  code: WorkspaceNameIssueCode;
  message: string;
}

export interface WorkspaceNameValidationResult {
  ok: boolean;
  normalized?: string;
  issues: WorkspaceNameIssue[];
}

const hasLeadingOrTrailingSpaceOrDot = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }
  const startsWithInvalid = value[0] === '.' || value[0].trim().length === 0;
  const endsWithInvalid = value[value.length - 1] === '.' || value[value.length - 1].trim().length === 0;
  return startsWithInvalid || endsWithInvalid;
};

const isReservedName = (value: string): boolean => {
  if (value === '.' || value === '..') {
    return true;
  }
  return RESERVED_DEVICE_NAMES.has(value.toLowerCase());
};

export const validateWorkspaceName = (input: unknown): WorkspaceNameValidationResult => {
  const issues: WorkspaceNameIssue[] = [];

  if (typeof input !== 'string') {
    return {
      ok: false,
      issues: [
        {
          code: 'required',
          message: '名前を入力してください。'
        }
      ]
    };
  }

  const normalized = input.trim();

  if (normalized.length === 0) {
    issues.push({
      code: 'required',
      message: '名前を入力してください。'
    });
  }

  if (normalized.length > 0 && normalized.length < WORKSPACE_NAME_MIN) {
    issues.push({
      code: 'too_short',
      message: `${WORKSPACE_NAME_MIN}文字以上で入力してください。`
    });
  }

  if (normalized.length > WORKSPACE_NAME_MAX) {
    issues.push({
      code: 'too_long',
      message: `${WORKSPACE_NAME_MAX}文字以内で入力してください。`
    });
  }

  if (hasLeadingOrTrailingSpaceOrDot(input)) {
    issues.push({
      code: 'leading_trailing_space_or_dot',
      message: '先頭と末尾に空白またはドットは使用できません。'
    });
  }

  if (CONTROL_CHAR_PATTERN.test(normalized)) {
    issues.push({
      code: 'control_char',
      message: '制御文字は使用できません。'
    });
  }

  if (FORBIDDEN_CHAR_PATTERN.test(normalized)) {
    issues.push({
      code: 'forbidden_char',
      message: '\\ / : * ? " < > | などの記号は使用できません。'
    });
  }

  if (isReservedName(normalized)) {
    issues.push({
      code: 'reserved_name',
      message: 'この名称はファイルシステムで予約されているため使用できません。'
    });
  }

  return issues.length === 0
    ? { ok: true, normalized, issues }
    : { ok: false, issues };
};
