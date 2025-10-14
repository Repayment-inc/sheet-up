import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent
} from 'react';
import type { SheetData } from '../types/schema';

interface SheetGridProps {
  sheet: SheetData | null;
  onCommitCell?: (rowKey: string, columnKey: string, value: string) => void;
}

const toColumnLabel = (index: number): string => {
  let idx = index;
  let label = '';

  while (idx >= 0) {
    label = String.fromCharCode((idx % 26) + 65) + label;
    idx = Math.floor(idx / 26) - 1;
  }

  return label;
};

type CellPosition = {
  rowKey: string;
  columnKey: string;
};

const SheetGrid: FC<SheetGridProps> = ({ sheet, onCommitCell }) => {
  const columnLabels = useMemo(() => {
    if (!sheet) return [];
    const count = Math.min(sheet.gridSize.cols, 26);
    return Array.from({ length: count }, (_, idx) => toColumnLabel(idx));
  }, [sheet]);

  const rowNumbers = useMemo(() => {
    if (!sheet) return [];
    const baseCount = Math.min(sheet.gridSize.rows, 30);
    const baseRows = Array.from({ length: baseCount }, (_, idx) => idx + 1);
    const sparseRows = Object.keys(sheet.rows)
      .map((key) => Number.parseInt(key, 10))
      .filter((value) => Number.isFinite(value));
    const merged = new Set<number>([...baseRows, ...sparseRows]);
    return Array.from(merged).sort((a, b) => a - b);
  }, [sheet]);

  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sheet) {
      setSelectedCell(null);
      setEditingCell(null);
      setEditingValue('');
      return;
    }

    if (selectedCell) {
      const rowExists = rowNumbers.includes(Number(selectedCell.rowKey));
      const columnExists = columnLabels.includes(selectedCell.columnKey);
      if (rowExists && columnExists) {
        return;
      }
    }

    const firstRow = rowNumbers[0];
    const firstColumn = columnLabels[0];
    if (firstRow !== undefined && firstColumn) {
      setSelectedCell({ rowKey: String(firstRow), columnKey: firstColumn });
    } else {
      setSelectedCell(null);
    }
    setEditingCell(null);
    setEditingValue('');
  }, [sheet, rowNumbers, columnLabels]);

  useEffect(() => {
    if (editingCell) {
      inputRef.current?.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.focus({ preventScroll: true });
  }, [selectedCell]);

  const startEditing = useCallback(
    (initialValue?: string) => {
      if (!sheet || !selectedCell) return;
      const rowData = sheet.rows[selectedCell.rowKey] ?? {};
      const cellValue = rowData[selectedCell.columnKey]?.value ?? '';
      setEditingCell(selectedCell);
      setEditingValue(
        initialValue !== undefined ? initialValue : cellValue === null ? '' : String(cellValue)
      );
    },
    [sheet, selectedCell]
  );

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const commitEditing = useCallback(() => {
    if (!sheet || !editingCell || !onCommitCell) {
      setEditingCell(null);
      return;
    }
    onCommitCell(editingCell.rowKey, editingCell.columnKey, editingValue);
    setEditingCell(null);
  }, [sheet, editingCell, editingValue, onCommitCell]);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number) => {
      if (!selectedCell || !sheet) return;
      const rowIndex = rowNumbers.findIndex((num) => String(num) === selectedCell.rowKey);
      const colIndex = columnLabels.findIndex((label) => label === selectedCell.columnKey);
      if (rowIndex === -1 || colIndex === -1) return;

      const nextRowIndex = Math.min(Math.max(rowIndex + deltaRow, 0), rowNumbers.length - 1);
      const nextColIndex = Math.min(Math.max(colIndex + deltaCol, 0), columnLabels.length - 1);

      const nextRow = rowNumbers[nextRowIndex];
      const nextCol = columnLabels[nextColIndex];
      if (nextRow !== undefined && nextCol) {
        setSelectedCell({ rowKey: String(nextRow), columnKey: nextCol });
        setEditingCell(null);
      }
    },
    [selectedCell, sheet, rowNumbers, columnLabels]
  );

  const isPrintableKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  };

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!sheet) return;

      if (editingCell) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEditing();
          moveSelection(1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditing();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          moveSelection(-1, 0);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveSelection(1, 0);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          moveSelection(0, -1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveSelection(0, 1);
          break;
        case 'Enter':
          event.preventDefault();
          startEditing();
          break;
        case 'Tab':
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1);
          break;
        case 'Backspace':
        case 'Delete':
          if (selectedCell && onCommitCell) {
            event.preventDefault();
            void onCommitCell(selectedCell.rowKey, selectedCell.columnKey, '');
          }
          break;
        default:
          if (isPrintableKey(event)) {
            event.preventDefault();
            startEditing(event.key);
          }
          break;
      }
    },
    [sheet, editingCell, commitEditing, cancelEditing, moveSelection, startEditing, selectedCell, onCommitCell]
  );

  const handleCellClick = useCallback((rowKey: string, columnKey: string) => {
    setSelectedCell({ rowKey, columnKey });
    setEditingCell(null);
  }, []);

  const handleDoubleClick = useCallback(
    (rowKey: string, columnKey: string) => {
      setSelectedCell({ rowKey, columnKey });
      startEditing();
    },
    [startEditing]
  );

  if (!sheet) {
    return <div className="sheet-grid__empty">シートを選択してください。</div>;
  }

  const getCellDisplayValue = (rowKey: string, columnKey: string): string => {
    const rowData = sheet.rows[rowKey] ?? {};
    const cell = rowData[columnKey];
    if (cell === undefined || cell.value === null) return '';
    return String(cell.value);
  };

  const isSelected = (rowKey: string, columnKey: string): boolean =>
    selectedCell?.rowKey === rowKey && selectedCell?.columnKey === columnKey;

  const isEditing = (rowKey: string, columnKey: string): boolean =>
    editingCell?.rowKey === rowKey && editingCell?.columnKey === columnKey;

  return (
    <div
      className="sheet-grid"
      tabIndex={0}
      role="grid"
      ref={gridRef}
      onKeyDown={handleKeyDown}
    >
      <table className="sheet-grid__table">
        <thead>
          <tr>
            <th className="sheet-grid__corner" />
            {columnLabels.map((label) => (
              <th
                key={label}
                className={`sheet-grid__colHeader${
                  selectedCell?.columnKey === label ? ' sheet-grid__colHeader--active' : ''
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowNumbers.map((rowNumber) => {
            const rowKey = String(rowNumber);
            const rowData = sheet.rows[rowKey] ?? {};
            const rowSelected = selectedCell?.rowKey === rowKey;

            return (
              <tr key={rowNumber}>
                <th className={`sheet-grid__rowHeader${rowSelected ? ' sheet-grid__rowHeader--active' : ''}`}>
                  {rowNumber}
                </th>
                {columnLabels.map((label) => {
                  const value = rowData[label]?.value ?? '';
                  const title = value === '' ? undefined : String(value);
                  const selected = isSelected(rowKey, label);
                  const editing = isEditing(rowKey, label);
                  return (
                    <td
                      key={label}
                      className={`sheet-grid__cell${selected ? ' sheet-grid__cell--selected' : ''}${
                        editing ? ' sheet-grid__cell--editing' : ''
                      }`}
                      title={title}
                      onMouseDown={() => handleCellClick(rowKey, label)}
                      onDoubleClick={() => handleDoubleClick(rowKey, label)}
                    >
                      {editing ? (
                        <input
                          ref={inputRef}
                          className="sheet-grid__cellInput"
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.currentTarget.value)}
                          onBlur={commitEditing}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEditing();
                              moveSelection(1, 0);
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditing();
                            }
                          }}
                        />
                      ) : (
                        getCellDisplayValue(rowKey, label)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {rowNumbers.length === 0 && (
            <tr>
              <td className="sheet-grid__emptyRow" colSpan={columnLabels.length + 1}>
                セルがまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default SheetGrid;
