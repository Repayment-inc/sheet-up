import { describe, expect, test } from 'bun:test';
import {
  validateWorkspaceName,
  WORKSPACE_NAME_MAX,
  WORKSPACE_NAME_MIN
} from './workspaceName';

describe('validateWorkspaceName', () => {
  test('ASCII文字だけの名前を受け付ける', () => {
    const result = validateWorkspaceName('Project Alpha');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('Project Alpha');
    expect(result.issues).toHaveLength(0);
  });

  test('マルチバイト文字を受け付ける', () => {
    const result = validateWorkspaceName('表計算チーム');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('表計算チーム');
  });

  test('文字列以外の入力は拒否する', () => {
    const result = validateWorkspaceName(undefined);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('required');
  });

  test('空白だけの文字列は拒否する', () => {
    const result = validateWorkspaceName('   ');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'required')).toBe(true);
  });

  test('上限文字数を超えた名前は拒否する', () => {
    const longName = 'a'.repeat(WORKSPACE_NAME_MAX + 1);
    const result = validateWorkspaceName(longName);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'too_long')).toBe(true);
  });

  test('先頭・末尾の空白やドットを含む名前は拒否する', () => {
    const cases = [
      ' leading blank',
      'trailing blank ',
      '.dotstart',
      'dotend.',
      '.both.',
      ' both ',
      ' mixed. '
    ];

    for (const fileName of cases) {
      const result = validateWorkspaceName(fileName);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((issue) => issue.code === 'leading_trailing_space_or_dot')
    ).toBe(true);
    };
  });

  test('制御文字を含む名前は拒否する', () => {
    const result = validateWorkspaceName('name\u0007');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'control_char')).toBe(true);
  });

  test('禁止記号を含む名前は拒否する', () => {
    const result = validateWorkspaceName('name:name');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'forbidden_char')).toBe(true);
  });

  test('制御文字と禁止記号の両方を含む名前は両方検知する', () => {
    const result = validateWorkspaceName('invalid\n:name');
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('control_char');
    expect(codes).toContain('forbidden_char');
  });

  test('予約語やドットのみの名前は拒否する', () => {
    const dotResult = validateWorkspaceName('..');
    const deviceResult = validateWorkspaceName('CON');
    expect(dotResult.ok).toBe(false);
    expect(deviceResult.ok).toBe(false);
    expect(deviceResult.issues.some((issue) => issue.code === 'reserved_name')).toBe(true);
  });

  test('検証が通れば正規化済みの文字列を返す', () => {
    const name = 'My Workspace';
    const result = validateWorkspaceName(name);
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe(name);
  });

  test('最小文字数違反を検知できる', () => {
    expect(WORKSPACE_NAME_MIN).toBe(1);
    const result = validateWorkspaceName('');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'required')).toBe(true);
  });
});
