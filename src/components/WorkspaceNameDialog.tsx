import { type FC, useEffect, useRef } from 'react';

interface WorkspaceNameDialogProps {
  isOpen: boolean;
  value: string;
  error?: string | null;
  isSubmitting?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const WorkspaceNameDialog: FC<WorkspaceNameDialogProps> = ({
  isOpen,
  value,
  error,
  isSubmitting,
  onChange,
  onSubmit,
  onCancel
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="workspace-dialog">
      <div className="workspace-dialog__backdrop" />
      <div
        className="workspace-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-dialog-title"
      >
        <header className="workspace-dialog__header">
          <h3 id="workspace-dialog-title">新しいワークスペース</h3>
          <p className="workspace-dialog__subtitle">
            ワークスペース名を入力し、保存先フォルダを選択してください。
          </p>
        </header>
        <div className="workspace-dialog__content">
          <label className="workspace-dialog__label" htmlFor="workspace-name-input">
            ワークスペース名
          </label>
          <input
            id="workspace-name-input"
            ref={inputRef}
            type="text"
            className={
              error ? 'workspace-dialog__input workspace-dialog__input--error' : 'workspace-dialog__input'
            }
            placeholder="例: 個人プロジェクト"
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            disabled={isSubmitting}
          />
          {error ? <p className="workspace-dialog__error">{error}</p> : null}
        </div>
        <footer className="workspace-dialog__footer">
          <button
            type="button"
            className="workspace-dialog__secondaryButton"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="workspace-dialog__primaryButton"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '確認中…' : '作成先を選ぶ'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default WorkspaceNameDialog;
