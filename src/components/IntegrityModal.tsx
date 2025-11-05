import { Fragment, type FC } from 'react';
import type {
  IntegrityDecisions,
  IntegrityDecisionKey,
  IntegrityIssues
} from '../types/integrity';

const severityLabel: Record<'error' | 'warning', string> = {
  error: '重大',
  warning: '警告'
};

const decisionOptions: Partial<
  Record<
    IntegrityDecisionKey,
    {
      label: string;
      description: string;
    }
  >
> = {
  useFile: {
    label: 'ブックファイルに合わせる',
    description: 'workspace.json の ID やメタ情報をブックファイルの内容に揃えます。'
  },
  useWorkspace: {
    label: 'workspace.json を優先',
    description: 'ブックファイルの ID やメタ情報を workspace.json の値に書き戻します。'
  },
  reset: {
    label: 'workspace.json を初期化',
    description: '参照切れの項目をリセットし、安全な初期値に戻します。'
  },
  normalize: {
    label: '並び順を再採番',
    description: '同じフォルダ内の order を 0 から振り直し、重複や欠損を解消します。'
  },
  defer: {
    label: '後で対応する',
    description: '今回は修正しません。必要に応じて後で再チェックしてください。'
  }
};

const defaultDecisionForIssue = (supported: IntegrityDecisionKey[]): IntegrityDecisionKey =>
  supported.includes('defer') ? 'defer' : supported[0];

interface IntegrityModalProps {
  isOpen: boolean;
  issues: IntegrityIssues;
  decisions: IntegrityDecisions;
  onChangeDecision: (issueId: string, decision: IntegrityDecisionKey) => void;
  onApply: () => void;
  onClose: () => void;
  onRefresh?: () => void;
}

/**
 * IntegrityModal.
 * ワークスペースとブックの不整合を一覧表示し、保存前に利用者へ対応方針の選択を促すモーダル。
 * 各 issue ごとの決定と再チェック操作をまとめて扱う。
 */
const IntegrityModal: FC<IntegrityModalProps> = ({
  isOpen,
  issues,
  decisions,
  onChangeDecision,
  onApply,
  onClose,
  onRefresh
}) => {
  if (!isOpen) {
    return null;
  }

  const unresolvedCount = issues.filter((issue) => {
    const selected = decisions[issue.id];
    return !selected || selected === 'defer';
  }).length;

  return (
    <div className="integrity-modal">
      <div className="integrity-modal__backdrop" />
      <div
        className="integrity-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="integrity-modal-title"
      >
        <header className="integrity-modal__header">
          <div>
            <h3 id="integrity-modal-title">整合性チェック</h3>
            <p className="integrity-modal__subtitle">
              workspace.json と各ブックファイルの不整合を確認し、どのように扱うかを選択してください。
            </p>
          </div>
          <div className="integrity-modal__headerActions">
            {onRefresh ? (
              <button type="button" className="integrity-modal__refreshButton" onClick={onRefresh}>
                再チェック
              </button>
            ) : null}
            <button type="button" className="integrity-modal__closeButton" onClick={onClose}>
              閉じる
            </button>
          </div>
        </header>
        <div className="integrity-modal__content">
          {issues.length === 0 ? (
            <p className="integrity-modal__empty">不整合は見つかりませんでした。</p>
          ) : (
            <div className="integrity-modal__issueList">
              {issues.map((issue) => {
                const defaultDecision = defaultDecisionForIssue(issue.supportedDecisions);
                const selected = decisions[issue.id] ?? defaultDecision;
                return (
                  <section key={issue.id} className="integrity-modal__issue">
                    <header className="integrity-modal__issueHeader">
                      <span
                        className={`integrity-modal__severity integrity-modal__severity--${issue.severity}`}
                      >
                        {severityLabel[issue.severity]}
                      </span>
                      <h4 className="integrity-modal__issueTitle">{issue.message}</h4>
                    </header>
                    <ul className="integrity-modal__options">
                      {issue.supportedDecisions.map((decisionKey) => {
                        const option = decisionOptions[decisionKey];
                        if (!option) {
                          return <Fragment key={decisionKey} />;
                        }

                        const isSelected = selected === decisionKey;
                        return (
                          <li key={decisionKey}>
                            <label
                              className={`integrity-modal__option${
                                isSelected ? ' integrity-modal__option--active' : ''
                              }`}
                            >
                              <input
                                type="radio"
                                name={`integrity-decision-${issue.id}`}
                                value={decisionKey}
                                checked={isSelected}
                                onChange={() => onChangeDecision(issue.id, decisionKey)}
                              />
                              <div>
                                <div className="integrity-modal__optionLabel">{option.label}</div>
                                <div className="integrity-modal__optionDescription">
                                  {option.description}
                                </div>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <footer className="integrity-modal__footer">
          <div className="integrity-modal__summary">
            {issues.length === 0
              ? '不整合は見つかりませんでした。閉じるボタンで確認を完了してください。'
              : `未解決 ${unresolvedCount} 件 / 合計 ${issues.length} 件`}
          </div>
          <div className="integrity-modal__footerActions">
            <button type="button" className="integrity-modal__secondaryButton" onClick={onClose}>
              閉じる
            </button>
            <button
              type="button"
              className="integrity-modal__primaryButton"
              onClick={onApply}
              disabled={issues.length === 0}
            >
              選択を適用
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default IntegrityModal;
